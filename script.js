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

const statusText = document.getElementById("statusText");
const timerText = document.getElementById("timerText");
const mainButton = document.getElementById("mainButton");
const mainButtonImage = document.getElementById("mainButtonImage");
const mainButtonText = document.getElementById("mainButtonText");
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

async function playMusic() {
  try {
    await lofiAudio.play();
  } catch (error) {
    // If playback fails, keep timer behavior unchanged.
  }
}

function pauseMusic() {
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

mainButton.addEventListener("click", handleMainButtonClick);

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

loadTracker();
loadTodos();
resetAll();
