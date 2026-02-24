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
let colorState = {
  r: 0,
  g: 0,
  b: 0,
  rj: 1,
  gj: 1,
  bj: 1,
  initialized: false,
};

function snapRhoValue(v) {
  const targets = [-1, 0, 1];
  const eps = 0.08;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (Math.abs(v - t) < eps) return t;
  }
  return v;
}

function startRhoAnimationLoop() {
  if (rhoAnimFrameId !== null) return;
  rhoAnimFrameId = requestAnimationFrame(rhoAnimationStep);
}

function rhoAnimationStep() {
  let anyActive = false;
  const speed = 0.02; // slider units per frame

  for (const state of rhoAnimStates) {
    if (!state || !state.active || !state.slider) continue;
    anyActive = true;
    let v = parseFloat(state.slider.value);
    if (!isFinite(v)) v = 0;
    v += state.dir * speed;
    if (v > 2) {
      v = 2;
      state.dir = -1;
    } else if (v < -2) {
      v = -2;
      state.dir = 1;
    }
    state.slider.value = String(v);
  }

  if (anyActive) {
    // animate without snapping or resetting view/colors
    computeFromUI(false, false, false);
    rhoAnimFrameId = requestAnimationFrame(rhoAnimationStep);
  } else {
    rhoAnimFrameId = null;
  }
}

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent(document.body);
  pixelDensity(1);
  noFill();
  computeFromUI(true, true, true);

  const drawBtn = document.getElementById("drawBtn");
  drawBtn.addEventListener("click", () => computeFromUI(true, true, true));

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

  const randomToggle = document.getElementById("randomRhos");
  if (randomToggle) {
    randomToggle.addEventListener("change", () => {
      const container = document.getElementById("rhoSliders");
      if (randomToggle.checked) {
        // back to random: hide sliders and recompute with new random rhos
        if (container) {
          container.style.display = "none";
          container.innerHTML = "";
          lastSliderCount = 0;
        }
        computeFromUI(false, false, true);
      } else {
        // turn off random: keep current shape and seed sliders from currentRhos
        if (container) {
          container.style.display = "block";

          const input = document.getElementById("freqs");
          const parts = input.value.split(/[, ]+/).filter(Boolean);
          const parsed = parts.map(parseFrequency).filter(f => f !== null);

          container.innerHTML = "";
          lastSliderCount = parsed.length;
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
            slider.step = "0.01";
            const initialRho =
              Array.isArray(currentRhos) && currentRhos.length === parsed.length
                ? currentRhos[i] || 0
                : 0;
            slider.value = String(initialRho);
            slider.addEventListener("input", () => {
              const raw = parseFloat(slider.value);
              const snapped = snapRhoValue(isFinite(raw) ? raw : 0);
              slider.value = String(snapped);
              computeFromUI(false, false, true);
            });

            const play = document.createElement("button");
            play.type = "button";
            play.className = "rho-play";
            play.textContent = "▶";

            const state = { slider, dir: 1, active: false, button: play };
            rhoAnimStates[i] = state;

            play.addEventListener("click", () => {
              state.active = !state.active;
              play.classList.toggle("active", state.active);
              if (state.active) {
                startRhoAnimationLoop();
              }
            });

            line.appendChild(slider);
            line.appendChild(play);

            const ticks = document.createElement("div");
            ticks.className = "rho-ticks";
            const labels = ["-2", "-1", "0", "1", "2"];
            for (const txt of labels) {
              const span = document.createElement("span");
              span.textContent = txt;
              ticks.appendChild(span);
            }

            row.appendChild(line);
            row.appendChild(ticks);
            container.appendChild(row);
          }
        }
      }
    });
  }
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

function computeFromUI(resetColors = false, resetView = false, snapRhosValues = true) {
  const input = document.getElementById("freqs");
  const parts = input.value.split(/[, ]+/).filter(Boolean);
  const parsed = parts.map(parseFrequency).filter(f => f !== null);
  let step = currentStep || 4;
  const colorStepInput = document.getElementById("colorStep");
  let colorStep = parseInt(colorStepInput ? colorStepInput.value : "50", 10);
  if (!Number.isFinite(colorStep) || colorStep <= 0) {
    colorStep = 50;
  }

  const randomToggle = document.getElementById("randomRhos");
  const useRandomRhos = !randomToggle || randomToggle.checked;

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
  if (!useRandomRhos && parsed.length > 0) {
    if (slidersContainer) {
      // build sliders once per frequency-count
      const existing = slidersContainer.querySelectorAll("input.rho-slider");
      if (existing.length !== parsed.length) {
        slidersContainer.innerHTML = "";
        for (let i = 0; i < parsed.length; i++) {
          const row = document.createElement("div");
          row.className = "rho-row";

          const slider = document.createElement("input");
          slider.type = "range";
          slider.className = "rho-slider";
          slider.min = "-2";
          slider.max = "2";
          slider.step = "0.01";
          const initialRho =
            Array.isArray(currentRhos) && currentRhos.length === parsed.length
              ? currentRhos[i] || 0
              : 0;
          slider.value = String(initialRho);
          slider.addEventListener("input", () => {
            const raw = parseFloat(slider.value);
            const snapped = snapRhoValue(isFinite(raw) ? raw : 0);
            slider.value = String(snapped);
            computeFromUI(false, false, true);
          });

          const ticks = document.createElement("div");
          ticks.className = "rho-ticks";
          const labels = ["-2", "-1", "0", "1", "2"];
          for (const txt of labels) {
            const span = document.createElement("span");
            span.textContent = txt;
            ticks.appendChild(span);
          }

          row.appendChild(slider);
          row.appendChild(ticks);
          slidersContainer.appendChild(row);
        }
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
  } else {
    if (slidersContainer) {
      slidersContainer.style.display = "none";
      slidersContainer.innerHTML = "";
      lastSliderCount = 0;
    }
    for (let i = 0; i < parsed.length; i++) {
      rhos.push(random(-2, 2));
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
  for (let i = 0; i < x.length; i += segmentSize) {
    const endIdx = Math.min(i + segmentSize + 1, x.length);
    const segX = x.slice(i, endIdx);
    const segY = y.slice(i, endIdx);
    segmentsData.push({ xs: segX, ys: segY, color: [r, g, b] });

    if (r <= 0 || r >= 255) rj *= -1;
    if (g <= 0 || g >= 255) gj *= -1;
    if (b <= 0 || b >= 255) bj *= -1;
    r += rj;
    g += gj;
    b += bj;
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

  // keep stroke width ~1px on screen regardless of zoom
  const s = zoomLevel * baseScale;
  if (s > 0) {
    strokeWeight(1 / s);
  } else {
    strokeWeight(1);
  }

  for (const seg of segmentsData) {
    const [r, g, b] = seg.color;
    stroke(r, g, b);
    beginShape();
    for (let i = 0; i < seg.xs.length; i++) {
      vertex(seg.xs[i], seg.ys[i]);
    }
    endShape();
  }
}

function mouseWheel(event) {
  // zoom towards mouse position, similar to Python version
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

function keyPressed() {
  if (keyCode === TAB) {
    zoomLevel = 1.0;
    offsetX = 0;
    offsetY = 0;
  } else if (keyCode === ENTER) {
    computeFromUI(true, true, true);
  }
}
