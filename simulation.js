'use strict';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const bob = document.getElementById('bob');
const toggle = document.getElementById('toggle');
const reset = document.getElementById('reset');
const trailToggle = document.getElementById('trail');
const timeLabel = document.getElementById('time');
const angles = [document.getElementById('a1'), document.getElementById('a2')];
const outputs = [document.getElementById('a1out'), document.getElementById('a2out')];
const g = 9.81;
const dt = 1 / 240;
let launchAngles = angles.map(input => Number(input.value) * Math.PI / 180);
let drag;
let state, time, points, running = false, previous, accumulator, width, height;

// Unit masses and rod lengths. Angles are measured from straight down.
function derivative([a, b, u, v]) {
  const c = Math.cos(a - b);
  const s = Math.sin(a - b);
  const p = -2 * g * Math.sin(a) - v * v * s;
  const q = -g * Math.sin(b) + u * u * s;
  const det = 2 - c * c;
  return [u, v, (p - c * q) / det, (2 * q - c * p) / det];
}

function integrate(y, step) {
  const offset = (base, dy, h) => base.map((x, i) => x + dy[i] * h);
  const a = derivative(y);
  const b = derivative(offset(y, a, step / 2));
  const c = derivative(offset(y, b, step / 2));
  const d = derivative(offset(y, c, step));
  return y.map((x, i) => x + step * (a[i] + 2*b[i] + 2*c[i] + d[i]) / 6);
}

function positions([a, b]) {
  const first = [Math.sin(a), Math.cos(a)];
  return [first, [first[0] + Math.sin(b), first[1] + Math.cos(b)]];
}

// Invert the two unit-length links; pick the elbow closest to the last pose.
function closestAngles(x, y, [a, b]) {
  const radius = Math.hypot(x, y);
  if (radius < 1e-8) return [a, a + Math.PI];
  const heading = Math.atan2(x, y);
  const bend = Math.acos(Math.min(1, radius / 2));
  const candidates = [[heading + bend, heading - bend], [heading - bend, heading + bend]];
  const distance = target => target.reduce((d, angle, i) => {
    const delta = angle - (i ? b : a);
    return d + Math.atan2(Math.sin(delta), Math.cos(delta)) ** 2;
  }, 0);
  return distance(candidates[0]) <= distance(candidates[1]) ? candidates[0] : candidates[1];
}

const displayScale = () => Math.min(width, height) * .215;

function draw() {
  if (!width || !height) return;
  ctx.clearRect(0, 0, width, height);
  const unit = displayScale();
  const project = ([x, y]) => [width / 2 + x * unit, height / 2 + y * unit];
  if (trailToggle.checked) {
    ctx.lineWidth = 2;
    for (let i = 1; i < points.length; i++) {
      ctx.beginPath();
      ctx.moveTo(...project(points[i - 1]));
      ctx.lineTo(...project(points[i]));
      ctx.strokeStyle = 'rgba(186,255,131,' + (.67 * (i / points.length) ** 1.5) + ')';
      ctx.stroke();
    }
  }
  const origin = project([0, 0]);
  const [first, second] = positions(state).map(project);
  bob.style.transform = `translate(${second[0]}px, ${second[1]}px)`;
  ctx.beginPath();
  ctx.moveTo(...origin);
  ctx.lineTo(...first);
  ctx.lineTo(...second);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#c5d6c8';
  ctx.lineCap = 'round';
  ctx.stroke();
  for (const [point, radius, fill] of [[origin, 4, '#c5d6c8'], [first, 8, '#f0f5e9'], [second, 10, '#baff83']]) {
    ctx.beginPath();
    ctx.arc(...point, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  timeLabel.textContent = 'T + ' + time.toFixed(2) + ' s';
}

function resize() {
  const box = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  width = box.width;
  height = box.height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function setRunning(next) {
  running = next;
  previous = undefined;
  toggle.textContent = running ? '일시정지' : time > 0 ? '계속' : '시작';
}

function restart() {
  state = [...launchAngles, 0, 0];
  time = accumulator = 0;
  points = [positions(state)[1]];
  angles.forEach((input, i) => {
    const a = launchAngles[i];
    const degrees = Math.atan2(Math.sin(a), Math.cos(a)) * 180 / Math.PI;
    input.value = String(Math.round(degrees * 10) / 10);
    outputs[i].value = input.value + '°';
    input.setAttribute('aria-valuetext', input.value + '도');
  });
  setRunning(false);
  draw();
}

toggle.addEventListener('click', () => { if (!drag) setRunning(!running); });
reset.addEventListener('click', restart);
trailToggle.addEventListener('change', draw);
angles.forEach((input, i) => input.addEventListener('input', () => {
  launchAngles[i] = Number(input.value) * Math.PI / 180;
  restart();
}));

bob.addEventListener('pointerdown', event => {
  if (drag || event.button !== 0) return;
  const rect = bob.getBoundingClientRect();
  drag = { id: event.pointerId, x: event.clientX - rect.left - rect.width / 2,
    y: event.clientY - rect.top - rect.height / 2 };
  bob.setPointerCapture(drag.id);
  bob.classList.add('dragging');
  launchAngles = state.slice(0, 2);
  restart();
});
function dragBob(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - drag.x - rect.left - width / 2) / displayScale();
  const y = (event.clientY - drag.y - rect.top - height / 2) / displayScale();
  launchAngles = closestAngles(x, y, state);
  restart();
}
function endDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  drag = undefined;
  bob.classList.remove('dragging');
}
bob.addEventListener('pointermove', dragBob);
bob.addEventListener('pointerup', event => { dragBob(event); endDrag(event); });
bob.addEventListener('pointercancel', endDrag);
bob.addEventListener('lostpointercapture', endDrag);
restart();
resize();
new ResizeObserver(resize).observe(canvas);

function tick(now) {
  if (running) {
    accumulator += previous === undefined ? 0 : Math.min(.06, (now - previous) / 1000);
    previous = now;
    const oldTime = time;
    while (accumulator >= dt) {
      state = integrate(state, dt);
      time += dt;
      accumulator -= dt;
    }
    if (time !== oldTime) {
      points.push(positions(state)[1]);
      if (points.length > 300) points.shift();
      draw();
    }
  }
  requestAnimationFrame(tick);
}

document.addEventListener('visibilitychange', () => { previous = undefined; });
requestAnimationFrame(tick);
