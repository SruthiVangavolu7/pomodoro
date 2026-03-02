const STATES = {
  IDLE: "IDLE",
  WORK: "WORK",
  BREAK: "BREAK",
  COMPLETE: "COMPLETE",
};

const workDuration = 25 * 60;
const breakDuration = 5 * 60;
const maxRounds = 4;
const trackerStorageKey = "pomodoro_tracker_entries";
const todoStorageKey = "pomodoro_todo_entries";

// Set your Spotify app client ID here before using Change Music.
const SPOTIFY_CLIENT_ID = "a7bea2fb1297462eb4922c063e481582";
// Must exactly match one Redirect URI configured in your Spotify app settings.
// Uses the current page URL so it works on deployed domains like Vercel.
const SPOTIFY_REDIRECT_URI = `${window.location.origin}${window.location.pathname}`;
const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
];
const spotifyTokenStorageKey = "spotify_token_data";
const spotifyCodeVerifierKey = "spotify_code_verifier";

const statusText = document.getElementById("statusText");
const timerText = document.getElementById("timerText");
const mainButton = document.getElementById("mainButton");
const mainButtonImage = document.getElementById("mainButtonImage");
const mainButtonText = document.getElementById("mainButtonText");
const changeMusicButton = document.getElementById("changeMusicButton");
const trackerList = document.getElementById("trackerList");
const todoForm = document.getElementById("todoForm");
const todoInput = document.getElementById("todoInput");
const todoList = document.getElementById("todoList");
const boomboxImage = document.getElementById("boomboxImage");
const boomboxWrap = document.querySelector(".boombox-wrap");
const lofiAudio = document.getElementById("lofiAudio");

const images = {
  idle: "boombox.PNG",
  playing: ["music1.PNG", "music2.PNG"],
};

const buttonAssets = {
  start: "start.PNG",
  pause: "pause.PNG",
};

let currentState = STATES.IDLE;
let currentRound = 0;
let timerId = null;
let imageAnimId = null;
let targetEndTime = null;
let remainingTime = workDuration;
let isPaused = false;
let trackerEntries = [];
let todoEntries = [];

let spotifyAccessToken = "";
let spotifyRefreshToken = "";
let spotifyExpiresAt = 0;
let spotifyMode = false;
let spotifyPlayer = null;
let spotifyDeviceId = "";
let spotifySdkReadyPromise = null;

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

function updateTimerDisplay(seconds = remainingTime) {
  timerText.textContent = formatTime(seconds);
}

function setMainButtonToImage(type) {
  const source = type === "PAUSE" ? buttonAssets.pause : buttonAssets.start;
  mainButton.classList.remove("text-mode");
  mainButtonImage.classList.remove("hidden");
  mainButtonImage.src = source;
  mainButtonText.classList.add("visually-hidden");
  mainButtonText.textContent = type;
  mainButton.setAttribute("aria-label", type);
}

function setMainButtonToText(label) {
  mainButton.classList.add("text-mode");
  mainButtonImage.classList.add("hidden");
  mainButtonText.classList.remove("visually-hidden");
  mainButtonText.textContent = label;
  mainButton.setAttribute("aria-label", label);
}

function saveTracker() {
  localStorage.setItem(trackerStorageKey, JSON.stringify(trackerEntries));
}

function clearTrackerStorage() {
  localStorage.removeItem(trackerStorageKey);
}

function renderTracker() {
  trackerList.innerHTML = "";

  trackerEntries.forEach((entry) => {
    const li = document.createElement("li");
    li.className = "tracker-item";

    const title = document.createElement("span");
    title.className = "tracker-item-title";
    title.textContent =
      entry.status === "in_progress"
        ? `round ${entry.round} in progress...`
        : `round ${entry.round} complete!`;

    li.appendChild(title);
    trackerList.appendChild(li);
  });
}

function loadTracker() {
  try {
    const parsed = JSON.parse(localStorage.getItem(trackerStorageKey) || "[]");
    if (Array.isArray(parsed)) {
      trackerEntries = parsed
        .filter((item) => Number(item.round))
        .map((item) => ({
          round: Number(item.round),
          status: item.status === "complete" ? "complete" : "in_progress",
        }));
      renderTracker();
    }
  } catch (error) {
    trackerEntries = [];
    clearTrackerStorage();
  }
}

function clearTracker() {
  trackerEntries = [];
  clearTrackerStorage();
  renderTracker();
}

function ensureRoundInProgress(roundNumber) {
  const existing = trackerEntries.find((item) => item.round === roundNumber);
  if (existing) {
    existing.status = "in_progress";
  } else {
    trackerEntries.push({ round: roundNumber, status: "in_progress" });
  }

  saveTracker();
  renderTracker();
}

function logCompletedRound(roundNumber) {
  const existing = trackerEntries.find((item) => item.round === roundNumber);
  if (existing) {
    existing.status = "complete";
  } else {
    trackerEntries.push({ round: roundNumber, status: "complete" });
  }

  saveTracker();
  renderTracker();
}

function saveTodos() {
  localStorage.setItem(todoStorageKey, JSON.stringify(todoEntries));
}

function loadTodos() {
  try {
    const parsed = JSON.parse(localStorage.getItem(todoStorageKey) || "[]");
    if (Array.isArray(parsed)) {
      todoEntries = parsed.map((item) => ({
        id: Number(item.id) || Date.now() + Math.floor(Math.random() * 1000),
        text: String(item.text || "").trim(),
        completed: Boolean(item.completed),
      }));
      renderTodos();
    }
  } catch (error) {
    todoEntries = [];
    localStorage.removeItem(todoStorageKey);
  }
}

function renderTodos() {
  todoList.innerHTML = "";

  todoEntries.forEach((item) => {
    const li = document.createElement("li");
    li.className = "todo-item";
    li.dataset.id = String(item.id);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "todo-checkbox";
    checkbox.checked = item.completed;
    checkbox.setAttribute("aria-label", "toggle task completion");

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.className = `todo-text${item.completed ? " completed" : ""}`;
    textInput.value = item.text;
    textInput.readOnly = true;
    textInput.setAttribute("aria-label", "task text");

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "todo-action";
    editButton.dataset.action = "edit";
    editButton.textContent = "edit";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "todo-action";
    deleteButton.dataset.action = "delete";
    deleteButton.textContent = "x";

    li.appendChild(checkbox);
    li.appendChild(textInput);
    li.appendChild(editButton);
    li.appendChild(deleteButton);
    todoList.appendChild(li);
  });
}

function addTodo(text) {
  const clean = text.trim();
  if (!clean) {
    return;
  }

  todoEntries.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    text: clean,
    completed: false,
  });

  saveTodos();
  renderTodos();
}

function toggleTodo(id, completed) {
  const todo = todoEntries.find((item) => item.id === id);
  if (!todo) {
    return;
  }

  todo.completed = completed;
  saveTodos();
  renderTodos();
}

function deleteTodo(id) {
  todoEntries = todoEntries.filter((item) => item.id !== id);
  saveTodos();
  renderTodos();
}

function beginEditTodo(itemNode) {
  const textInput = itemNode.querySelector(".todo-text");
  const editButton = itemNode.querySelector("[data-action='edit']");
  if (!textInput || !editButton) {
    return;
  }

  itemNode.classList.add("editing");
  textInput.readOnly = false;
  textInput.focus();
  textInput.setSelectionRange(textInput.value.length, textInput.value.length);
  editButton.dataset.action = "save";
  editButton.textContent = "save";
}

function saveEditedTodo(itemNode) {
  const id = Number(itemNode.dataset.id);
  const textInput = itemNode.querySelector(".todo-text");
  if (!textInput) {
    return;
  }

  const nextText = textInput.value.trim();
  if (!nextText) {
    deleteTodo(id);
    return;
  }

  const todo = todoEntries.find((item) => item.id === id);
  if (!todo) {
    return;
  }

  todo.text = nextText;
  saveTodos();
  renderTodos();
}

function setBoomboxStateIdle() {
  boomboxWrap.classList.remove("playing");
  boomboxImage.src = images.idle;
  stopPlayingImageSwap();
}

function startPlayingImageSwap() {
  stopPlayingImageSwap();

  const playFrames = images.playing.filter(Boolean);
  if (playFrames.length === 0) {
    boomboxImage.src = images.idle;
    return;
  }

  let index = 0;
  boomboxImage.src = playFrames[index];

  if (playFrames.length === 1) {
    return;
  }

  imageAnimId = window.setInterval(() => {
    index = (index + 1) % playFrames.length;
    boomboxImage.src = playFrames[index];
  }, 1000);
}

function stopPlayingImageSwap() {
  if (imageAnimId) {
    clearInterval(imageAnimId);
    imageAnimId = null;
  }
}

function setBoomboxStatePlaying() {
  boomboxWrap.classList.add("playing");
  startPlayingImageSwap();
}

function isSpotifyConfigured() {
  return SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_ID !== "YOUR_SPOTIFY_CLIENT_ID";
}

function generateRandomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function base64UrlEncode(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let string = "";
  bytes.forEach((byte) => {
    string += String.fromCharCode(byte);
  });
  return btoa(string).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createCodeChallenge(verifier) {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  return base64UrlEncode(digest);
}

function saveSpotifyTokenData(data) {
  spotifyAccessToken = data.access_token || spotifyAccessToken;
  if (data.refresh_token) {
    spotifyRefreshToken = data.refresh_token;
  }
  spotifyExpiresAt = Date.now() + (Number(data.expires_in || 3600) - 30) * 1000;

  localStorage.setItem(
    spotifyTokenStorageKey,
    JSON.stringify({
      accessToken: spotifyAccessToken,
      refreshToken: spotifyRefreshToken,
      expiresAt: spotifyExpiresAt,
    }),
  );
}

function loadSpotifyTokenData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(spotifyTokenStorageKey) || "{}");
    spotifyAccessToken = String(parsed.accessToken || "");
    spotifyRefreshToken = String(parsed.refreshToken || "");
    spotifyExpiresAt = Number(parsed.expiresAt || 0);
  } catch (error) {
    spotifyAccessToken = "";
    spotifyRefreshToken = "";
    spotifyExpiresAt = 0;
    localStorage.removeItem(spotifyTokenStorageKey);
  }
}

function clearSpotifyTokenData() {
  spotifyAccessToken = "";
  spotifyRefreshToken = "";
  spotifyExpiresAt = 0;
  spotifyMode = false;
  localStorage.removeItem(spotifyTokenStorageKey);
}

async function redirectToSpotifyLogin() {
  if (!isSpotifyConfigured()) {
    alert("Set SPOTIFY_CLIENT_ID in script.js before using Change Music.");
    return;
  }

  const verifier = generateRandomString(64);
  const challenge = await createCodeChallenge(verifier);
  localStorage.setItem(spotifyCodeVerifierKey, verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
    show_dialog: "true",
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function exchangeSpotifyCodeForToken(code) {
  const verifier = localStorage.getItem(spotifyCodeVerifierKey);
  if (!verifier) {
    return false;
  }

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_verifier: verifier,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  saveSpotifyTokenData(data);
  localStorage.removeItem(spotifyCodeVerifierKey);
  return true;
}

async function refreshSpotifyToken() {
  if (!spotifyRefreshToken) {
    return false;
  }

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: spotifyRefreshToken,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    clearSpotifyTokenData();
    return false;
  }

  const data = await response.json();
  saveSpotifyTokenData(data);
  return true;
}

async function ensureSpotifyAccessToken() {
  if (!isSpotifyConfigured()) {
    return false;
  }

  if (!spotifyAccessToken) {
    return false;
  }

  if (Date.now() < spotifyExpiresAt) {
    return true;
  }

  return refreshSpotifyToken();
}

function waitForSpotifySdk() {
  if (spotifySdkReadyPromise) {
    return spotifySdkReadyPromise;
  }

  spotifySdkReadyPromise = new Promise((resolve, reject) => {
    if (window.Spotify) {
      resolve();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      reject(new Error("Spotify SDK did not load."));
    }, 12000);

    window.onSpotifyWebPlaybackSDKReady = () => {
      clearTimeout(timeoutId);
      resolve();
    };
  });

  return spotifySdkReadyPromise;
}

async function spotifyApiRequest(path, method = "GET", body = null, allowRetry = true) {
  const hasToken = await ensureSpotifyAccessToken();
  if (!hasToken) {
    return null;
  }

  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${spotifyAccessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && allowRetry) {
    const refreshed = await refreshSpotifyToken();
    if (refreshed) {
      return spotifyApiRequest(path, method, body, false);
    }
  }

  return response;
}

async function connectSpotifyPlayer() {
  const hasToken = await ensureSpotifyAccessToken();
  if (!hasToken) {
    return false;
  }

  try {
    await waitForSpotifySdk();
  } catch (error) {
    return false;
  }

  if (!spotifyPlayer) {
    spotifyPlayer = new Spotify.Player({
      name: "Pomodoro Boombox",
      getOAuthToken: (callback) => callback(spotifyAccessToken),
      volume: 0.85,
    });

    spotifyPlayer.addListener("ready", ({ device_id: deviceId }) => {
      spotifyDeviceId = deviceId;
    });

    spotifyPlayer.addListener("authentication_error", () => {
      clearSpotifyTokenData();
    });

    spotifyPlayer.addListener("account_error", () => {
      alert("Spotify Premium is required for in-browser playback.");
      spotifyMode = false;
    });
  }

  const connected = await spotifyPlayer.connect();
  if (!connected) {
    return false;
  }

  if (typeof spotifyPlayer.activateElement === "function") {
    spotifyPlayer.activateElement();
  }

  spotifyMode = true;
  return true;
}

async function transferSpotifyPlayback(play = false) {
  if (!spotifyDeviceId) {
    return false;
  }

  const response = await spotifyApiRequest("/me/player", "PUT", {
    device_ids: [spotifyDeviceId],
    play,
  });

  return Boolean(response && (response.ok || response.status === 204));
}

async function playSpotifyMusic() {
  const connected = await connectSpotifyPlayer();
  if (!connected) {
    return false;
  }

  await transferSpotifyPlayback(false);

  if (!spotifyDeviceId) {
    return false;
  }

  const response = await spotifyApiRequest(
    `/me/player/play?device_id=${encodeURIComponent(spotifyDeviceId)}`,
    "PUT",
  );

  return Boolean(response && (response.ok || response.status === 204));
}

async function pauseSpotifyMusic() {
  if (!spotifyMode) {
    return;
  }

  await spotifyApiRequest("/me/player/pause", "PUT");
}

async function playMusic() {
  if (spotifyMode) {
    const started = await playSpotifyMusic();
    if (started) {
      lofiAudio.pause();
      return;
    }
  }

  try {
    await lofiAudio.play();
  } catch (error) {
    // If autoplay is blocked, keep timer running silently.
  }
}

function pauseMusic() {
  if (spotifyMode) {
    pauseSpotifyMusic();
  }
  lofiAudio.pause();
}

function clearTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function startCountdown(seconds, onComplete) {
  clearTimer();
  remainingTime = seconds;
  targetEndTime = Date.now() + seconds * 1000;
  updateTimerDisplay(remainingTime);

  timerId = window.setInterval(() => {
    const secondsLeft = Math.ceil((targetEndTime - Date.now()) / 1000);
    remainingTime = Math.max(0, secondsLeft);
    updateTimerDisplay(remainingTime);

    if (remainingTime <= 0) {
      clearTimer();
      onComplete();
    }
  }, 250);
}

function pauseCurrentTimer() {
  if (isPaused || currentState === STATES.IDLE || currentState === STATES.COMPLETE) {
    return;
  }

  if (targetEndTime) {
    remainingTime = Math.max(0, Math.ceil((targetEndTime - Date.now()) / 1000));
  }

  isPaused = true;
  clearTimer();
  pauseMusic();
  setBoomboxStateIdle();
  statusText.textContent = "...";
  setMainButtonToImage("START");
}

function resumeCurrentTimer() {
  if (!isPaused) {
    return;
  }

  isPaused = false;
  if (currentState === STATES.BREAK) {
    setMainButtonToText("SKIP BREAK");
  } else {
    statusText.textContent = "keep working!";
    setBoomboxStatePlaying();
    setMainButtonToImage("PAUSE");
  }

  startCountdown(remainingTime, () => {
    if (currentState === STATES.WORK) {
      handleWorkComplete();
      return;
    }

    if (currentState === STATES.BREAK) {
      finishCycle();
    }
  });

  if (currentState === STATES.WORK) {
    playMusic();
  }
}

function setIdleUI() {
  statusText.textContent = "ready to start?";
  setMainButtonToImage("START");
  setBoomboxStateIdle();
  pauseMusic();
  updateTimerDisplay(workDuration);
}

function startWorkSession() {
  currentState = STATES.WORK;
  isPaused = false;
  ensureRoundInProgress(currentRound + 1);
  statusText.textContent = "keep working!";
  setMainButtonToImage("PAUSE");
  setBoomboxStatePlaying();
  playMusic();

  startCountdown(workDuration, handleWorkComplete);
}

function startBreak() {
  currentState = STATES.BREAK;
  isPaused = false;
  statusText.textContent = "break time :)";
  setMainButtonToText("SKIP BREAK");
  setBoomboxStateIdle();
  pauseMusic();

  startCountdown(breakDuration, finishCycle);
}

function handleWorkComplete() {
  const roundDone = currentRound + 1;
  logCompletedRound(roundDone);
  startBreak();
}

function finishCycle() {
  currentRound += 1;

  if (currentRound >= maxRounds) {
    currentState = STATES.COMPLETE;
    clearTimer();
    pauseMusic();
    setBoomboxStateIdle();
    statusText.textContent = "wanna go again?";
    setMainButtonToImage("START");
    currentRound = 0;
    remainingTime = workDuration;
    updateTimerDisplay(workDuration);
    clearTracker();
    return;
  }

  startWorkSession();
}

function resetAll() {
  clearTimer();
  stopPlayingImageSwap();
  currentState = STATES.IDLE;
  currentRound = 0;
  remainingTime = workDuration;
  targetEndTime = null;
  isPaused = false;
  setIdleUI();
}

function handleMainButtonClick() {
  if (spotifyMode && spotifyPlayer && typeof spotifyPlayer.activateElement === "function") {
    spotifyPlayer.activateElement();
  }

  if (currentState === STATES.IDLE || currentState === STATES.COMPLETE) {
    startWorkSession();
    return;
  }

  if (isPaused) {
    resumeCurrentTimer();
    return;
  }

  if (currentState === STATES.WORK) {
    pauseCurrentTimer();
    return;
  }

  if (currentState === STATES.BREAK) {
    clearTimer();
    finishCycle();
  }
}

async function handleChangeMusicClick() {
  if (!isSpotifyConfigured()) {
    alert("Open script.js and set SPOTIFY_CLIENT_ID to your Spotify app client ID first.");
    return;
  }

  const hasToken = await ensureSpotifyAccessToken();
  if (!hasToken) {
    await redirectToSpotifyLogin();
    return;
  }

  const connected = await connectSpotifyPlayer();
  spotifyMode = connected;
  window.open("https://open.spotify.com/", "_blank", "noopener");

  if (!connected) {
    alert("Spotify connected failed. Check that you are Premium and try again.");
  }
}

async function handleSpotifyAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  const code = params.get("code");

  if (!error && !code) {
    return;
  }

  window.history.replaceState({}, document.title, SPOTIFY_REDIRECT_URI);

  if (error) {
    return;
  }

  const success = await exchangeSpotifyCodeForToken(code);
  if (!success) {
    return;
  }

  const connected = await connectSpotifyPlayer();
  spotifyMode = connected;
  if (connected) {
    window.open("https://open.spotify.com/", "_blank", "noopener");
  }
}

mainButton.addEventListener("click", handleMainButtonClick);
changeMusicButton.addEventListener("click", handleChangeMusicClick);

todoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addTodo(todoInput.value);
  todoInput.value = "";
});

todoList.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  if (!target.classList.contains("todo-checkbox")) {
    return;
  }

  const itemNode = target.closest(".todo-item");
  if (!itemNode) {
    return;
  }

  toggleTodo(Number(itemNode.dataset.id), target.checked);
});

todoList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const itemNode = target.closest(".todo-item");
  if (!itemNode) {
    return;
  }

  const itemId = Number(itemNode.dataset.id);

  if (target.dataset.action === "delete") {
    deleteTodo(itemId);
    return;
  }

  if (target.dataset.action === "edit") {
    beginEditTodo(itemNode);
    return;
  }

  if (target.dataset.action === "save") {
    saveEditedTodo(itemNode);
  }
});

todoList.addEventListener("keydown", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.classList.contains("todo-text")) {
    return;
  }

  if (event.key !== "Enter") {
    return;
  }

  const itemNode = target.closest(".todo-item");
  if (!itemNode) {
    return;
  }

  saveEditedTodo(itemNode);
});

window.addEventListener("beforeunload", () => {
  pauseMusic();
});

async function initApp() {
  loadSpotifyTokenData();
  await handleSpotifyAuthCallback();
  loadTracker();
  loadTodos();
  resetAll();
}

initApp();
