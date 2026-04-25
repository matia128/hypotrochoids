let segmentsData = [];
let zoomLevel = 1.0;
let offsetX = 0;
let offsetY = 0;
let baseScale = 1.0;
let lastSliderCount = 0;
let currentRhos = [];
let currentStep = 4;
let rhoAnimStates = [];
let rhoAnimFrameId = null;
let rhoAnimLastTime = null;
let colorState = {
  r: 0,
  g: 0,
  b: 0,
  rj: 1,
  gj: 1,
  bj: 1,
  initialized: false,
};

let randomRhosActive = false;
let randomColorActive = false;
let colorMode = 'bounce'; // 'bounce' | 'rainbow' | 'mono'
let monoHue = 0;
let rainbowOffset = 0;
let lastSavedShapeKey = null;
let pendingSaveSnapshot = null;
let captureTargetEntryId = null;
const PEN_WIDTH_VALUES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4];
let penWidth = 1;
const OPACITY_VALUES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
let lineOpacity = 1;

let animMode = false;
let animSegmentsRevealed = 0;
let animPlaying = false;
let animSpeedMult = 1;
let animFrameId = null;
let animLastTime = null;
const ANIM_SEGMENTS_PER_SECOND = 25;

// Rainbow: 6 phases of 255 steps each, only one component changes by 1 per step
function rainbowColor(pos) {
  pos = ((pos % 1530) + 1530) % 1530;
  const phase = Math.floor(pos / 255);
  const t = pos % 255;
  switch (phase) {
    case 0: return [255, t, 0];
    case 1: return [255 - t, 255, 0];
    case 2: return [0, 255, t];
    case 3: return [0, 255 - t, 255];
    case 4: return [t, 0, 255];
    default: return [255, 0, 255 - t];
  }
}

const COLOR_STEP_SLIDER_MAX = 1000;

/** Slider position 0..COLOR_STEP_SLIDER_MAX maps log-uniformly to color step 1..1000 (10 and 100 at 1/3 and 2/3). */
function colorStepFromSliderPos(pos) {
  const p = Math.min(COLOR_STEP_SLIDER_MAX, Math.max(0, Number(pos)));
  const v = Math.round(Math.pow(10, (3 * p) / COLOR_STEP_SLIDER_MAX));
  return Math.min(1000, Math.max(1, v));
}

function sliderPosFromColorStep(step) {
  const s = Math.min(1000, Math.max(1, Math.round(Number(step))));
  if (s <= 1) return 0;
  return Math.round((Math.log10(s) / 3) * COLOR_STEP_SLIDER_MAX);
}

/** Snap slider to the canonical position for its integer color step (whole steps only). */
function snapColorStepSlider(slider) {
  const v = colorStepFromSliderPos(slider.value);
  slider.value = String(sliderPosFromColorStep(v));
  return v;
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

let sliderTooltip = null;

function showSliderTooltip(slider) {
  if (!sliderTooltip) {
    sliderTooltip = document.createElement("div");
    sliderTooltip.id = "sliderTooltip";
    document.body.appendChild(sliderTooltip);
  }
  const val = parseFloat(slider.value);
  sliderTooltip.textContent = isFinite(val) ? val.toFixed(3) : "0";
  const rect = slider.getBoundingClientRect();
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const ratio = (val - min) / (max - min);
  const thumbX = rect.left + ratio * (rect.width - 10) + 5;
  sliderTooltip.style.left = thumbX + "px";
  sliderTooltip.style.top = (rect.top - 22) + "px";
  sliderTooltip.style.display = "block";
}

function hideSliderTooltip() {
  if (sliderTooltip) sliderTooltip.style.display = "none";
}

function attachSliderTooltip(slider) {
  slider.addEventListener("mouseenter", () => showSliderTooltip(slider));
  slider.addEventListener("mousemove", () => showSliderTooltip(slider));
  slider.addEventListener("mouseleave", hideSliderTooltip);
}

const DEFAULT_RHO_MIN = -2;
const DEFAULT_RHO_MAX = 2;

/** Snap to the three quarter marks between min and max (for default -2..2 → -1, 0, 1). */
function snapRhoValue(v, min = DEFAULT_RHO_MIN, max = DEFAULT_RHO_MAX) {
  if (!Number.isFinite(v)) return min;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return v;
  const mid = (min + max) / 2;
  const span = max - min;
  const targets = [mid - span / 4, mid, mid + span / 4];
  const eps = Math.max(0.06, span * 0.025);
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (Math.abs(v - t) < eps) return t;
  }
  return v;
}

function formatRhoTickLabel(x) {
  if (!Number.isFinite(x)) return "";
  if (Math.abs(x) < 1e-9) return "0";
  const rounded = Math.round(x * 1000) / 1000;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
  return String(rounded);
}

function updateRhoTickLabels(state) {
  if (!state || !state.ticksEl || !state.slider) return;
  const ticks = state.ticksEl;
  const slider = state.slider;
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  ticks.innerHTML = "";
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
  const mid = (min + max) / 2;
  const spanW = max - min;
  const tickVals = [min, min + spanW / 4, mid, max - spanW / 4, max];
  /* Pixel-tuned with the slider thumb/track; keep for every range (not only -2..2). */
  const positions = [0, 25, 50, 75, 100];
  const offsets = [1, 2, 2, 2, 2];
  for (let ti = 0; ti < tickVals.length; ti++) {
    const label = document.createElement("span");
    label.textContent = formatRhoTickLabel(tickVals[ti]);
    const p = positions[ti];
    const off = offsets[ti];
    label.style.cssText = `position:absolute;left:calc(${p}% + ${5 - p * 0.1 + off}px);transform:translateX(-50%);`;
    ticks.appendChild(label);
  }
}

function randomRhoForSlider(slider) {
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;
  return parseFloat((min + Math.random() * (max - min)).toFixed(3));
}

let rhoPopoverEl = null;
let rhoPopoverAnchorState = null;
let rhoPlayAllSpeedPopoverEl = null;
let rhoPlayAllSpeedAnchorBtn = null;
let playAllSpeedDraft = 1;

function ensureRhoPopover() {
  if (rhoPopoverEl) return rhoPopoverEl;
  const el = document.createElement("div");
  el.id = "rhoSliderPopover";
  el.className = "rho-slider-popover";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "ρ value and range");
  el.style.display = "none";
  function addField(labelText, className, parent) {
    const lab = document.createElement("label");
    lab.style.display = "flex";
    lab.style.flexDirection = "column";
    lab.style.gap = "2px";
    const cap = document.createElement("span");
    cap.textContent = labelText;
    cap.style.color = "#aaa";
    cap.style.fontSize = "11px";
    const inp = document.createElement("input");
    inp.type = "number";
    inp.step = "any";
    inp.className = className;
    inp.autocomplete = "off";
    lab.appendChild(cap);
    lab.appendChild(inp);
    parent.appendChild(lab);
    return inp;
  }
  const inpVal = addField("Value", "rho-pop-val", el);
  const minMaxRow = document.createElement("div");
  minMaxRow.className = "rho-pop-minmax-row";
  const inpMin = addField("Min", "rho-pop-min", minMaxRow);
  const inpMax = addField("Max", "rho-pop-max", minMaxRow);
  el.appendChild(minMaxRow);
  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "rho-pop-apply";
  applyBtn.textContent = "Apply";
  el.appendChild(applyBtn);
  document.body.appendChild(el);
  function apply() {
    if (rhoPopoverAnchorState) applyRhoPopoverValues(rhoPopoverAnchorState);
  }
  applyBtn.addEventListener("click", apply);
  [inpVal, inpMin, inpMax].forEach((inp) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        apply();
      }
    });
  });
  rhoPopoverEl = el;
  return el;
}

function rhoPopoverBackdropDown(e) {
  if (!rhoPopoverEl || rhoPopoverEl.style.display === "none") return;
  if (rhoPopoverEl.contains(e.target)) return;
  if (e.target.closest && e.target.closest(".rho-slider-menu")) return;
  closeRhoPopover();
}

function positionRhoPopover(anchorBtn) {
  if (!rhoPopoverEl || !anchorBtn) return;
  const pop = rhoPopoverEl;
  const prevVis = pop.style.visibility;
  pop.style.visibility = "hidden";
  pop.style.display = "block";
  const pr = pop.getBoundingClientRect();
  const br = anchorBtn.getBoundingClientRect();
  let left = br.right + 6;
  let top = br.top + br.height / 2 - pr.height / 2;
  if (left + pr.width > window.innerWidth - 8) left = Math.max(8, br.left - pr.width - 6);
  top = Math.max(8, Math.min(top, window.innerHeight - pr.height - 8));
  left = Math.max(8, Math.min(left, window.innerWidth - pr.width - 8));
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.style.visibility = prevVis || "";
}

function openRhoPopover(state, menuBtn) {
  closePlayAllSpeedPopover();
  const el = ensureRhoPopover();
  document.removeEventListener("mousedown", rhoPopoverBackdropDown, true);
  rhoPopoverAnchorState = state;
  const s = state.slider;
  el.querySelector(".rho-pop-val").value = s.value;
  el.querySelector(".rho-pop-min").value = s.min;
  el.querySelector(".rho-pop-max").value = s.max;
  el.style.visibility = "";
  el.style.display = "block";
  positionRhoPopover(menuBtn);
  requestAnimationFrame(() => positionRhoPopover(menuBtn));
  document.addEventListener("mousedown", rhoPopoverBackdropDown, true);
}

function closeRhoPopover() {
  if (rhoPopoverEl) {
    rhoPopoverEl.style.display = "none";
    rhoPopoverEl.style.visibility = "";
  }
  rhoPopoverAnchorState = null;
  document.removeEventListener("mousedown", rhoPopoverBackdropDown, true);
}

function toggleRhoPopover(state, menuBtn) {
  if (rhoPopoverAnchorState === state && rhoPopoverEl && rhoPopoverEl.style.display !== "none") {
    closeRhoPopover();
  } else {
    openRhoPopover(state, menuBtn);
  }
}

function applyRhoPopoverValues(state) {
  if (!state || !state.slider) {
    closeRhoPopover();
    return;
  }
  const el = ensureRhoPopover();
  let val = parseFloat(el.querySelector(".rho-pop-val").value);
  let minV = parseFloat(el.querySelector(".rho-pop-min").value);
  let maxV = parseFloat(el.querySelector(".rho-pop-max").value);
  const s = state.slider;
  if (!Number.isFinite(val)) val = parseFloat(s.value);
  if (!Number.isFinite(minV)) minV = parseFloat(s.min);
  if (!Number.isFinite(maxV)) maxV = parseFloat(s.max);
  if (Number.isFinite(val)) {
    if (val < minV) minV = val;
    if (val > maxV) maxV = val;
  }
  if (!(maxV > minV)) maxV = minV + 1e-4;
  s.min = String(minV);
  s.max = String(maxV);
  const clamped = Math.min(maxV, Math.max(minV, Number.isFinite(val) ? val : parseFloat(s.value)));
  s.value = String(clamped);
  if (state.animValue != null) state.animValue = parseFloat(s.value);
  updateRhoTickLabels(state);
  closeRhoPopover();
  computeFromUI(false, false, false);
}

/** Center ⋮ horizontally between » and #ui right edge; does not change any other layout. */
function positionRhoSliderMenus() {
  const ui = document.getElementById("ui");
  const holder = document.getElementById("rhoSliders");
  if (!ui || !holder) return;
  const cs = getComputedStyle(ui);
  if (cs.display === "none" || cs.visibility === "hidden") return;
  const uiR = ui.getBoundingClientRect();
  if (uiR.width < 2) return;
  const lines = holder.querySelectorAll(".rho-row > .rho-line");
  let sharedMidX = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const menu = line.querySelector(":scope > .rho-slider-menu");
    const speed = line.querySelector(":scope > .rho-speed");
    if (!menu || !speed) continue;
    const sr = speed.getBoundingClientRect();
    const lr = line.getBoundingClientRect();
    const midX = (sr.right + uiR.right) / 2;
    if (sharedMidX === null) sharedMidX = midX;
    const leftPx = Math.max(0, midX - lr.left);
    menu.style.left = `${leftPx}px`;
    menu.style.right = "auto";
  }
  const playRow = document.getElementById("playAllRow");
  const playMenu = playRow?.querySelector(":scope > .rho-slider-menu");
  if (playRow && playMenu && sharedMidX != null) {
    const pr = playRow.getBoundingClientRect();
    const leftPx = Math.max(0, sharedMidX - pr.left);
    playMenu.style.left = `${leftPx}px`;
    playMenu.style.right = "auto";
  }
  if (
    rhoPlayAllSpeedPopoverEl &&
    rhoPlayAllSpeedPopoverEl.style.display !== "none" &&
    rhoPlayAllSpeedAnchorBtn
  ) {
    positionPlayAllSpeedPopover(rhoPlayAllSpeedAnchorBtn);
  }
}

function addPlayAllButton(container) {
  const existingRow = document.getElementById("playAllRow");
  if (existingRow) existingRow.remove();
  if (rhoAnimStates.length < 1) return;

  const row = document.createElement("div");
  row.id = "playAllRow";
  row.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-top:2px;margin-bottom:4px;gap:4px;";

  const resetBtn = document.createElement("button");
  resetBtn.id = "resetRhosBtn";
  resetBtn.textContent = "Reset";
  resetBtn.addEventListener("click", () => {
    stopAllRhoAnimations();
    for (const state of rhoAnimStates) {
      if (!state) continue;
      const s = state.slider;
      s.min = String(DEFAULT_RHO_MIN);
      s.max = String(DEFAULT_RHO_MAX);
      s.value = "0";
      state.animValue = null;
      state.dir = 1;
      updateRhoTickLabels(state);
    }
    computeFromUI(false, false, false);
  });

  const randomBtn = document.createElement("button");
  randomBtn.id = "randomRhosBtn";
  randomBtn.textContent = "Shuffle";
  if (randomRhosActive) randomBtn.classList.add("active");
  let _rndHoldTimer = null;
  let _rndHeld = false;
  randomBtn.addEventListener("mousedown", () => {
    _rndHeld = false;
    _rndHoldTimer = setTimeout(() => {
      _rndHeld = true;
      randomRhosActive = !randomRhosActive;
      randomBtn.classList.toggle("active", randomRhosActive);
      if (randomRhosActive) {
        for (const state of rhoAnimStates) {
          if (!state) continue;
          const v = randomRhoForSlider(state.slider);
          state.slider.value = String(v);
          state.animValue = v;
          state.dir = Math.random() < 0.5 ? 1 : -1;
        }
        computeFromUI(false, false, false);
      }
    }, 400);
  });
  randomBtn.addEventListener("mouseup", () => clearTimeout(_rndHoldTimer));
  randomBtn.addEventListener("mouseleave", () => clearTimeout(_rndHoldTimer));
  randomBtn.addEventListener("click", (e) => {
    if (_rndHeld) { _rndHeld = false; return; }
    for (const state of rhoAnimStates) {
      if (!state) continue;
      const v = randomRhoForSlider(state.slider);
      state.slider.value = String(v);
      state.animValue = v;
      state.dir = Math.random() < 0.5 ? 1 : -1;
    }
    computeFromUI(false, false, false);
  });

  const playBtn = document.createElement("button");
  playBtn.id = "playAllBtn";
  playBtn.textContent = "▶ Play All";
  playBtn.addEventListener("click", () => {
    togglePlayAllRhos();
  });

  const playAllMenuBtn = document.createElement("button");
  playAllMenuBtn.type = "button";
  playAllMenuBtn.id = "playAllRowMenuBtn";
  playAllMenuBtn.className = "rho-slider-menu";
  playAllMenuBtn.setAttribute("aria-label", "Playback speed for all ρ sliders");
  for (let d = 0; d < 3; d++) {
    playAllMenuBtn.appendChild(document.createElement("span"));
  }
  playAllMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePlayAllSpeedPopover(playAllMenuBtn);
  });

  row.appendChild(resetBtn);
  row.appendChild(randomBtn);
  row.appendChild(playBtn);
  row.appendChild(playAllMenuBtn);
  container.appendChild(row);
  updatePlayAllBtn();
}

function togglePlayAllRhos() {
  const anyActive = rhoAnimStates.some(s => s && s.active);
  if (anyActive) {
    stopAllRhoAnimations();
  } else {
    for (const state of rhoAnimStates) {
      if (state) {
        state.active = true;
        if (state.button) state.button.classList.add("active");
      }
    }
    startRhoAnimationLoop();
  }
  updatePlayAllBtn();
}

function updatePlayAllBtn() {
  const anyActive = rhoAnimStates.some(s => s && s.active);
  [document.getElementById("playAllBtn"), document.getElementById("animPlayAllBtn")].forEach(btn => {
    if (!btn) return;
    btn.classList.toggle("active", anyActive);
    btn.textContent = anyActive ? "⏹ Stop All" : "▶ Play All";
  });
}


function startRhoAnimationLoop() {
  if (rhoAnimFrameId !== null) return;
  noLoop();
  rhoAnimFrameId = requestAnimationFrame(rhoAnimationStep);
}

function stopAllRhoAnimations() {
  for (const state of rhoAnimStates) {
    if (state) {
      state.active = false;
      state.animValue = null;
      if (state.button) state.button.classList.remove("active");
    }
  }
  if (rhoAnimFrameId !== null) {
    cancelAnimationFrame(rhoAnimFrameId);
    rhoAnimFrameId = null;
  }
  rhoAnimLastTime = null;
  updatePlayAllBtn();
  loop();
}

const RHO_ANIM_SPEED_PER_SECOND = 0.6; // slider units per second at 1x (frame-rate independent)
const RHO_SPEED_VALUES = [0.25, 0.5, 1, 2, 4];

function roundSpeedMult(v) {
  let best = RHO_SPEED_VALUES[0];
  for (const x of RHO_SPEED_VALUES) {
    if (Math.abs(x - v) < Math.abs(best - v)) best = x;
  }
  return best;
}

/** Segment animation only (Animate panel); ρ slider speeds still use RHO_SPEED_VALUES. */
const ANIM_SPEED_VALUES = [0.05, 0.1, 0.15, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3.5, 5, 7.5, 10, 15, 20];

function roundAnimSpeedMult(v) {
  let best = ANIM_SPEED_VALUES[0];
  for (const x of ANIM_SPEED_VALUES) {
    if (Math.abs(x - v) < Math.abs(best - v)) best = x;
  }
  return best;
}

function formatAnimSpeedLabel(v) {
  const n = roundAnimSpeedMult(Number(v));
  const clean = parseFloat(n.toFixed(6));
  return String(clean) + "x";
}

function createRhoSpeedControl(state) {
  state.speedMultiplier = roundSpeedMult(state.speedMultiplier ?? 1);
  const wrap = document.createElement("div");
  wrap.className = "rho-speed";
  const row = document.createElement("div");
  row.className = "rho-speed-row";
  const btnDown = document.createElement("button");
  btnDown.type = "button";
  btnDown.className = "rho-speed-btn";
  btnDown.textContent = "«";
  const valueSpan = document.createElement("span");
  valueSpan.className = "rho-speed-value";
  const btnUp = document.createElement("button");
  btnUp.type = "button";
  btnUp.className = "rho-speed-btn";
  btnUp.textContent = "»";
  function updateDisplay() {
    const v = roundSpeedMult(state.speedMultiplier);
    valueSpan.textContent = String(Number(v)) + "x";
  }
  btnDown.addEventListener("click", () => {
    const i = RHO_SPEED_VALUES.indexOf(roundSpeedMult(state.speedMultiplier));
    state.speedMultiplier = RHO_SPEED_VALUES[Math.max(0, i - 1)];
    updateDisplay();
  });
  btnUp.addEventListener("click", () => {
    const i = RHO_SPEED_VALUES.indexOf(roundSpeedMult(state.speedMultiplier));
    state.speedMultiplier = RHO_SPEED_VALUES[Math.min(RHO_SPEED_VALUES.length - 1, i + 1)];
    updateDisplay();
  });
  row.appendChild(btnDown);
  row.appendChild(valueSpan);
  row.appendChild(btnUp);
  wrap.appendChild(row);
  updateDisplay();
  state.speedDisplayUpdate = updateDisplay;
  return wrap;
}

function applyPlayAllSpeedMult(mult) {
  const m = roundSpeedMult(mult);
  for (const state of rhoAnimStates) {
    if (!state) continue;
    state.speedMultiplier = m;
    if (typeof state.speedDisplayUpdate === "function") state.speedDisplayUpdate();
  }
}

function ensurePlayAllSpeedPopover() {
  if (rhoPlayAllSpeedPopoverEl) return rhoPlayAllSpeedPopoverEl;
  const el = document.createElement("div");
  el.id = "rhoPlayAllSpeedPopover";
  el.className = "rho-playall-speed-popover";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Playback speed for all length-ratio sliders");
  el.style.display = "none";
  const row = document.createElement("div");
  row.className = "rho-speed-row";
  const btnDown = document.createElement("button");
  btnDown.type = "button";
  btnDown.className = "rho-speed-btn";
  btnDown.textContent = "«";
  const valSpan = document.createElement("span");
  valSpan.className = "rho-speed-value";
  const btnUp = document.createElement("button");
  btnUp.type = "button";
  btnUp.className = "rho-speed-btn";
  btnUp.textContent = "»";
  row.appendChild(btnDown);
  row.appendChild(valSpan);
  row.appendChild(btnUp);
  el.appendChild(row);
  document.body.appendChild(el);

  function syncSpan() {
    valSpan.textContent = String(Number(playAllSpeedDraft)) + "x";
  }
  btnDown.addEventListener("click", (e) => {
    e.stopPropagation();
    const i = RHO_SPEED_VALUES.indexOf(roundSpeedMult(playAllSpeedDraft));
    playAllSpeedDraft = RHO_SPEED_VALUES[Math.max(0, i - 1)];
    applyPlayAllSpeedMult(playAllSpeedDraft);
    syncSpan();
  });
  btnUp.addEventListener("click", (e) => {
    e.stopPropagation();
    const i = RHO_SPEED_VALUES.indexOf(roundSpeedMult(playAllSpeedDraft));
    playAllSpeedDraft = RHO_SPEED_VALUES[Math.min(RHO_SPEED_VALUES.length - 1, i + 1)];
    applyPlayAllSpeedMult(playAllSpeedDraft);
    syncSpan();
  });

  rhoPlayAllSpeedPopoverEl = el;
  return el;
}

function positionPlayAllSpeedPopover(anchorBtn) {
  if (!rhoPlayAllSpeedPopoverEl || !anchorBtn) return;
  const pop = rhoPlayAllSpeedPopoverEl;
  const prevVis = pop.style.visibility;
  pop.style.visibility = "hidden";
  pop.style.display = "block";
  const pr = pop.getBoundingClientRect();
  const br = anchorBtn.getBoundingClientRect();
  let left = br.right + 6;
  let top = br.top + br.height / 2 - pr.height / 2;
  if (left + pr.width > window.innerWidth - 8) left = Math.max(8, br.left - pr.width - 6);
  top = Math.max(8, Math.min(top, window.innerHeight - pr.height - 8));
  left = Math.max(8, Math.min(left, window.innerWidth - pr.width - 8));
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.style.visibility = prevVis || "";
}

function playAllSpeedPopoverBackdropDown(e) {
  if (!rhoPlayAllSpeedPopoverEl || rhoPlayAllSpeedPopoverEl.style.display === "none") return;
  if (rhoPlayAllSpeedPopoverEl.contains(e.target)) return;
  if (e.target.closest && e.target.closest(".rho-slider-menu")) return;
  closePlayAllSpeedPopover();
}

function closePlayAllSpeedPopover() {
  if (rhoPlayAllSpeedPopoverEl) {
    rhoPlayAllSpeedPopoverEl.style.display = "none";
    rhoPlayAllSpeedPopoverEl.style.visibility = "";
  }
  rhoPlayAllSpeedAnchorBtn = null;
  document.removeEventListener("mousedown", playAllSpeedPopoverBackdropDown, true);
}

function openPlayAllSpeedPopover(anchorBtn) {
  closeRhoPopover();
  const first = rhoAnimStates.find(s => s);
  if (!first || !anchorBtn) return;
  const el = ensurePlayAllSpeedPopover();
  document.removeEventListener("mousedown", playAllSpeedPopoverBackdropDown, true);
  playAllSpeedDraft = roundSpeedMult(first.speedMultiplier ?? 1);
  const valSpan = el.querySelector(".rho-speed-value");
  if (valSpan) valSpan.textContent = String(Number(playAllSpeedDraft)) + "x";
  rhoPlayAllSpeedAnchorBtn = anchorBtn;
  el.style.visibility = "";
  el.style.display = "block";
  positionPlayAllSpeedPopover(anchorBtn);
  requestAnimationFrame(() => positionPlayAllSpeedPopover(anchorBtn));
  document.addEventListener("mousedown", playAllSpeedPopoverBackdropDown, true);
}

function togglePlayAllSpeedPopover(anchorBtn) {
  if (
    rhoPlayAllSpeedAnchorBtn === anchorBtn &&
    rhoPlayAllSpeedPopoverEl &&
    rhoPlayAllSpeedPopoverEl.style.display !== "none"
  ) {
    closePlayAllSpeedPopover();
  } else {
    openPlayAllSpeedPopover(anchorBtn);
  }
}

function rhoAnimationStep(timestamp) {
  const dt = rhoAnimLastTime != null ? (timestamp - rhoAnimLastTime) / 1000 : 0;
  rhoAnimLastTime = timestamp;

  let anyActive = false;

  for (const state of rhoAnimStates) {
    if (!state || !state.active || !state.slider) continue;
    anyActive = true;
    const mult = roundSpeedMult(state.speedMultiplier ?? 1);
    if (state.animValue == null) {
      state.animValue = parseFloat(state.slider.value);
      if (!isFinite(state.animValue)) state.animValue = 0;
    }
    state.animValue += state.dir * RHO_ANIM_SPEED_PER_SECOND * mult * dt;
    const smin = parseFloat(state.slider.min);
    const smax = parseFloat(state.slider.max);
    const lo = Number.isFinite(smin) ? smin : DEFAULT_RHO_MIN;
    const hi = Number.isFinite(smax) ? smax : DEFAULT_RHO_MAX;
    if (state.animValue > hi) {
      state.animValue = hi;
      state.dir = -1;
    } else if (state.animValue < lo) {
      state.animValue = lo;
      state.dir = 1;
    }
    state.slider.value = String(Number(state.animValue.toFixed(4)));
  }

  if (anyActive) {
    computeFromUI(false, false, false);
    redraw();
    rhoAnimFrameId = requestAnimationFrame(rhoAnimationStep);
  } else {
    rhoAnimFrameId = null;
    rhoAnimLastTime = null;
    loop(); // resume p5 draw() when no sliders are playing
  }
}

function randomizeColors(allowAnimColorReset = false) {
  if (colorMode === 'bounce') {
    colorState.initialized = false;
    computeFromUI(true, false, false, true, allowAnimColorReset);
  } else if (colorMode === 'rainbow') {
    rainbowOffset = Math.floor(Math.random() * 1530);
    computeFromUI(false, false, false, true);
  } else if (colorMode === 'mono') {
    monoHue = Math.floor(Math.random() * 360);
    const hs = document.getElementById("hueSlider");
    if (hs) hs.value = monoHue;
    computeFromUI(false, false, false, true);
  }
}

function performDrawAction() {
  const revealedBeforeDraw = animMode ? animSegmentsRevealed : null;
  if (randomRhosActive) {
    for (const state of rhoAnimStates) {
      if (!state) continue;
      const v = randomRhoForSlider(state.slider);
      state.slider.value = String(v);
      state.animValue = null;
      state.dir = Math.random() < 0.5 ? 1 : -1;
    }
  }
  if (randomColorActive) {
    randomizeColors(animMode);
  }
  computeFromUI(false, false, false);
  if (animMode) {
    animSegmentsRevealed = Math.min(revealedBeforeDraw ?? segmentsData.length, segmentsData.length);
    redraw();
  }
}

function setSaveButtonSaved(isSaved) {
  const btn = document.getElementById("saveShapeBtn");
  if (!btn) return;
  btn.textContent = isSaved ? "✓ Saved" : "Save";
  btn.classList.toggle("saved", isSaved);
  btn.disabled = isSaved;
}

function markShapeChanged() {
  setSaveButtonSaved(false);
}

function formatProjectTimestamp(d) {
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getNextShapeName() {
  const lib = getLibrary();
  let maxNum = 0;
  for (const entry of lib) {
    const m = /^Shape\s+(\d+)$/i.exec((entry && entry.name) ? String(entry.name).trim() : "");
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }
  return `Shape ${maxNum + 1}`;
}

// ── Library ──────────────────────────────────────────────────────────────────

function getShapeParams() {
  const freqs = document.getElementById("freqs").value;
  const rhos = rhoAnimStates.map(s => s ? parseFloat(s.slider.value) : 0);
  const colorStepEl = document.getElementById("colorStep");
  return {
    freqs,
    rhos,
    step: currentStep,
    colorMode,
    colorStep: colorStepFromSliderPos(colorStepEl ? colorStepEl.value : "566"),
    monoHue,
    penWidth,
    opacity: lineOpacity,
    rainbowOffset,
    randomColorActive,
    zoomLevel,
    offsetX,
    offsetY,
    colorState: {
      r: colorState.r,
      g: colorState.g,
      b: colorState.b,
      rj: colorState.rj,
      gj: colorState.gj,
      bj: colorState.bj,
      initialized: colorState.initialized,
    },
  };
}

function applyShapeParams(params) {
  stopAllRhoAnimations();
  document.getElementById("freqs").value = params.freqs || "";

  colorMode = params.colorMode || 'bounce';
  randomColorActive = !!params.randomColorActive;
  if (Number.isFinite(params.rainbowOffset)) {
    rainbowOffset = params.rainbowOffset;
  }
  if (params.colorState && Number.isFinite(params.colorState.r) && Number.isFinite(params.colorState.g) && Number.isFinite(params.colorState.b)) {
    colorState.r = params.colorState.r;
    colorState.g = params.colorState.g;
    colorState.b = params.colorState.b;
    colorState.rj = Number.isFinite(params.colorState.rj) ? params.colorState.rj : 1;
    colorState.gj = Number.isFinite(params.colorState.gj) ? params.colorState.gj : 1;
    colorState.bj = Number.isFinite(params.colorState.bj) ? params.colorState.bj : 1;
    colorState.initialized = !!params.colorState.initialized;
  }

  const paletteBtns = document.querySelectorAll(".palette-btn");
  const paletteCols = document.querySelectorAll(".palette-col");
  const paletteRndBtns = document.querySelectorAll(".palette-rnd-btn");
  paletteBtns.forEach(b => b.classList.toggle("active", b.dataset.mode === colorMode));
  paletteCols.forEach(c => c.classList.toggle("active", c.querySelector(".palette-btn").dataset.mode === colorMode));
  paletteRndBtns.forEach(b => b.classList.toggle("active", randomColorActive && b.dataset.mode === colorMode));
  const colorStepRow = document.getElementById("colorStepRow");
  const hueRow = document.getElementById("hueRow");
  if (colorStepRow) colorStepRow.style.display = colorMode === 'mono' ? "none" : "";
  if (hueRow) hueRow.style.display = colorMode === 'mono' ? "" : "none";

  let colorStep = params.colorStep;
  if (!Number.isFinite(colorStep) || colorStep < 1) colorStep = 50;
  colorStep = Math.min(1000, Math.max(1, Math.round(colorStep)));
  const cs = document.getElementById("colorStep");
  const csv = document.getElementById("colorStepVal");
  if (cs) cs.value = String(sliderPosFromColorStep(colorStep));
  if (csv) csv.value = String(colorStep);

  monoHue = params.monoHue || 0;
  const hueSlider = document.getElementById("hueSlider");
  if (hueSlider) hueSlider.value = monoHue;

  currentStep = params.step || 4;
  document.querySelectorAll(".step-btn").forEach(b => b.classList.toggle("active", parseInt(b.dataset.step) === currentStep));

  penWidth = PEN_WIDTH_VALUES.reduce((a, b) => Math.abs(b - params.penWidth) < Math.abs(a - params.penWidth) ? b : a, PEN_WIDTH_VALUES[0]);
  lineOpacity = OPACITY_VALUES.reduce((a, b) => Math.abs(b - params.opacity) < Math.abs(a - params.opacity) ? b : a, OPACITY_VALUES[OPACITY_VALUES.length - 1]);
  const pwSpan = document.getElementById("penWidthValue");
  if (pwSpan) pwSpan.textContent = String(penWidth);
  const opSpan = document.getElementById("opacityValue");
  if (opSpan) opSpan.textContent = String(Math.round(lineOpacity * 10) / 10);

  computeFromUI(false, false, false);

  if (params.rhos && params.rhos.length > 0) {
    const sliders = document.querySelectorAll("input.rho-slider");
    params.rhos.forEach((v, i) => {
      if (sliders[i]) {
        const s = sliders[i];
        let minV = parseFloat(s.min);
        let maxV = parseFloat(s.max);
        if (!Number.isFinite(minV)) minV = DEFAULT_RHO_MIN;
        if (!Number.isFinite(maxV)) maxV = DEFAULT_RHO_MAX;
        if (Number.isFinite(v)) {
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
        if (!(maxV > minV)) maxV = minV + 1e-4;
        s.min = String(minV);
        s.max = String(maxV);
        s.value = String(Number.isFinite(v) ? Math.min(maxV, Math.max(minV, v)) : s.value);
        if (rhoAnimStates[i]) {
          rhoAnimStates[i].animValue = parseFloat(s.value);
          updateRhoTickLabels(rhoAnimStates[i]);
        }
      }
    });
    computeFromUI(false, false, false);
  }

  if (Number.isFinite(params.zoomLevel)) zoomLevel = params.zoomLevel;
  if (Number.isFinite(params.offsetX)) offsetX = params.offsetX;
  if (Number.isFinite(params.offsetY)) offsetY = params.offsetY;
}

function captureThumbnail() {
  const src = document.querySelector('canvas');
  if (!src) return null;
  const srcW = src.width;
  const srcH = src.height;
  const targetAspect = 4 / 3;
  const srcAspect = srcW / srcH;
  let sx = 0, sy = 0, sW = srcW, sH = srcH;
  if (srcAspect > targetAspect) {
    sW = srcH * targetAspect;
    sx = (srcW - sW) / 2;
  } else if (srcAspect < targetAspect) {
    sH = srcW / targetAspect;
    sy = (srcH - sH) / 2;
  }
  const thumb = document.createElement('canvas');
  thumb.width = 480;
  thumb.height = 360;
  thumb.getContext('2d').drawImage(src, sx, sy, sW, sH, 0, 0, 480, 360);
  return thumb.toDataURL('image/jpeg', 0.75);
}

/** 16:9 render, WebP or high-Q JPEG — library gallery (thumbnails use captureThumbnail). */
function captureGalleryPhoto(maxW = 3840, maxH = 2160, quality = 0.98) {
  const src = document.querySelector('canvas');
  if (!src) return null;
  const targetAspect = 16 / 9;
  const logicalW = width || src.clientWidth || src.width;
  const logicalH = height || src.clientHeight || src.height;
  if (!logicalW || !logicalH) return null;

  let renderW = logicalW;
  let renderH = logicalH;
  if (logicalW / logicalH > targetAspect) {
    renderH = logicalW / targetAspect;
  } else if (logicalW / logicalH < targetAspect) {
    renderW = logicalH * targetAspect;
  }

  const pixelScale = src.width / logicalW || 1;
  let outW = renderW * pixelScale;
  let outH = renderH * pixelScale;
  if (outW > maxW || outH > maxH) {
    const scale = Math.min(maxW / outW, maxH / outH);
    outW = Math.max(1, Math.round(outW * scale));
    outH = Math.max(1, Math.round(outH * scale));
  } else {
    outW = Math.max(1, Math.round(outW));
    outH = Math.max(1, Math.round(outH));
  }
  const c = document.createElement('canvas');
  c.width = outW;
  c.height = outH;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, outW, outH);

  const renderScale = outW / renderW;
  const s = zoomLevel * baseScale;
  ctx.save();
  ctx.translate(outW / 2 + offsetX * renderScale, outH / 2 + offsetY * renderScale);
  ctx.scale(s * renderScale, -s * renderScale);
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.lineWidth = s > 0 ? penWidth / s : penWidth;
  const maxSeg = animMode ? Math.floor(animSegmentsRevealed) : segmentsData.length;
  for (let si = 0; si < maxSeg; si++) {
    const seg = segmentsData[si];
    if (!seg) continue;
    const [r, g, b] = seg.color;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${lineOpacity})`;
    ctx.beginPath();
    for (let i = 0; i < seg.xs.length; i++) {
      if (i === 0) ctx.moveTo(seg.xs[i], seg.ys[i]);
      else ctx.lineTo(seg.xs[i], seg.ys[i]);
    }
    ctx.stroke();
  }
  const frac = animMode ? animSegmentsRevealed - maxSeg : 0;
  if (frac > 0 && maxSeg < segmentsData.length) {
    const seg = segmentsData[maxSeg];
    if (seg) {
      const [r, g, b] = seg.color;
      const n = Math.floor(frac * seg.xs.length);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${lineOpacity})`;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        if (i === 0) ctx.moveTo(seg.xs[i], seg.ys[i]);
        else ctx.lineTo(seg.xs[i], seg.ys[i]);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
  try {
    const webp = c.toDataURL('image/webp', quality);
    if (webp.startsWith('data:image/webp')) return webp;
  } catch (_) { /* encode unsupported */ }
  return c.toDataURL('image/jpeg', quality);
}

function applyCanvasPixelDensity() {
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  const d = Math.min(2, Math.max(1, Math.ceil(dpr)));
  pixelDensity(d);
}

function getLibrary() {
  try { return JSON.parse(localStorage.getItem('hypo_library') || '[]'); }
  catch { return []; }
}

function saveLibrary(lib) {
  localStorage.setItem('hypo_library', JSON.stringify(lib));
}

function getStandaloneGallery() {
  try { return JSON.parse(localStorage.getItem('hypo_gallery') || '[]'); }
  catch { return []; }
}

function saveStandaloneGallery(gallery) {
  localStorage.setItem('hypo_gallery', JSON.stringify(gallery));
}

function openGalleryDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const req = indexedDB.open("hypo_gallery_db", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Could not open gallery database"));
  });
}

async function saveIndexedGalleryPhoto(dataUrl) {
  const photo = createGalleryPhoto(dataUrl);
  const db = await openGalleryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").put(photo);
    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Could not save gallery photo"));
    };
  });
}

function createGalleryPhoto(dataUrl) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    image: dataUrl,
    createdAt: new Date().toISOString(),
  };
}

async function addStandaloneGalleryPhoto(dataUrl) {
  if (!dataUrl) return false;
  const gallery = getStandaloneGallery();
  gallery.unshift(createGalleryPhoto(dataUrl));
  try {
    saveStandaloneGallery(gallery);
    return true;
  } catch (err) {
    console.warn("Could not save gallery photo to localStorage, trying IndexedDB:", err);
  }
  try {
    return await saveIndexedGalleryPhoto(dataUrl);
  } catch (err) {
    console.warn("Could not save gallery photo:", err);
    return false;
  }
}

function addPhotoToLibraryEntry(entryId, dataUrl) {
  const lib = getLibrary();
  const e = lib.find(x => String(x.id) === String(entryId));
  if (!e || !dataUrl) return false;
  const previousGallery = Array.isArray(e.gallery) ? e.gallery : [];
  e.gallery = previousGallery.slice();
  e.gallery.unshift(createGalleryPhoto(dataUrl));
  try {
    saveLibrary(lib);
    return true;
  } catch (err) {
    e.gallery = previousGallery;
    console.warn("Could not save project gallery photo:", err);
    return false;
  }
}

async function saveGalleryCapture(dataUrl) {
  if (!dataUrl) return false;
  if (captureTargetEntryId && addPhotoToLibraryEntry(captureTargetEntryId, dataUrl)) return true;
  return await addStandaloneGalleryPhoto(dataUrl);
}

function setCaptureTargetEntry(entryId) {
  const lib = getLibrary();
  captureTargetEntryId = lib.some(x => String(x.id) === String(entryId)) ? entryId : null;
  updateCaptureButtonState();
}

function updateCaptureButtonState() {
  const btn = document.getElementById("captureBtn");
  if (!btn) return;
  btn.disabled = false;
  btn.title = "Capture to gallery";
  btn.setAttribute("aria-label", btn.title);
}

function flashCapture() {
  const flash = document.getElementById("captureFlash");
  if (!flash) return;
  flash.classList.remove("visible");
  void flash.offsetWidth;
  flash.classList.add("visible");
  setTimeout(() => flash.classList.remove("visible"), 17);
}

function waitForCaptureFlashPaint() {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function renderLibrary() {
  const list = document.getElementById("libraryList");
  const heading = document.getElementById("libraryHeading");
  if (!list) return;
  const lib = getLibrary();
  if (heading) heading.textContent = lib.length > 0 ? `Library (${lib.length})` : "Library";
  list.innerHTML = "";
  if (lib.length === 0) {
    list.innerHTML = '<div class="library-empty">No saved shapes yet.</div>';
    return;
  }
  lib.forEach(entry => {
    const item = document.createElement("div");
    item.className = "library-item";

    if (entry.thumbnail) {
      const img = document.createElement("img");
      img.src = entry.thumbnail;
      img.className = "library-thumb";
      item.appendChild(img);
    }

    const info = document.createElement("div");
    info.className = "library-info";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.autocomplete = "off";
    nameInput.className = "library-name";
    nameInput.value = entry.name;
    nameInput.addEventListener("change", () => {
      const lib2 = getLibrary();
      const e = lib2.find(x => x.id === entry.id);
      if (e) { e.name = nameInput.value; saveLibrary(lib2); }
    });
    info.appendChild(nameInput);

    const btns = document.createElement("div");
    btns.className = "library-btns";

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Load";
    loadBtn.type = "button";
    loadBtn.addEventListener("click", () => applyShapeParams(entry.params));

    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.type = "button";
    delBtn.className = "library-btn-del";
    delBtn.title = "Delete";
    delBtn.addEventListener("click", () => {
      saveLibrary(getLibrary().filter(x => x.id !== entry.id));
      renderLibrary();
    });

    btns.appendChild(loadBtn);
    btns.appendChild(delBtn);
    info.appendChild(btns);
    item.appendChild(info);
    list.appendChild(item);
  });
}

function saveShape() {
  const snapshot = pendingSaveSnapshot || { params: getShapeParams(), thumbnail: captureThumbnail() };
  const now = new Date();
  const nameInput = document.getElementById("saveNameInput");
  const name = nameInput ? (nameInput.value.trim() || getNextShapeName()) : getNextShapeName();
  const description = formatProjectTimestamp(now);
  const entry = {
    id: Date.now().toString(),
    name,
    description,
    thumbnail: snapshot.thumbnail,
    params: snapshot.params,
    createdAt: now.toISOString(),
  };
  const lib = getLibrary();
  lib.unshift(entry);
  saveLibrary(lib);
  setCaptureTargetEntry(entry.id);
  lastSavedShapeKey = JSON.stringify(snapshot.params);
  pendingSaveSnapshot = null;
  setSaveButtonSaved(true);
}

function openSaveModal() {
  const modal = document.getElementById("saveModal");
  const preview = document.getElementById("savePreviewImg");
  const nameInput = document.getElementById("saveNameInput");
  const dateText = document.getElementById("saveDateText");
  if (!modal || !preview || !nameInput || !dateText) return;
  const now = new Date();
  pendingSaveSnapshot = {
    params: getShapeParams(),
    thumbnail: captureThumbnail(),
  };
  preview.src = pendingSaveSnapshot.thumbnail || "";
  nameInput.value = getNextShapeName();
  dateText.textContent = formatProjectTimestamp(now);
  modal.style.display = "flex";
  nameInput.focus();
  nameInput.select();
}

function closeSaveModal() {
  const modal = document.getElementById("saveModal");
  if (modal) modal.style.display = "none";
}

function encodeShapeToURL(params) {
  const p = new URLSearchParams();
  p.set('freqs', params.freqs);
  p.set('rhos', params.rhos.join(','));
  p.set('step', params.step);
  p.set('cm', params.colorMode);
  p.set('cs', params.colorStep);
  p.set('hue', params.monoHue);
  p.set('pw', params.penWidth);
  p.set('op', params.opacity);
  p.set('ro', params.rainbowOffset);
  p.set('rc', params.randomColorActive ? '1' : '0');
  p.set('z', params.zoomLevel);
  p.set('ox', params.offsetX);
  p.set('oy', params.offsetY);
  if (params.colorState) {
    p.set('cr', params.colorState.r);
    p.set('cg', params.colorState.g);
    p.set('cb', params.colorState.b);
    p.set('crj', params.colorState.rj);
    p.set('cgj', params.colorState.gj);
    p.set('cbj', params.colorState.bj);
    p.set('ci', params.colorState.initialized ? '1' : '0');
  }
  return location.href.split('#')[0] + '#' + p.toString();
}

function loadFromURL() {
  const hash = location.hash.slice(1);
  if (!hash) {
    setCaptureTargetEntry(null);
    return;
  }
  const p = new URLSearchParams(hash);
  if (!p.has('freqs')) {
    setCaptureTargetEntry(null);
    return;
  }
  applyShapeParams({
    freqs: p.get('freqs') || '',
    rhos: (p.get('rhos') || '').split(',').map(Number).filter(isFinite),
    step: parseInt(p.get('step')) || 4,
    colorMode: p.get('cm') || 'bounce',
    colorStep: Math.min(1000, Math.max(1, parseInt(p.get('cs'), 10) || 50)),
    monoHue: parseInt(p.get('hue')) || 0,
    penWidth: parseFloat(p.get('pw')) || 1,
    opacity: parseFloat(p.get('op')) || 1,
    rainbowOffset: parseInt(p.get('ro')),
    randomColorActive: p.get('rc') === '1',
    zoomLevel: parseFloat(p.get('z')),
    offsetX: parseFloat(p.get('ox')),
    offsetY: parseFloat(p.get('oy')),
    colorState: {
      r: parseFloat(p.get('cr')),
      g: parseFloat(p.get('cg')),
      b: parseFloat(p.get('cb')),
      rj: parseFloat(p.get('crj')),
      gj: parseFloat(p.get('cgj')),
      bj: parseFloat(p.get('cbj')),
      initialized: p.get('ci') === '1',
    },
  });
  setCaptureTargetEntry(p.get("lid"));
  redraw();
}

// ─────────────────────────────────────────────────────────────────────────────

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent(document.body);
  applyCanvasPixelDensity();
  noFill();
  strokeCap(SQUARE);
  computeFromUI(true, true, false);

  const freqInfoIcon = document.getElementById("freqInfoIcon");
  if (freqInfoIcon) {
    const infoText = "The ratios between the angular velocities of the vectors.\nComma or space separated.";
    freqInfoIcon.addEventListener("mouseenter", () => {
      if (!sliderTooltip) {
        sliderTooltip = document.createElement("div");
        sliderTooltip.id = "sliderTooltip";
        document.body.appendChild(sliderTooltip);
      }
      sliderTooltip.textContent = infoText;
      sliderTooltip.style.maxWidth = "180px";
      sliderTooltip.style.whiteSpace = "pre-line";
      const rect = freqInfoIcon.getBoundingClientRect();
      sliderTooltip.style.left = (rect.left + rect.width / 2) + "px";
      sliderTooltip.style.top = (rect.bottom + 6) + "px";
      sliderTooltip.style.display = "block";
    });
    freqInfoIcon.addEventListener("mouseleave", () => {
      hideSliderTooltip();
      if (sliderTooltip) {
        sliderTooltip.style.maxWidth = "";
        sliderTooltip.style.whiteSpace = "nowrap";
      }
    });
  }

  const rhoInfoIcon = document.getElementById("rhoInfoIcon");
  if (rhoInfoIcon) {
    const rhoInfoText = "The ratios between the magnitudes of the vectors. \nEach slider corresponds to the respective frequency ratio.";
    rhoInfoIcon.addEventListener("mouseenter", () => {
      if (!sliderTooltip) {
        sliderTooltip = document.createElement("div");
        sliderTooltip.id = "sliderTooltip";
        document.body.appendChild(sliderTooltip);
      }
      sliderTooltip.textContent = rhoInfoText;
      sliderTooltip.style.maxWidth = "180px";
      sliderTooltip.style.whiteSpace = "pre-line";
      const rect = rhoInfoIcon.getBoundingClientRect();
      sliderTooltip.style.left = (rect.left + rect.width / 2) + "px";
      sliderTooltip.style.top = (rect.bottom + 6) + "px";
      sliderTooltip.style.display = "block";
    });
    rhoInfoIcon.addEventListener("mouseleave", () => {
      hideSliderTooltip();
      if (sliderTooltip) {
        sliderTooltip.style.maxWidth = "";
        sliderTooltip.style.whiteSpace = "nowrap";
      }
    });
  }

  const angleInfoIcon = document.getElementById("angleInfoIcon");
  if (angleInfoIcon) {
    const angleInfoText = "The smoothness of the curve, how often a new point is calculated. (Degrees)";
    angleInfoIcon.addEventListener("mouseenter", () => {
      if (!sliderTooltip) {
        sliderTooltip = document.createElement("div");
        sliderTooltip.id = "sliderTooltip";
        document.body.appendChild(sliderTooltip);
      }
      sliderTooltip.textContent = angleInfoText;
      sliderTooltip.style.maxWidth = "180px";
      sliderTooltip.style.whiteSpace = "pre-line";
      const rect = angleInfoIcon.getBoundingClientRect();
      sliderTooltip.style.left = (rect.left + rect.width / 2) + "px";
      sliderTooltip.style.top = (rect.bottom + 6) + "px";
      sliderTooltip.style.display = "block";
    });
    angleInfoIcon.addEventListener("mouseleave", () => {
      hideSliderTooltip();
      if (sliderTooltip) {
        sliderTooltip.style.maxWidth = "";
        sliderTooltip.style.whiteSpace = "nowrap";
      }
    });
  }

  const paletteBtns = document.querySelectorAll(".palette-btn");
  const paletteCols = document.querySelectorAll(".palette-col");
  const paletteRndBtns = document.querySelectorAll(".palette-rnd-btn");
  const colorStepRow = document.getElementById("colorStepRow");
  const hueRow = document.getElementById("hueRow");

  function updatePaletteUI() {
    paletteBtns.forEach(b => b.classList.toggle("active", b.dataset.mode === colorMode));
    paletteCols.forEach(c => c.classList.toggle("active", c.querySelector(".palette-btn").dataset.mode === colorMode));
    paletteRndBtns.forEach(b => b.classList.toggle("active", randomColorActive && b.dataset.mode === colorMode));
    colorStepRow.style.display = colorMode === 'mono' ? "none" : "";
    hueRow.style.display = colorMode === 'mono' ? "" : "none";
  }

  paletteBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const wasActive = colorMode === btn.dataset.mode;
      const modeChanged = !wasActive;
      colorMode = btn.dataset.mode;
      if (modeChanged) {
        randomColorActive = false;
      }
      updatePaletteUI();
      computeFromUI(false, false, false, true);
    });
  });

  paletteRndBtns.forEach(btn => {
    let holdTimer = null;
    let held = false;
    btn.addEventListener("mousedown", () => {
      held = false;
      holdTimer = setTimeout(() => {
        held = true;
        randomColorActive = !randomColorActive;
        updatePaletteUI();
        if (randomColorActive) randomizeColors();
      }, 400);
    });
    btn.addEventListener("mouseup", () => clearTimeout(holdTimer));
    btn.addEventListener("mouseleave", () => clearTimeout(holdTimer));
    btn.addEventListener("click", () => {
      if (held) { held = false; return; }
      randomizeColors();
    });
  });

  const hueSlider = document.getElementById("hueSlider");
  if (hueSlider) {
    hueSlider.addEventListener("input", () => {
      monoHue = parseInt(hueSlider.value, 10);
      computeFromUI(false, false, false, true);
    });
  }

  const colorStepSlider = document.getElementById("colorStep");
  const colorStepVal = document.getElementById("colorStepVal");
  if (colorStepSlider && colorStepVal) {
    colorStepSlider.addEventListener("input", () => {
      const v = snapColorStepSlider(colorStepSlider);
      colorStepVal.value = String(v);
      computeFromUI(false, false, false, true);
    });
    colorStepVal.addEventListener("input", () => {
      const v = Math.min(1000, Math.max(1, parseInt(colorStepVal.value, 10) || 1));
      colorStepVal.value = String(v);
      colorStepSlider.value = String(sliderPosFromColorStep(v));
      computeFromUI(false, false, false, true);
    });
    colorStepVal.addEventListener("change", () => {
      const v = Math.min(1000, Math.max(1, parseInt(colorStepVal.value, 10) || 1));
      colorStepVal.value = String(v);
      colorStepSlider.value = String(sliderPosFromColorStep(v));
      computeFromUI(false, false, false, true);
    });
  }

  const penWidthValSpan = document.getElementById("penWidthValue");
  const penWidthDown = document.getElementById("penWidthDown");
  const penWidthUp = document.getElementById("penWidthUp");
  const penWidthMin = document.getElementById("penWidthMin");
  const penWidthMax = document.getElementById("penWidthMax");
  function updatePenWidthDisplay() {
    penWidthValSpan.textContent = String(penWidth);
    markShapeChanged();
    redraw();
  }
  penWidthMin.addEventListener("click", () => {
    penWidth = PEN_WIDTH_VALUES[0];
    updatePenWidthDisplay();
  });
  penWidthDown.addEventListener("click", () => {
    const i = PEN_WIDTH_VALUES.indexOf(penWidth);
    penWidth = PEN_WIDTH_VALUES[Math.max(0, i - 1)];
    updatePenWidthDisplay();
  });
  penWidthUp.addEventListener("click", () => {
    const i = PEN_WIDTH_VALUES.indexOf(penWidth);
    penWidth = PEN_WIDTH_VALUES[Math.min(PEN_WIDTH_VALUES.length - 1, i + 1)];
    updatePenWidthDisplay();
  });
  penWidthMax.addEventListener("click", () => {
    penWidth = PEN_WIDTH_VALUES[PEN_WIDTH_VALUES.length - 1];
    updatePenWidthDisplay();
  });

  const opacityValSpan = document.getElementById("opacityValue");
  const opacityDown = document.getElementById("opacityDown");
  const opacityUp = document.getElementById("opacityUp");
  const opacityMin = document.getElementById("opacityMin");
  const opacityMax = document.getElementById("opacityMax");
  function updateOpacityDisplay() {
    opacityValSpan.textContent = String(Math.round(lineOpacity * 10) / 10);
    markShapeChanged();
    redraw();
  }
  opacityMin.addEventListener("click", () => {
    lineOpacity = OPACITY_VALUES[0];
    updateOpacityDisplay();
  });
  opacityDown.addEventListener("click", () => {
    const i = OPACITY_VALUES.indexOf(Math.round(lineOpacity * 10) / 10);
    lineOpacity = OPACITY_VALUES[Math.max(0, i - 1)];
    updateOpacityDisplay();
  });
  opacityUp.addEventListener("click", () => {
    const i = OPACITY_VALUES.indexOf(Math.round(lineOpacity * 10) / 10);
    lineOpacity = OPACITY_VALUES[Math.min(OPACITY_VALUES.length - 1, i + 1)];
    updateOpacityDisplay();
  });
  opacityMax.addEventListener("click", () => {
    lineOpacity = OPACITY_VALUES[OPACITY_VALUES.length - 1];
    updateOpacityDisplay();
  });

  const drawBtn = document.getElementById("drawBtn");
  drawBtn.addEventListener("click", performDrawAction);

  const uiMain = document.getElementById("uiMain");
  const uiAnim = document.getElementById("uiAnim");
  const animSpeedValue = document.getElementById("animSpeedValue");
  const animPlayBtn = document.getElementById("animPlayBtn");
  const animResetBtn = document.getElementById("animResetBtn");
  const animDrawBtn = document.getElementById("animDrawBtn");
  const animPlayAllBtn = document.getElementById("animPlayAllBtn");
  const animBackBtn = document.getElementById("animBackBtn");
  const animSpeedDown = document.getElementById("animSpeedDown");
  const animSpeedUp = document.getElementById("animSpeedUp");

  function stopAnimPlayback() {
    animPlaying = false;
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    animLastTime = null;
    if (animPlayBtn) animPlayBtn.textContent = "Animate";
    loop();
  }

  document.getElementById("animateBtn").addEventListener("click", () => {
    // Same as Draw: do not re-randomize ρ or palette here — preserve the curve and colors on screen
    computeFromUI(false, false, false);
    animMode = true;
    animSegmentsRevealed = segmentsData.length;
    stopAnimPlayback();
    uiMain.style.display = "none";
    uiAnim.style.display = "";
    animSpeedMult = roundAnimSpeedMult(animSpeedMult);
    if (animSpeedValue) animSpeedValue.textContent = formatAnimSpeedLabel(animSpeedMult);
    redraw();
  });

  if (animResetBtn) {
    animResetBtn.addEventListener("click", () => {
      if (animPlaying) stopAnimPlayback();
      animSegmentsRevealed = 0;
      redraw();
    });
  }

  if (animDrawBtn) {
    animDrawBtn.addEventListener("click", performDrawAction);
  }

  if (animPlayAllBtn) {
    animPlayAllBtn.addEventListener("click", togglePlayAllRhos);
    updatePlayAllBtn();
  }

  if (animBackBtn) {
    animBackBtn.addEventListener("click", () => {
      animMode = false;
      animSegmentsRevealed = 0;
      stopAnimPlayback();
      uiMain.style.display = "";
      uiAnim.style.display = "none";
      redraw();
    });
  }

  function updateAnimSpeedDisplay() {
    if (animSpeedValue) animSpeedValue.textContent = formatAnimSpeedLabel(animSpeedMult);
  }
  if (animSpeedDown) {
    animSpeedDown.addEventListener("click", () => {
      const i = ANIM_SPEED_VALUES.indexOf(roundAnimSpeedMult(animSpeedMult));
      animSpeedMult = ANIM_SPEED_VALUES[Math.max(0, i - 1)];
      updateAnimSpeedDisplay();
    });
  }
  if (animSpeedUp) {
    animSpeedUp.addEventListener("click", () => {
      const i = ANIM_SPEED_VALUES.indexOf(roundAnimSpeedMult(animSpeedMult));
      animSpeedMult = ANIM_SPEED_VALUES[Math.min(ANIM_SPEED_VALUES.length - 1, i + 1)];
      updateAnimSpeedDisplay();
    });
  }
  function animStep(timestamp) {
    const dt = animLastTime != null ? (timestamp - animLastTime) / 1000 : 0;
    animLastTime = timestamp;
    const total = segmentsData.length;
    const mult = roundAnimSpeedMult(animSpeedMult);
    animSegmentsRevealed += ANIM_SEGMENTS_PER_SECOND * mult * dt;
    if (animSegmentsRevealed >= total) {
      animSegmentsRevealed = total;
      animPlaying = false;
      animFrameId = null;
      animLastTime = null;
      if (animPlayBtn) animPlayBtn.textContent = "Animate";
      loop();
    }
    redraw();
    if (animPlaying) animFrameId = requestAnimationFrame(animStep);
  }

  if (animPlayBtn) {
    animPlayBtn.addEventListener("click", () => {
      if (animPlaying) {
        stopAnimPlayback();
      } else {
        const total = segmentsData.length;
        if (animSegmentsRevealed >= total) animSegmentsRevealed = 0;
        animPlaying = true;
        animPlayBtn.textContent = "Stop animation";
        noLoop();
        animLastTime = null;
        animFrameId = requestAnimationFrame(animStep);
      }
    });
  }

  const stepButtons = document.querySelectorAll(".step-btn");
  stepButtons.forEach(btn => {
    const val = parseInt(btn.dataset.step, 10);
    if (val === currentStep) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => {
      currentStep = val;
      stepButtons.forEach(b => b.classList.toggle("active", b === btn));
      computeFromUI(false, false, false);
    });
  });

  document.getElementById("saveShapeBtn").addEventListener("click", openSaveModal);
  const libraryOverlay = document.getElementById("libraryOverlay");
  const libraryIframe = libraryOverlay && libraryOverlay.querySelector("iframe");
  document.getElementById("libraryBtn").addEventListener("click", () => {
    if (libraryIframe) {
      libraryIframe.src = "library.html";
      libraryOverlay.classList.add("visible");
    }
  });
  const captureBtn = document.getElementById("captureBtn");
  if (captureBtn) {
    captureBtn.addEventListener("click", async () => {
      flashCapture();
      try {
        await waitForCaptureFlashPaint();
        let saved = await saveGalleryCapture(captureGalleryPhoto(3072, 1728, 0.95));
        if (!saved) saved = await saveGalleryCapture(captureGalleryPhoto(1920, 1080, 0.9));
        if (!saved) saved = await saveGalleryCapture(captureGalleryPhoto(1280, 720, 0.85));
        if (!saved) saved = await saveGalleryCapture(captureGalleryPhoto(960, 540, 0.8));
        if (!saved) updateCaptureButtonState();
      } catch (err) {
        console.warn("Capture failed:", err);
        updateCaptureButtonState();
      }
    });
  }
  const libraryOverlayFsBtn = document.getElementById("libraryOverlayFsBtn");
  if (libraryOverlayFsBtn) {
    libraryOverlayFsBtn.addEventListener("click", () => toggleFullscreen());
  }
  window.addEventListener("message", (e) => {
    if (e.data === "hypo:close" && libraryOverlay) {
      libraryOverlay.classList.remove("visible");
      if (libraryIframe) libraryIframe.src = "about:blank";
      document.getElementById("fullscreenBtn")?.focus();
    } else if (e.data && e.data.type === "hypo:open" && e.data.hash) {
      if (libraryOverlay) {
        libraryOverlay.classList.remove("visible");
        if (libraryIframe) libraryIframe.src = "about:blank";
        document.getElementById("fullscreenBtn")?.focus();
      }
      let h = e.data.hash;
      if (e.data.entryId) {
        const hp = new URLSearchParams(h);
        hp.set("lid", e.data.entryId);
        h = hp.toString();
      }
      const prev = location.hash;
      location.hash = h;
      if (location.hash === prev) loadFromURL();
    }
  });
  window.addEventListener("hashchange", loadFromURL);
  document.getElementById("saveModalCancelBtn").addEventListener("click", closeSaveModal);
  document.getElementById("saveModalConfirmBtn").addEventListener("click", () => {
    saveShape();
    closeSaveModal();
  });
  document.getElementById("saveNameInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveShape();
      closeSaveModal();
    }
  });

  const copyLinkBtn = document.getElementById("copyLinkBtn");
  copyLinkBtn.addEventListener("click", () => {
    const url = encodeShapeToURL(getShapeParams());
    const confirm = (ok) => {
      copyLinkBtn.textContent = ok ? "✓ Copied" : "Copied";
      copyLinkBtn.classList.add("copied");
      setTimeout(() => { copyLinkBtn.textContent = "🔗 Copy Link"; copyLinkBtn.classList.remove("copied"); }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => confirm(true)).catch(() => confirm(false));
    } else {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.cssText = "position:fixed;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      confirm(true);
    }
  });

  loadFromURL();

}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  applyCanvasPixelDensity();
  // Keep baseScale in sync with the new canvas size (otherwise the next computeFromUI — e.g. when ρ Play runs — jumps the fit/zoom)
  computeFromUI(false, false, false);
  redraw();
}

function parseFrequency(str) {
  str = str.trim();
  if (!str) return null;
  if (str.includes("/")) {
    const parts = str.split("/");
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    if (!isFinite(num) || !isFinite(den) || den === 0) return null;
    return { value: num / den, denom: Math.abs(den) };
  }
  const v = parseFloat(str);
  if (!isFinite(v)) return null;
  // treat decimals as rationals so we can get the full period
  if (str.includes(".")) {
    const decimalPart = str.split(".")[1].replace(/[^0-9]/g, "");
    const digits = decimalPart.length;
    if (digits > 0) {
      let denom = Math.pow(10, digits);
      const numInt = Math.round(v * denom);
      const g = gcd(numInt, denom);
      denom = Math.abs(denom / g) || 1;
      return { value: v, denom };
    }
  }
  return { value: v, denom: 1 };
}

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

function lcm(a, b) {
  return Math.abs(a * b) / gcd(a, b);
}

function computeFromUI(resetColors = false, resetView = false, snapRhosValues = false, preserveRhos = false, allowAnimColorReset = false) {
  if (animMode && resetColors && !allowAnimColorReset) {
    resetColors = false;
  }
  const input = document.getElementById("freqs");
  const parts = input.value.split(/[, ]+/).filter(Boolean);
  const parsed = parts.map(parseFrequency).filter(f => f !== null);
  let step = currentStep || 4;
  const colorStepInput = document.getElementById("colorStep");
  let colorStep = colorStepFromSliderPos(colorStepInput ? colorStepInput.value : "566");
  if (!Number.isFinite(colorStep) || colorStep < 1) {
    colorStep = 50;
  }

  // color state: only (re)randomize when requested
  if (resetColors || !colorState.initialized) {
    colorState.r = floor(random(0, 256));
    colorState.g = floor(random(0, 256));
    colorState.b = floor(random(0, 256));
    colorState.rj = random([1, -1]);
    colorState.gj = random([1, -1]);
    colorState.bj = random([1, -1]);
    colorState.initialized = true;
  }
  let r = colorState.r;
  let g = colorState.g;
  let b = colorState.b;
  let rj = colorState.rj;
  let gj = colorState.gj;
  let bj = colorState.bj;

  // radii for each vector (random or controlled by sliders)
  const rhos = [];
  const slidersContainer = document.getElementById("rhoSliders");
  const lengthLabel = document.getElementById("lengthRatiosLabel");
  if (parsed.length === 0) {
    if (slidersContainer) { slidersContainer.style.display = "none"; slidersContainer.innerHTML = ""; lastSliderCount = 0; }
    if (lengthLabel) lengthLabel.style.display = "none";
    rhoAnimStates = [];
    closeRhoPopover();
    closePlayAllSpeedPopover();
    const existingRow = document.getElementById("playAllRow");
    if (existingRow) existingRow.remove();
  } else {
    if (slidersContainer) slidersContainer.style.display = "";
    if (lengthLabel) lengthLabel.style.display = "";
  }
  if (parsed.length > 0) {
    if (slidersContainer) {
      // build sliders once per frequency-count
      const existing = slidersContainer.querySelectorAll("input.rho-slider");
      if (existing.length !== parsed.length) {
        closeRhoPopover();
        closePlayAllSpeedPopover();
        slidersContainer.innerHTML = "";
        rhoAnimStates = new Array(parsed.length).fill(null);
        for (let i = 0; i < parsed.length; i++) {
          const row = document.createElement("div");
          row.className = "rho-row";

          const line = document.createElement("div");
          line.className = "rho-line";

          const slider = document.createElement("input");
          slider.type = "range";
          slider.className = "rho-slider";
          slider.min = String(DEFAULT_RHO_MIN);
          slider.max = String(DEFAULT_RHO_MAX);
          slider.step = "0.001";
          const initialRho =
            Array.isArray(currentRhos) && currentRhos.length === parsed.length
              ? currentRhos[i] || 0
              : 0;
          slider.value = String(initialRho);
          const state = { slider, dir: 1, active: false, button: null, speedMultiplier: 1, ticksEl: null, menuBtn: null };
          rhoAnimStates[i] = state;
          attachSliderTooltip(slider);
          slider.addEventListener("input", () => {
            const raw = parseFloat(slider.value);
            const smin = parseFloat(slider.min);
            const smax = parseFloat(slider.max);
            const snapped = snapRhoValue(isFinite(raw) ? raw : 0, smin, smax);
            slider.value = String(snapped);
            if (state.animValue != null) state.animValue = snapped;
            showSliderTooltip(slider);
            computeFromUI(false, false, false);
          });

          const menuBtn = document.createElement("button");
          menuBtn.type = "button";
          menuBtn.className = "rho-slider-menu";
          menuBtn.setAttribute("aria-label", "ρ value and slider range");
          menuBtn.setAttribute("aria-haspopup", "dialog");
          for (let d = 0; d < 3; d++) {
            menuBtn.appendChild(document.createElement("span"));
          }
          menuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleRhoPopover(state, menuBtn);
          });
          state.menuBtn = menuBtn;

          const play = document.createElement("button");
          play.type = "button";
          play.className = "rho-play";
          play.textContent = "▶";
          state.button = play;
          play.addEventListener("click", () => {
            state.active = !state.active;
            play.classList.toggle("active", state.active);
            if (state.active) startRhoAnimationLoop();
            updatePlayAllBtn();
          });

          const ticks = document.createElement("div");
          ticks.className = "rho-ticks";
          ticks.style.height = "14px";
          state.ticksEl = ticks;
          updateRhoTickLabels(state);

          const sliderCol = document.createElement("div");
          sliderCol.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;padding-top:5px;";
          sliderCol.appendChild(slider);
          sliderCol.appendChild(ticks);

          line.appendChild(sliderCol);
          line.appendChild(play);
          line.appendChild(createRhoSpeedControl(state));
          line.appendChild(menuBtn);

          row.appendChild(line);
          slidersContainer.appendChild(row);
        }
        addPlayAllButton(slidersContainer);
        lastSliderCount = parsed.length;
        requestAnimationFrame(() => requestAnimationFrame(positionRhoSliderMenus));
      }

      const sliders = slidersContainer.querySelectorAll("input.rho-slider");
      for (let i = 0; i < parsed.length; i++) {
        const s = sliders[i];
        const v = s ? parseFloat(s.value) : 0;
        const baseVal = isFinite(v) ? v : 0;
        const smin = s ? parseFloat(s.min) : DEFAULT_RHO_MIN;
        const smax = s ? parseFloat(s.max) : DEFAULT_RHO_MAX;
        rhos.push(snapRhosValues ? snapRhoValue(baseVal, smin, smax) : baseVal);
      }
    }
  } else if (preserveRhos && currentRhos.length === parsed.length) {
    for (let i = 0; i < parsed.length; i++) {
      rhos.push(currentRhos[i]);
    }
  }

  // remember last used rhos so we can seed sliders from them
  currentRhos = rhos.slice();

  // compute LCM of denominators to find full cycle
  let denomLCM = 1;
  if (parsed.length > 0) {
    denomLCM = parsed[0].denom;
    for (let i = 1; i < parsed.length; i++) {
      denomLCM = lcm(denomLCM, parsed[i].denom);
    }
  }
  const maxAngle = 360 * denomLCM;

  const angles = [];
  for (let a = 0; a <= maxAngle; a += step) {
    angles.push(a);
  }

  const x = [];
  const y = [];
  for (let i = 0; i < angles.length; i++) {
    const rad = angles[i] * Math.PI / 180;
    let xi = Math.cos(rad);
    let yi = Math.sin(rad);
    for (let j = 0; j < rhos.length; j++) {
      const freqVal = parsed[j].value;
      xi += rhos[j] * Math.cos(freqVal * rad);
      yi += rhos[j] * Math.sin(freqVal * rad);
    }
    x.push(xi);
    y.push(yi);
  }

  // compute scale so the curve fits nicely on screen
  let maxRadius = 0;
  for (let i = 0; i < x.length; i++) {
    const r2 = x[i] * x[i] + y[i] * y[i];
    if (r2 > maxRadius) maxRadius = r2;
  }
  maxRadius = Math.sqrt(maxRadius);
  if (maxRadius > 0) {
    const margin = 0.9;
    baseScale = (margin * Math.min(width, height)) / (2 * maxRadius);
  } else {
    baseScale = 1.0;
  }

  segmentsData = [];
  const segmentSize = colorStep;
  const numSegments = Math.ceil(x.length / segmentSize);
  for (let si = 0; si < numSegments; si++) {
    const i = si * segmentSize;
    const endIdx = Math.min(i + segmentSize + 1, x.length);
    const segX = x.slice(i, endIdx);
    const segY = y.slice(i, endIdx);

    let segColor;
    if (colorMode === 'rainbow') {
      segColor = rainbowColor(si + rainbowOffset);
    } else if (colorMode === 'mono') {
      segColor = hslToRgb(monoHue, 1, 0.5);
    } else {
      segColor = [r, g, b];
      if (r <= 0 || r >= 255) rj *= -1;
      if (g <= 0 || g >= 255) gj *= -1;
      if (b <= 0 || b >= 255) bj *= -1;
      r += rj; g += gj; b += bj;
    }
    segmentsData.push({ xs: segX, ys: segY, color: segColor });
  }

  // reset view only when explicitly requested (e.g. Draw)
  if (resetView) {
    zoomLevel = 1.0;
    offsetX = 0;
    offsetY = 0;
  }
  markShapeChanged();
}

function draw() {
  background(0);
  translate(width / 2 + offsetX, height / 2 + offsetY);
  scale(zoomLevel * baseScale);
  scale(1, -1);

  const s = zoomLevel * baseScale;
  if (s > 0) {
    strokeWeight(penWidth / s);
  } else {
    strokeWeight(penWidth);
  }

  const maxSeg = animMode ? Math.floor(animSegmentsRevealed) : segmentsData.length;
  for (let si = 0; si < maxSeg; si++) {
    const seg = segmentsData[si];
    if (!seg) continue;
    const [r, g, b] = seg.color;
    stroke(r, g, b, Math.round(lineOpacity * 255));
    beginShape();
    for (let i = 0; i < seg.xs.length; i++) {
      vertex(seg.xs[i], seg.ys[i]);
    }
    endShape();
  }
  const frac = animMode ? animSegmentsRevealed - maxSeg : 0;
  if (frac > 0 && maxSeg < segmentsData.length) {
    const seg = segmentsData[maxSeg];
    if (seg) {
      const [r, g, b] = seg.color;
      stroke(r, g, b, Math.round(lineOpacity * 255));
      beginShape();
      const n = Math.floor(frac * seg.xs.length);
      for (let i = 0; i <= n; i++) {
        vertex(seg.xs[i], seg.ys[i]);
      }
      endShape();
    }
  }
}

/** Zoom in or out around the canvas center (same math as wheel zoom with the cursor at the center). */
function zoomAtScreenCenter(zoomIn, isKeyRepeat = false) {
  const mouseRelX = 0;
  const mouseRelY = 0;
  const worldX = (mouseRelX - offsetX) / zoomLevel;
  const worldY = (mouseRelY - offsetY) / zoomLevel;
  const multIn = isKeyRepeat ? 1.01 : 1.05;
  const multOut = isKeyRepeat ? 0.99 : 0.95;
  if (zoomIn) {
    zoomLevel *= multIn;
  } else {
    zoomLevel *= multOut;
  }
  offsetX = mouseRelX - worldX * zoomLevel;
  offsetY = mouseRelY - worldY * zoomLevel;
  markShapeChanged();
  redraw();
}

function mouseWheel(event) {
  const el = document.elementFromPoint(mouseX, mouseY);
  if (el) {
    const ui = document.getElementById("ui");
    if (ui && ui.style.display !== "none" && ui.contains(el)) return;
    const rhoPop = document.getElementById("rhoSliderPopover");
    if (rhoPop && rhoPop.style.display !== "none" && rhoPop.contains(el)) return;
    const playAllSpd = document.getElementById("rhoPlayAllSpeedPopover");
    if (playAllSpd && playAllSpd.style.display !== "none" && playAllSpd.contains(el)) return;
  }
  const mouseRelX = mouseX - width / 2;
  const mouseRelY = mouseY - height / 2;
  const worldX = (mouseRelX - offsetX) / zoomLevel;
  const worldY = (mouseRelY - offsetY) / zoomLevel;

  if (event.delta > 0) {
    zoomLevel *= 0.9;
  } else {
    zoomLevel *= 1.1;
  }
  offsetX = mouseRelX - worldX * zoomLevel;
  offsetY = mouseRelY - worldY * zoomLevel;
  markShapeChanged();

  // prevent the page from scrolling so the UI box
  // visually stays fixed while using wheel-zoom
  return false;
}

function mouseDragged() {
  const el = document.elementFromPoint(mouseX, mouseY);
  if (el) {
    const ui = document.getElementById("ui");
    if (ui && ui.contains(el)) {
      // ignore drag for panning when over the UI,
      // but don't cancel the browser's default so sliders still work
      return;
    }
    const rhoPop = document.getElementById("rhoSliderPopover");
    if (rhoPop && rhoPop.style.display !== "none" && rhoPop.contains(el)) return;
    const playAllSpd = document.getElementById("rhoPlayAllSpeedPopover");
    if (playAllSpd && playAllSpd.style.display !== "none" && playAllSpd.contains(el)) return;
  }
  offsetX += movedX;
  offsetY += movedY;
  markShapeChanged();
}

// Enter fullscreen: elbows at outer corners, arms point inward (expand to fill screen)
const ICON_ENTER = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,5 1,1 5,1"/><polyline points="9,1 13,1 13,5"/><polyline points="1,9 1,13 5,13"/><polyline points="9,13 13,13 13,9"/></svg>`;
// Exit fullscreen: elbows near center, arms point outward (compress)
const ICON_EXIT  = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="5,1 5,5 1,5"/><polyline points="9,1 9,5 13,5"/><polyline points="1,9 5,9 5,13"/><polyline points="13,9 9,9 9,13"/></svg>`;
const ICON_CAMERA = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 4.2 6.3 2.8h3.4l1.1 1.4h2.1c.7 0 1.2.5 1.2 1.2v6.6c0 .7-.5 1.2-1.2 1.2H3.1c-.7 0-1.2-.5-1.2-1.2V5.4c0-.7.5-1.2 1.2-1.2h2.1Z"/><circle cx="8" cy="8.6" r="2.4"/></svg>`;
const FULLSCREEN_STATE_KEY = "hypo_fullscreen_state";

document.getElementById("closeUiBtn").addEventListener("click", () => {
  document.getElementById("ui").style.display = "none";
  document.getElementById("openUiBtn").style.display = "flex";
});

document.getElementById("openUiBtn").addEventListener("click", () => {
  document.getElementById("ui").style.display = "";
  document.getElementById("openUiBtn").style.display = "none";
  requestAnimationFrame(() => requestAnimationFrame(positionRhoSliderMenus));
});

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

const _fsBtn = document.getElementById("fullscreenBtn");
const _captureBtn = document.getElementById("captureBtn");
const _libraryOverlayFsBtn = document.getElementById("libraryOverlayFsBtn");
if (_captureBtn) _captureBtn.innerHTML = ICON_CAMERA;
function updateFullscreenButtonIcon() {
  const isFs = !!document.fullscreenElement;
  if (_fsBtn) _fsBtn.innerHTML = isFs ? ICON_EXIT : ICON_ENTER;
  if (_libraryOverlayFsBtn) _libraryOverlayFsBtn.innerHTML = isFs ? ICON_EXIT : ICON_ENTER;
}

function saveFullscreenState() {
  try {
    localStorage.setItem(FULLSCREEN_STATE_KEY, document.fullscreenElement ? "1" : "0");
  } catch (_) {
    // ignore storage errors
  }
}

updateFullscreenButtonIcon();
_fsBtn.addEventListener("click", toggleFullscreen);
saveFullscreenState();
document.addEventListener("fullscreenchange", () => {
  updateFullscreenButtonIcon();
  saveFullscreenState();
  requestAnimationFrame(positionRhoSliderMenus);
});

window.addEventListener("resize", () => requestAnimationFrame(positionRhoSliderMenus));

(function initRhoMenuLayoutObserver() {
  const ui = document.getElementById("ui");
  if (!ui) return;
  ui.addEventListener("scroll", () => requestAnimationFrame(positionRhoSliderMenus), { passive: true });
  if (typeof ResizeObserver === "undefined") return;
  const ro = new ResizeObserver(() => requestAnimationFrame(positionRhoSliderMenus));
  ro.observe(ui);
})();

document.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
  }
  if (e.key === "Enter" && document.activeElement && document.activeElement.tagName === "BUTTON") {
    e.preventDefault();
  }
  const tag = document.activeElement && document.activeElement.tagName;
  const isTyping = tag === "INPUT" || tag === "TEXTAREA";
  if (!isTyping) {
    const zoomInKey =
      e.key === "+" ||
      e.code === "NumpadAdd" ||
      (e.code === "Equal" && e.shiftKey);
    const zoomOutKey =
      e.key === "-" ||
      e.code === "NumpadSubtract" ||
      e.code === "Minus";
    if (zoomInKey) {
      e.preventDefault();
      zoomAtScreenCenter(true, e.repeat);
      return;
    }
    if (zoomOutKey) {
      e.preventDefault();
      zoomAtScreenCenter(false, e.repeat);
      return;
    }
  }
  if (e.key === "f" && !isTyping) {
    e.preventDefault();
    toggleFullscreen();
  }
  if (e.key === " " && !isTyping) {
    e.preventDefault();
    togglePlayAllRhos();
  }
});

function keyPressed() {
  if (keyCode === TAB) {
    zoomLevel = 1.0;
    offsetX = 0;
    offsetY = 0;
    return false;
  } else if (keyCode === ENTER) {
    performDrawAction();
    return false;
  }
}

