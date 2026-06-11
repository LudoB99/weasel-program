/* ── Weasel Program ──────────────────────────────────────────── */
"use strict";

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ ";

const LIMITS = {
  targetMinLen:  1,
  targetMaxLen:  60,
  popMin:        2,
  popMax:        1000,
  mutMin:        1,
  mutMax:        50,
  maxGenerations: 50000,
};

// Speed index → milliseconds delay between generations
const SPEED_MAP   = [800, 400, 160, 60, 16, 0];
const SPEED_NAMES = ["Slowest", "Slow", "Normal", "Fast", "Faster", "Max"];

// ms of work per frame at max speed before yielding back to the browser
const FRAME_BUDGET_MS = 12;

/* ── State ───────────────────────────────────────────────────── */
let target       = "";
let current      = "";
let currentScore = 0;
let generation   = 0;
let running      = false;
let complete     = false;
let timerId      = null;
let rafId        = null;
let history      = [];   // [{ g: generation, s: score }]

/* ── DOM refs ─────────────────────────────────────────────────── */
const targetInput     = document.getElementById("target-input");
const populationInput = document.getElementById("population-input");
const mutationInput   = document.getElementById("mutation-input");
const speedInput      = document.getElementById("speed-input");
const speedValue      = document.getElementById("speed-value");

const stageEl         = document.getElementById("stage");
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
  return CHARSET[(Math.random() * CHARSET.length) | 0];
}

function randomString(len) {
  let s = "";
  for (let i = 0; i < len; i++) s += randomChar();
  return s;
}

function fitness(str) {
  let score = 0;
  for (let i = 0; i < target.length; i++) {
    if (str[i] === target[i]) score++;
  }
  return score;
}

function mutate(str, rate) {
  let out = "";
  for (let i = 0; i < str.length; i++) {
    out += Math.random() < rate ? randomChar() : str[i];
  }
  return out;
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function readParams() {
  return {
    popSize: clamp(parseInt(populationInput.value, 10) || 100, LIMITS.popMin, LIMITS.popMax),
    mutRate: clamp(parseFloat(mutationInput.value) || 5, LIMITS.mutMin, LIMITS.mutMax) / 100,
  };
}

// collectPopulation: when true, returns the scored children sorted best-first
// (only needed when the population panel will actually be rendered)
function evolveOneGeneration(collectPopulation) {
  const { popSize, mutRate } = readParams();

  let bestStr   = current;
  let bestScore = -1;
  const scored  = collectPopulation ? [] : null;

  for (let i = 0; i < popSize; i++) {
    const child = mutate(current, mutRate);
    const score = fitness(child);
    if (score > bestScore) {
      bestScore = score;
      bestStr   = child;
    }
    if (scored) scored.push({ str: child, score });
  }

  // only advance if the child is at least as fit (prevents degradation at low mutation)
  if (bestScore >= currentScore) {
    current      = bestStr;
    currentScore = bestScore;
  }

  generation++;
  if (scored) scored.sort((a, b) => b.score - a.score);
  return scored;
}

function pushHistoryPoint() {
  history.push({ g: generation, s: currentScore });
  if (history.length > 4000) {
    const last = history.length - 1;
    history = history.filter((_, i) => i % 2 === 0 || i === last);
  }
}

/* ── Rendering ─────────────────────────────────────────────────── */

let currentSpans = [];

function buildSpans(container, len) {
  container.innerHTML = "";
  const spans = [];
  const frag  = document.createDocumentFragment();
  for (let i = 0; i < len; i++) {
    const span = document.createElement("span");
    span.className = "char";
    frag.appendChild(span);
    spans.push(span);
  }
  container.appendChild(frag);
  return spans;
}

// Updates existing spans in place instead of rebuilding the DOM each generation
function renderCurrentString(prevStr) {
  for (let i = 0; i < current.length; i++) {
    const span = currentSpans[i];
    const ch   = current[i];
    if (span.textContent !== ch) span.textContent = ch;

    const isMatch = ch === target[i];
    const changed = prevStr !== null && ch !== prevStr[i];

    let cls = "char";
    if (ch === " ") cls += " space";
    cls += isMatch ? " matched" : " unmatched";

    if (isMatch && changed) {
      span.className = cls;
      void span.offsetWidth; // restart the flash animation
      span.className = cls + " flash";
    } else if (span.className !== cls && span.className !== cls + " flash") {
      span.className = cls;
    }
  }
}

function renderTargetString() {
  const spans = buildSpans(targetDisplay, target.length);
  for (let i = 0; i < target.length; i++) {
    spans[i].textContent = target[i];
    spans[i].className   = "char matched" + (target[i] === " " ? " space" : "");
  }
}

function renderStats() {
  const pct = target.length > 0 ? (currentScore / target.length) * 100 : 0;
  genCount.textContent     = generation.toLocaleString();
  fitnessLabel.textContent = `${currentScore} / ${target.length}`;
  fitnessBar.style.width   = `${pct}%`;
  fitnessBar.classList.toggle("complete", currentScore === target.length);
}

// Strings only ever contain CHARSET characters (A–Z and space), so
// building innerHTML directly is safe and much faster than per-span DOM calls.
function renderPopulation(scored) {
  const display = scored.slice(0, 20);
  popCountLabel.textContent = `(showing ${display.length} of ${scored.length})`;

  let html = "";
  display.forEach((item, idx) => {
    html += `<div class="pop-row${idx === 0 ? " is-winner" : ""}">`;
    html += `<span class="pop-score">${item.score}/${target.length}</span>`;
    html += `<span class="pop-str">`;
    for (let i = 0; i < item.str.length; i++) {
      const matched = item.str[i] === target[i];
      const cls = matched ? (idx === 0 ? "pop-char matched winner-char" : "pop-char matched") : "pop-char";
      html += `<span class="${cls}">${item.str[i]}</span>`;
    }
    html += `</span></div>`;
  });
  populationGrid.innerHTML = html;
}

function addHistoryEntry() {
  let strHtml = "";
  for (let i = 0; i < current.length; i++) {
    const cls = current[i] === target[i] ? "hist-char matched" : "hist-char";
    strHtml += `<span class="${cls}">${current[i]}</span>`;
  }

  const entry = document.createElement("div");
  entry.className = "history-entry";
  entry.innerHTML =
    `<span class="hist-gen">#${generation.toLocaleString()}</span>` +
    `<span class="hist-str">${strHtml}</span>` +
    `<span class="hist-score">${currentScore}/${target.length}</span>`;

  historyLog.prepend(entry);

  while (historyLog.children.length > 200) {
    historyLog.removeChild(historyLog.lastChild);
  }
}

function logInterval() {
  return generation <= 20 ? 1 : generation <= 100 ? 5 : generation <= 1000 ? 20 : 100;
}

/* ── Status chip ──────────────────────────────────────────────── */

function setStatus(text, kind) {
  statusLabel.textContent = text;
  statusLabel.className   = "status-chip " + kind;
}

/* ── Chart ─────────────────────────────────────────────────────── */

function resizeChart() {
  const dpr = window.devicePixelRatio || 1;
  chart.width  = Math.max(1, Math.round(chart.clientWidth * dpr));
  chart.height = Math.max(1, Math.round(chart.clientHeight * dpr));
}

function drawChart() {
  const w   = chart.width;
  const h   = chart.height;
  const dpr = window.devicePixelRatio || 1;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, w, h);

  if (history.length < 2 || target.length === 0) return;

  const maxScore = target.length;
  const pad   = { top: 12 * dpr, right: 12 * dpr, bottom: 26 * dpr, left: 38 * dpr };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top  - pad.bottom;
  if (plotW <= 0 || plotH <= 0) return;

  const g0   = history[0].g;
  const g1   = history[history.length - 1].g;
  const span = Math.max(1, g1 - g0);

  // grid lines + y labels
  ctx.strokeStyle = "#21293a";
  ctx.lineWidth   = dpr;
  ctx.font        = `${10 * dpr}px sans-serif`;
  [0, 0.25, 0.5, 0.75, 1].forEach(frac => {
    const y = pad.top + plotH * (1 - frac);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();

    ctx.fillStyle = "#8b949e";
    ctx.textAlign = "right";
    ctx.fillText(Math.round(frac * maxScore), pad.left - 5 * dpr, y + 3.5 * dpr);
  });

  // x labels (generation numbers)
  ctx.fillStyle = "#8b949e";
  ctx.textAlign = "left";
  ctx.fillText(g0.toLocaleString(), pad.left, h - 8 * dpr);
  ctx.textAlign = "right";
  ctx.fillText(g1.toLocaleString(), pad.left + plotW, h - 8 * dpr);

  const xFor = g => pad.left + ((g - g0) / span) * plotW;
  const yFor = s => pad.top  + plotH * (1 - s / maxScore);

  // draw at most ~1 point per device pixel
  const stride = Math.max(1, Math.floor(history.length / plotW));

  ctx.beginPath();
  ctx.strokeStyle = "#3fb950";
  ctx.lineWidth   = 2 * dpr;
  ctx.lineJoin    = "round";

  let first = true;
  for (let i = 0; i < history.length; i += stride) {
    const p = history[i];
    first ? ctx.moveTo(xFor(p.g), yFor(p.s)) : ctx.lineTo(xFor(p.g), yFor(p.s));
    first = false;
  }
  const lastPt = history[history.length - 1];
  ctx.lineTo(xFor(lastPt.g), yFor(lastPt.s));
  ctx.stroke();

  // fill under the line
  ctx.lineTo(pad.left + plotW, pad.top + plotH);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
  grad.addColorStop(0, "rgba(63,185,80,.30)");
  grad.addColorStop(1, "rgba(63,185,80,0)");
  ctx.fillStyle = grad;
  ctx.fill();
}

new ResizeObserver(() => {
  resizeChart();
  drawChart();
}).observe(chart);

/* ── Simulation loop ──────────────────────────────────────────── */

function finish(reason) {
  complete = true;
  stop();
  if (reason === "done") {
    setStatus(`Done in ${generation.toLocaleString()} generations`, "done");
    stageEl.classList.add("complete");
  } else {
    setStatus(`Generation limit reached (${LIMITS.maxGenerations.toLocaleString()})`, "warn");
  }
  addHistoryEntry();
}

function step() {
  if (complete) return;

  const prev   = current;
  const scored = evolveOneGeneration(true);
  pushHistoryPoint();

  renderCurrentString(prev);
  renderStats();
  renderPopulation(scored);
  drawChart();

  if (currentScore === target.length) { finish("done"); return; }
  if (generation >= LIMITS.maxGenerations) { finish("limit"); return; }

  if (generation % logInterval() === 0) addHistoryEntry();
}

function batchTick() {
  rafId = null;
  const t0 = performance.now();
  let finished = false;

  while (true) {
    evolveOneGeneration(false);
    pushHistoryPoint();

    if (currentScore === target.length || generation >= LIMITS.maxGenerations) {
      finished = true;
      break;
    }
    if (generation % logInterval() === 0) addHistoryEntry();
    if (performance.now() - t0 > FRAME_BUDGET_MS) break;
  }

  renderCurrentString(null);
  renderStats();
  drawChart();

  if (finished) {
    renderPopulation([{ str: current, score: currentScore }]);
    popCountLabel.textContent = "(final winner)";
    finish(currentScore === target.length ? "done" : "limit");
    return;
  }

  popCountLabel.textContent = "(updates paused at max speed)";
  if (running) rafId = requestAnimationFrame(batchTick);
}

function scheduleNext() {
  const delay = SPEED_MAP[parseInt(speedInput.value, 10)] ?? 0;
  if (delay === 0) {
    rafId = requestAnimationFrame(batchTick);
  } else {
    timerId = setTimeout(tick, delay);
  }
}

function clearTimers() {
  if (timerId) { clearTimeout(timerId); timerId = null; }
  if (rafId)   { cancelAnimationFrame(rafId); rafId = null; }
}

function tick() {
  timerId = null;
  step();
  if (running && !complete) scheduleNext();
}

function start() {
  if (complete || target.length === 0) return;
  running = true;
  btnPlay.textContent = "Pause";
  btnStep.disabled    = true;
  setStatus("Running…", "running");
  tick(); // first generation runs immediately
}

function stop() {
  running = false;
  btnPlay.textContent = "Play";
  btnStep.disabled    = complete;
  clearTimers();
  if (!complete) setStatus("Paused", "paused");
}

function reset() {
  stop();
  stageEl.classList.remove("complete");
  target = targetInput.value.toUpperCase().replace(/[^A-Z ]/g, "").slice(0, LIMITS.targetMaxLen);
  targetInput.value = target;

  if (target.trim().length === 0) {
    setStatus("Enter a target string to start", "warn");
    btnPlay.disabled = true;
    btnStep.disabled = true;
    currentDisplay.innerHTML = "";
    targetDisplay.innerHTML  = "";
    populationGrid.innerHTML = "";
    popCountLabel.textContent = "";
    historyLog.innerHTML     = "";
    currentSpans = [];
    history      = [];
    drawChart();
    return;
  }

  current      = randomString(target.length);
  currentScore = fitness(current);
  generation   = 0;
  complete     = false;
  history      = [{ g: 0, s: currentScore }];

  currentSpans = buildSpans(currentDisplay, target.length);
  renderCurrentString(null);
  renderTargetString();
  renderStats();
  populationGrid.innerHTML  = "";
  popCountLabel.textContent = "";
  historyLog.innerHTML      = "";
  setStatus("Ready", "ready");
  btnPlay.disabled    = false;
  btnStep.disabled    = false;
  btnPlay.textContent = "Play";
  addHistoryEntry();
  drawChart();
}

/* ── Event listeners ──────────────────────────────────────────── */

function stepOnce() {
  if (!running && !complete && target.length > 0) {
    step();
    if (!complete) setStatus("Paused", "paused");
  }
}

btnPlay.addEventListener("click", () => {
  if (running) stop(); else start();
});

btnStep.addEventListener("click", stepOnce);
btnReset.addEventListener("click", reset);

targetInput.addEventListener("change", reset);

function updateSpeedLabel() {
  speedValue.textContent = SPEED_NAMES[parseInt(speedInput.value, 10)] || "";
}

speedInput.addEventListener("input", () => {
  updateSpeedLabel();
  // apply the new speed immediately instead of waiting for the pending tick
  if (running && !complete) {
    clearTimers();
    scheduleNext();
  }
});

window.addEventListener("keydown", (e) => {
  const t = e.target;
  if (t instanceof HTMLButtonElement) return;
  if (t instanceof HTMLInputElement && (t.type === "text" || t.type === "number")) return;

  if (e.code === "Space") {
    e.preventDefault();
    if (!complete && target.length > 0) running ? stop() : start();
  } else if (e.key === "s" || e.key === "S") {
    stepOnce();
  } else if (e.key === "r" || e.key === "R") {
    reset();
  }
});

/* ── Init ─────────────────────────────────────────────────────── */
updateSpeedLabel();
resizeChart();
reset();
