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
let colorMode = 'bounce'; // 'bounce' | 'rainbow' | 'mono'
let monoHue = 0;
const PEN_WIDTH_VALUES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4];
let penWidth = 1;
const OPACITY_VALUES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
let lineOpacity = 1;

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

function snapRhoValue(v) {
  const targets = [-1, 0, 1];
  const eps = 0.08;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (Math.abs(v - t) < eps) return t;
  }
  return v;
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
      state.slider.value = "0";
      state.animValue = null;
      state.dir = 1;
    }
    computeFromUI(false, false, false);
  });

  const randomBtn = document.createElement("button");
  randomBtn.id = "randomRhosBtn";
  randomBtn.textContent = "Random";
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
          const v = parseFloat((Math.random() * 4 - 2).toFixed(3));
          state.slider.value = String(v);
          state.animValue = v;
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
      const v = parseFloat((Math.random() * 4 - 2).toFixed(3));
      state.slider.value = String(v);
      state.animValue = v;
    }
    computeFromUI(false, false, false);
  });

  const playBtn = document.createElement("button");
  playBtn.id = "playAllBtn";
  playBtn.textContent = "▶ Play All";
  playBtn.addEventListener("click", () => {
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
    updatePlayAllBtn(playBtn);
  });

  row.appendChild(resetBtn);
  row.appendChild(randomBtn);
  row.appendChild(playBtn);
  container.appendChild(row);
}

function updatePlayAllBtn(btn) {
  if (!btn) btn = document.getElementById("playAllBtn");
  if (!btn) return;
  const anyActive = rhoAnimStates.some(s => s && s.active);
  btn.classList.toggle("active", anyActive);
  btn.textContent = anyActive ? "⏹ Stop All" : "▶ Play All";
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
  return wrap;
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
    if (state.animValue > 2) {
      state.animValue = 2;
      state.dir = -1;
    } else if (state.animValue < -2) {
      state.animValue = -2;
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

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent(document.body);
  pixelDensity(1);
  noFill();
  computeFromUI(true, true, true);

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
  const colorStepRow = document.getElementById("colorStepRow");
  const hueRow = document.getElementById("hueRow");
  paletteBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const wasActive = colorMode === btn.dataset.mode;
      colorMode = btn.dataset.mode;
      paletteBtns.forEach(b => b.classList.toggle("active", b === btn));
      colorStepRow.style.display = colorMode === 'mono' ? "none" : "";
      hueRow.style.display = colorMode === 'mono' ? "" : "none";
      if (wasActive && colorMode === 'bounce') {
        colorState.initialized = false;
      }
      computeFromUI(false, false, true, true);
    });
  });

  const hueSlider = document.getElementById("hueSlider");
  if (hueSlider) {
    hueSlider.addEventListener("input", () => {
      monoHue = parseInt(hueSlider.value, 10);
      computeFromUI(false, false, true, true);
    });
  }

  const colorStepSlider = document.getElementById("colorStep");
  const colorStepVal = document.getElementById("colorStepVal");
  if (colorStepSlider && colorStepVal) {
    colorStepSlider.addEventListener("input", () => {
      colorStepVal.value = colorStepSlider.value;
      computeFromUI(false, false, true, true);
    });
    colorStepVal.addEventListener("input", () => {
      const v = Math.min(200, Math.max(1, parseInt(colorStepVal.value, 10) || 1));
      colorStepSlider.value = v;
      computeFromUI(false, false, true, true);
    });
  }

  const penWidthValSpan = document.getElementById("penWidthValue");
  const penWidthDown = document.getElementById("penWidthDown");
  const penWidthUp = document.getElementById("penWidthUp");
  function updatePenWidthDisplay() {
    penWidthValSpan.textContent = String(penWidth);
    redraw();
  }
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

  const opacityValSpan = document.getElementById("opacityValue");
  const opacityDown = document.getElementById("opacityDown");
  const opacityUp = document.getElementById("opacityUp");
  function updateOpacityDisplay() {
    opacityValSpan.textContent = String(Math.round(lineOpacity * 10) / 10);
    redraw();
  }
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

  const drawBtn = document.getElementById("drawBtn");
  drawBtn.addEventListener("click", () => {
    if (randomRhosActive) {
      for (const state of rhoAnimStates) {
        if (!state) continue;
        const v = parseFloat((Math.random() * 4 - 2).toFixed(3));
        state.slider.value = String(v);
        state.animValue = null;
        state.dir = 1;
      }
    }
    computeFromUI(true, false, true);
  });

  const stepButtons = document.querySelectorAll(".step-btn");
  stepButtons.forEach(btn => {
    const val = parseInt(btn.dataset.step, 10);
    if (val === currentStep) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => {
      currentStep = val;
      stepButtons.forEach(b => b.classList.toggle("active", b === btn));
      computeFromUI(false, false, true);
    });
  });

}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
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

function computeFromUI(resetColors = false, resetView = false, snapRhosValues = true, preserveRhos = false) {
  const input = document.getElementById("freqs");
  const parts = input.value.split(/[, ]+/).filter(Boolean);
  const parsed = parts.map(parseFrequency).filter(f => f !== null);
  let step = currentStep || 4;
  const colorStepInput = document.getElementById("colorStep");
  let colorStep = parseInt(colorStepInput ? colorStepInput.value : "50", 10);
  if (!Number.isFinite(colorStep) || colorStep <= 0) {
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
          slider.min = "-2";
          slider.max = "2";
          slider.step = "0.001";
          const initialRho =
            Array.isArray(currentRhos) && currentRhos.length === parsed.length
              ? currentRhos[i] || 0
              : 0;
          slider.value = String(initialRho);
          const state = { slider, dir: 1, active: false, button: null, speedMultiplier: 1 };
          rhoAnimStates[i] = state;
          attachSliderTooltip(slider);
          slider.addEventListener("input", () => {
            const raw = parseFloat(slider.value);
            const snapped = snapRhoValue(isFinite(raw) ? raw : 0);
            slider.value = String(snapped);
            if (state.animValue != null) state.animValue = snapped;
            showSliderTooltip(slider);
            computeFromUI(false, false, true);
          });

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

          const sliderCol = document.createElement("div");
          sliderCol.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;padding-top:5px;";
          sliderCol.appendChild(slider);

          const ticks = document.createElement("div");
          ticks.className = "rho-ticks";
          const labels = ["-2", "-1", "0", "1", "2"];
          const offsets = [1, 2, 2, 2, 2];
          const positions = [0, 25, 50, 75, 100];
          for (let li = 0; li < labels.length; li++) {
            const span = document.createElement("span");
            span.textContent = labels[li];
            span.style.cssText = `position:absolute;left:calc(${positions[li]}% + ${5 - positions[li] * 0.1 + offsets[li]}px);transform:translateX(-50%);`;
            ticks.appendChild(span);
          }
          ticks.style.height = "14px";
          sliderCol.appendChild(ticks);

          line.appendChild(sliderCol);
          line.appendChild(play);
          line.appendChild(createRhoSpeedControl(state));

          row.appendChild(line);
          slidersContainer.appendChild(row);
        }
        addPlayAllButton(slidersContainer);
        lastSliderCount = parsed.length;
      }

      const sliders = slidersContainer.querySelectorAll("input.rho-slider");
      for (let i = 0; i < parsed.length; i++) {
        const s = sliders[i];
        const v = s ? parseFloat(s.value) : 0;
        const baseVal = isFinite(v) ? v : 0;
        rhos.push(snapRhosValues ? snapRhoValue(baseVal) : baseVal);
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
      segColor = rainbowColor(si);
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
}

function draw() {
  background(0);
  translate(width / 2 + offsetX, height / 2 + offsetY);
  scale(zoomLevel * baseScale);

  const s = zoomLevel * baseScale;
  if (s > 0) {
    strokeWeight(penWidth / s);
  } else {
    strokeWeight(penWidth);
  }

  for (const seg of segmentsData) {
    const [r, g, b] = seg.color;
    stroke(r, g, b, Math.round(lineOpacity * 255));
    beginShape();
    for (let i = 0; i < seg.xs.length; i++) {
      vertex(seg.xs[i], seg.ys[i]);
    }
    endShape();
  }
}

function mouseWheel(event) {
  const ui = document.getElementById("ui");
  if (ui && ui.style.display !== "none") {
    const el = document.elementFromPoint(mouseX, mouseY);
    if (el && ui.contains(el)) return;
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

  // prevent the page from scrolling so the UI box
  // visually stays fixed while using wheel-zoom
  return false;
}

function mouseDragged() {
  const ui = document.getElementById("ui");
  if (ui) {
    const el = document.elementFromPoint(mouseX, mouseY);
    if (el && ui.contains(el)) {
      // ignore drag for panning when over the UI,
      // but don't cancel the browser's default so sliders still work
      return;
    }
  }
  offsetX += movedX;
  offsetY += movedY;
}

// Enter fullscreen: elbows at outer corners, arms point inward (expand to fill screen)
const ICON_ENTER = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,5 1,1 5,1"/><polyline points="9,1 13,1 13,5"/><polyline points="1,9 1,13 5,13"/><polyline points="9,13 13,13 13,9"/></svg>`;
// Exit fullscreen: elbows near center, arms point outward (compress)
const ICON_EXIT  = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="5,1 5,5 1,5"/><polyline points="9,1 9,5 13,5"/><polyline points="1,9 5,9 5,13"/><polyline points="13,9 9,9 9,13"/></svg>`;

document.getElementById("closeUiBtn").addEventListener("click", () => {
  document.getElementById("ui").style.display = "none";
  document.getElementById("openUiBtn").style.display = "flex";
});

document.getElementById("openUiBtn").addEventListener("click", () => {
  document.getElementById("ui").style.display = "";
  document.getElementById("openUiBtn").style.display = "none";
});

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

const _fsBtn = document.getElementById("fullscreenBtn");
_fsBtn.innerHTML = ICON_ENTER;
_fsBtn.addEventListener("click", toggleFullscreen);

document.addEventListener("fullscreenchange", () => {
  document.getElementById("fullscreenBtn").innerHTML = document.fullscreenElement ? ICON_EXIT : ICON_ENTER;
});

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
  if (e.key === "f" && !isTyping) {
    e.preventDefault();
    toggleFullscreen();
  }
  if (e.key === " " && !isTyping) {
    e.preventDefault();
    const playAllBtn = document.getElementById("playAllBtn");
    if (playAllBtn) playAllBtn.click();
  }
});

function keyPressed() {
  if (keyCode === TAB) {
    zoomLevel = 1.0;
    offsetX = 0;
    offsetY = 0;
    return false;
  } else if (keyCode === ENTER) {
    if (randomRhosActive) {
      for (const state of rhoAnimStates) {
        if (!state) continue;
        const v = parseFloat((Math.random() * 4 - 2).toFixed(3));
        state.slider.value = String(v);
        state.animValue = null;
        state.dir = 1;
      }
    }
    computeFromUI(true, false, true);
  }
}

