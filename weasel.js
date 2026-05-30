/* ── Weasel Program ──────────────────────────────────────────── */

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ ";

// Speed index → milliseconds delay between generations
const SPEED_MAP = [800, 400, 160, 60, 16, 0];

/* ── State ───────────────────────────────────────────────────── */
let target       = "";
let current      = "";
let generation   = 0;
let running      = false;
let complete     = false;
let timerId      = null;
let fitnessHistory = [];

/* ── DOM refs ─────────────────────────────────────────────────── */
const targetInput     = document.getElementById("target-input");
const populationInput = document.getElementById("population-input");
const mutationInput   = document.getElementById("mutation-input");
const speedInput      = document.getElementById("speed-input");

const currentDisplay  = document.getElementById("current-display");
const targetDisplay   = document.getElementById("target-display");

const genCount        = document.getElementById("gen-count");
const fitnessBar      = document.getElementById("fitness-bar");
const fitnessLabel    = document.getElementById("fitness-label");
const statusLabel     = document.getElementById("status-label");

const btnPlay         = document.getElementById("btn-play");
const btnStep         = document.getElementById("btn-step");
const btnReset        = document.getElementById("btn-reset");

const populationGrid  = document.getElementById("population-grid");
const popCountLabel   = document.getElementById("pop-count-label");

const historyLog      = document.getElementById("history-log");
const chart           = document.getElementById("fitness-chart");
const ctx             = chart.getContext("2d");

/* ── Algorithm ────────────────────────────────────────────────── */

function randomChar() {
  return CHARSET[Math.floor(Math.random() * CHARSET.length)];
}

function randomString(len) {
  return Array.from({ length: len }, randomChar).join("");
}

function fitness(str) {
  let score = 0;
  for (let i = 0; i < target.length; i++) {
    if (str[i] === target[i]) score++;
  }
  return score;
}

function mutate(str, rate) {
  return str.split("").map(ch =>
    Math.random() < rate ? randomChar() : ch
  ).join("");
}

function evolveOneGeneration() {
  const popSize    = Math.max(2, parseInt(populationInput.value) || 100);
  const mutRate    = (parseFloat(mutationInput.value) || 5) / 100;

  const children   = Array.from({ length: popSize }, () => mutate(current, mutRate));
  const scored     = children.map(c => ({ str: c, score: fitness(c) }));
  scored.sort((a, b) => b.score - a.score);

  const winner     = scored[0];
  // only advance if the child is at least as fit (prevents degradation at low mutation)
  if (winner.score >= fitness(current)) {
    current = winner.str;
  }

  generation++;
  return { scored, winner };
}

/* ── Rendering ─────────────────────────────────────────────────── */

function buildCharSpans(str, reference, animate) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < str.length; i++) {
    const span = document.createElement("span");
    span.className = "char";
    span.textContent = str[i] === " " ? " " : str[i];
    if (str[i] === " ") span.classList.add("space");

    const isMatch = str[i] === reference[i];
    if (isMatch) {
      span.classList.add("matched");
      if (animate) span.classList.add("flash");
    } else {
      span.classList.add("unmatched");
    }
    frag.appendChild(span);
  }
  return frag;
}

function renderCurrentString(prevStr) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < current.length; i++) {
    const span = document.createElement("span");
    span.className = "char";
    span.textContent = current[i] === " " ? " " : current[i];
    if (current[i] === " ") span.classList.add("space");

    const isMatch = current[i] === target[i];
    const changed  = prevStr && current[i] !== prevStr[i];

    if (isMatch) {
      span.classList.add("matched");
      if (changed) span.classList.add("flash");
    } else {
      span.classList.add("unmatched");
    }
    frag.appendChild(span);
  }
  currentDisplay.innerHTML = "";
  currentDisplay.appendChild(frag);
}

function renderTargetString() {
  targetDisplay.innerHTML = "";
  targetDisplay.appendChild(buildCharSpans(target, target, false));
}

function renderStats() {
  const score = fitness(current);
  const pct   = target.length > 0 ? (score / target.length) * 100 : 0;
  genCount.textContent    = generation.toLocaleString();
  fitnessLabel.textContent = `${score} / ${target.length}`;
  fitnessBar.style.width  = `${pct}%`;
  fitnessBar.classList.toggle("complete", score === target.length);
}

function renderPopulation(scored) {
  const display = scored.slice(0, 20);
  popCountLabel.textContent = `(showing ${display.length} of ${scored.length})`;
  populationGrid.innerHTML  = "";

  display.forEach((item, idx) => {
    const row   = document.createElement("div");
    row.className = "pop-row" + (idx === 0 ? " is-winner" : "");

    const scoreSpan = document.createElement("span");
    scoreSpan.className   = "pop-score";
    scoreSpan.textContent = `${item.score}/${target.length}`;
    row.appendChild(scoreSpan);

    for (let i = 0; i < item.str.length; i++) {
      const ch = document.createElement("span");
      ch.className = "pop-char";
      ch.textContent = item.str[i] === " " ? " " : item.str[i];
      if (item.str[i] === target[i]) {
        ch.classList.add("matched");
        if (idx === 0) ch.classList.add("winner-char");
      }
      row.appendChild(ch);
    }
    populationGrid.appendChild(row);
  });
}

function addHistoryEntry() {
  const score  = fitness(current);
  const entry  = document.createElement("div");
  entry.className = "history-entry";

  const genSpan = document.createElement("span");
  genSpan.className   = "hist-gen";
  genSpan.textContent = `#${generation.toLocaleString()}`;

  const strSpan = document.createElement("span");
  strSpan.className = "hist-str";
  for (let i = 0; i < current.length; i++) {
    const ch = document.createElement("span");
    ch.className   = "hist-char" + (current[i] === target[i] ? " matched" : "");
    ch.textContent = current[i] === " " ? " " : current[i];
    strSpan.appendChild(ch);
  }

  const scoreSpan = document.createElement("span");
  scoreSpan.className   = "hist-score";
  scoreSpan.textContent = `${score}/${target.length}`;

  entry.appendChild(genSpan);
  entry.appendChild(strSpan);
  entry.appendChild(scoreSpan);

  historyLog.prepend(entry);

  // cap history to 200 entries
  while (historyLog.children.length > 200) {
    historyLog.removeChild(historyLog.lastChild);
  }
}

/* ── Chart ─────────────────────────────────────────────────────── */

function resizeChart() {
  chart.width  = chart.offsetWidth * window.devicePixelRatio;
  chart.height = chart.offsetHeight * window.devicePixelRatio;
}

function drawChart() {
  resizeChart();
  const w  = chart.width;
  const h  = chart.height;
  const dpr = window.devicePixelRatio;

  ctx.clearRect(0, 0, w, h);

  // background
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, w, h);

  if (fitnessHistory.length < 2) return;

  const maxScore = target.length;
  const pad = { top: 10 * dpr, right: 10 * dpr, bottom: 24 * dpr, left: 36 * dpr };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top  - pad.bottom;

  // grid lines
  ctx.strokeStyle = "#30363d";
  ctx.lineWidth   = dpr;
  [0, 0.25, 0.5, 0.75, 1].forEach(frac => {
    const y = pad.top + plotH * (1 - frac);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();

    ctx.fillStyle  = "#8b949e";
    ctx.font       = `${10 * dpr}px sans-serif`;
    ctx.textAlign  = "right";
    ctx.fillText(Math.round(frac * maxScore), pad.left - 4 * dpr, y + 4 * dpr);
  });

  // line
  ctx.beginPath();
  ctx.strokeStyle = "#3fb950";
  ctx.lineWidth   = 2 * dpr;
  ctx.lineJoin    = "round";

  fitnessHistory.forEach((score, i) => {
    const x = pad.left + (i / (fitnessHistory.length - 1)) * plotW;
    const y = pad.top  + plotH * (1 - score / maxScore);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // fill under
  ctx.lineTo(pad.left + plotW, pad.top + plotH);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
  grad.addColorStop(0,   "rgba(63,185,80,.35)");
  grad.addColorStop(1,   "rgba(63,185,80,0)");
  ctx.fillStyle = grad;
  ctx.fill();
}

/* ── Simulation loop ──────────────────────────────────────────── */

function step() {
  if (complete) return;

  const prev            = current;
  const { scored }      = evolveOneGeneration();
  const score           = fitness(current);
  const isComplete      = score === target.length;

  fitnessHistory.push(score);
  if (fitnessHistory.length > 2000) {
    // downsample to keep chart manageable
    fitnessHistory = fitnessHistory.filter((_, i) => i % 2 === 0);
  }

  renderCurrentString(prev);
  renderStats();
  renderPopulation(scored);
  drawChart();

  // only log to history every N generations (keeps it readable)
  const logInterval = generation <= 20 ? 1 : generation <= 100 ? 5 : generation <= 1000 ? 20 : 100;
  if (generation % logInterval === 0 || isComplete) {
    addHistoryEntry();
  }

  if (isComplete) {
    complete = true;
    stop();
    statusLabel.textContent = `Done in ${generation.toLocaleString()} generations`;
    return;
  }

  statusLabel.textContent = "Running…";
}

function tick() {
  step();
  if (!complete && running) {
    const delay = SPEED_MAP[parseInt(speedInput.value)] || 0;
    if (delay === 0) {
      // batch several steps per animation frame at max speed
      timerId = requestAnimationFrame(batchTick);
    } else {
      timerId = setTimeout(tick, delay);
    }
  }
}

function batchTick() {
  // run multiple generations per frame when delay === 0
  const BATCH = 50;
  for (let i = 0; i < BATCH && !complete; i++) {
    const prev         = current;
    const { scored }   = evolveOneGeneration();
    const score        = fitness(current);
    fitnessHistory.push(score);
  }
  renderCurrentString(null);
  renderStats();
  drawChart();

  if (!complete) {
    const score = fitness(current);
    if (score === target.length) {
      complete = true;
      stop();
      statusLabel.textContent = `Done in ${generation.toLocaleString()} generations`;
      addHistoryEntry();
      renderPopulation([]);
      return;
    }
  }

  if (running) timerId = requestAnimationFrame(batchTick);
}

function start() {
  if (complete) return;
  running = true;
  btnPlay.textContent  = "Pause";
  btnStep.disabled     = true;
  statusLabel.textContent = "Running…";

  const delay = SPEED_MAP[parseInt(speedInput.value)] || 0;
  if (delay === 0) {
    timerId = requestAnimationFrame(batchTick);
  } else {
    timerId = setTimeout(tick, delay);
  }
}

function stop() {
  running = false;
  btnPlay.textContent  = "Play";
  btnStep.disabled     = complete;
  if (!complete) statusLabel.textContent = "Paused";
  if (timerId) {
    clearTimeout(timerId);
    cancelAnimationFrame(timerId);
    timerId = null;
  }
}

function reset() {
  stop();
  target         = targetInput.value.toUpperCase().replace(/[^A-Z ]/g, "");
  targetInput.value = target;
  current        = randomString(target.length);
  generation     = 0;
  complete       = false;
  fitnessHistory = [fitness(current)];

  renderCurrentString(null);
  renderTargetString();
  renderStats();
  populationGrid.innerHTML = "";
  historyLog.innerHTML     = "";
  statusLabel.textContent  = "Ready";
  btnPlay.disabled         = false;
  btnStep.disabled         = false;
  btnPlay.textContent      = "Play";
  addHistoryEntry();
  drawChart();
}

/* ── Event listeners ──────────────────────────────────────────── */

btnPlay.addEventListener("click", () => {
  if (running) stop(); else start();
});

btnStep.addEventListener("click", () => {
  if (!running && !complete) {
    step();
    statusLabel.textContent = "Paused";
  }
});

btnReset.addEventListener("click", reset);

targetInput.addEventListener("change", reset);

window.addEventListener("resize", drawChart);

/* ── Init ─────────────────────────────────────────────────────── */
reset();
