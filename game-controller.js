import * as THREE from 'three';
import { DrivingGame, GAME_RULES } from './driving-game.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const keyControls = { KeyW: 'throttle', ArrowUp: 'throttle', KeyS: 'brake', ArrowDown: 'brake', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'boost', ShiftRight: 'boost' };
const drivingStatuses = ['countdown', 'running'];

export class GameController {
  constructor({ scene, camera, controls, carRig, car, renderer, onEnter, onExit, reducedMotion }) {
    Object.assign(this, { scene, camera, controls, carRig, car, renderer, onEnter, onExit, reducedMotion });
    this.game = new DrivingGame();
    this.active = false;
    this.keys = new Set();
    this.pointers = new Map();
    this.trafficModels = new Map();
    this.pool = [];
    this.trafficGroup = new THREE.Group();
    this.trafficGroup.visible = false;
    scene.add(this.trafficGroup);
    this.view = 'chase';
    this.flash = 0;
    this.calloutUntil = 0;
    this.best = this.readBest();
    this.cameraPosition = new THREE.Vector3();
    this.cameraLook = new THREE.Vector3();
    this.frontWheels = ['wheel_fl', 'wheel_fr'].map(name => car.getObjectByName(name)).filter(Boolean).map(object => ({ object, angle: object.rotation.y }));
    this.bindEvents();
  }

  readBest() {
    try { return Math.max(0, Number(localStorage.getItem('omnidrive-best-score')) || 0); }
    catch { return 0; }
  }

  saveBest() {
    this.best = Math.max(this.best, this.game.score);
    try { localStorage.setItem('omnidrive-best-score', String(this.best)); }
    catch { /* Playing remains available when browser storage is disabled. */ }
  }

  clearInput() {
    this.keys.clear();
    this.pointers.clear();
    $$('[data-control]').forEach(button => {
      button.classList.remove('held');
      button.setAttribute('aria-pressed', 'false');
    });
  }

  getInput() {
    const input = {};
    for (const code of this.keys) input[keyControls[code]] = true;
    for (const control of this.pointers.values()) input[control] = true;
    return input;
  }

  open() {
    if (this.active) return;
    this.active = true;
    this.onEnter();
    $('#experience').classList.add('gaming');
    $('#game-hud').hidden = false;
    $('#viewport').setAttribute('tabindex', '0');
    $('#viewport').setAttribute('aria-label', 'Driving game. W or up to accelerate, S or down to brake, A and D or left and right to steer, Shift to boost. Escape pauses.');
    this.controls.enabled = false;
    this.controls.autoRotate = false;
    this.game.reset();
    this.view = 'chase';
    this.resetTraffic();
    this.resize();
    this.showCard('ready');
    this.updateHud();
    this.updateCamera(1, true);
  }

  start() {
    this.clearInput();
    this.resetTraffic();
    this.game.start();
    this.flash = 0;
    $('#damage-flash').style.opacity = '0';
    $('#game-overlay').hidden = true;
    $('#game-hud').inert = false;
    $('#game-countdown').hidden = false;
    $('#game-callout').classList.remove('visible');
    this.carRig.visible = true;
    this.updateHud();
    this.updateCamera(1, true);
    $('#viewport').focus({ preventScroll: true });
  }

  exit(mode = 'drive') {
    this.active = false;
    this.game.reset();
    this.clearInput();
    this.resetTraffic();
    this.trafficGroup.visible = false;
    this.carRig.position.set(0, 0, 0);
    this.carRig.rotation.set(0, 0, 0);
    this.carRig.visible = true;
    this.frontWheels.forEach(({ object, angle }) => { object.rotation.y = angle; });
    $('#experience').classList.remove('gaming', 'boosting');
    $('#game-hud').hidden = true;
    $('#game-overlay').hidden = true;
    $('#game-countdown').hidden = true;
    $('#damage-flash').style.opacity = '0';
    $('#viewport').removeAttribute('tabindex');
    $('#viewport').setAttribute('aria-label', 'Interactive 3D sports car. Drag to rotate the camera, or use the camera buttons.');
    this.camera.fov = 36;
    this.controls.enabled = true;
    this.onExit(mode);
  }

  togglePause() {
    if (this.game.status === 'paused') {
      this.clearInput();
      this.game.resume();
      $('#game-overlay').hidden = true;
      $('#game-hud').inert = false;
      $('#viewport').focus({ preventScroll: true });
    } else if (drivingStatuses.includes(this.game.status)) {
      this.game.pause();
      this.clearInput();
      $('#game-countdown').hidden = true;
      this.showCard('paused');
    }
    this.updateHud();
  }

  showCard(type) {
    const paused = type === 'paused';
    const over = type === 'over';
    const won = over && this.game.won;
    $('#game-overlay').hidden = false;
    $('#game-overlay').setAttribute('role', 'dialog');
    $('#game-overlay').setAttribute('aria-modal', 'true');
    $('#game-hud').inert = true;
    $('#game-card-eyebrow').textContent = paused ? 'TAKE A BREATHER' : over ? won ? 'COASTAL SPRINT · COMPLETE' : 'THE ROAD WILL BE HERE' : 'COASTAL SPRINT · 2 KM';
    // All strings here are fixed application copy, never user content.
    $('#game-title').innerHTML = paused ? 'A moment.<br><span>Then go again.</span>' : over ? won ? 'Coast.<br><span>Conquered.</span>' : 'Quite a ride.<br><span>One more?</span>' : 'Your road.<br><span>Your rules.</span>';
    $('#game-description').textContent = paused ? 'Your run is paused. Resume when you’re ready, or start fresh.' : over ? won ? 'Two kilometers, all yours. Take another run and chase a new personal best.' : 'Your car needs a little care. Try a cleaner line, brake for traffic, and keep off the barriers.' : 'Take control of the 458. Weave through traffic, keep your car in one piece, and reach the finish.';
    $('#game-control-guide').hidden = over || paused;
    $('.touch-guide').hidden = over || paused;
    $('#game-results').hidden = !over;
    $('#game-tip').textContent = paused ? 'Esc / P to resume · R to restart · C to change camera' : 'Clean overtakes +75 · Near misses +200 · Reach the finish for a bonus';
    $('#start-game').innerHTML = `${paused ? 'Back to the road' : over ? 'Drive again' : 'Start engine'} <svg><use href="#i-arrow"/></svg>`;
    $('#back-to-drive').textContent = 'Back to the experience';
    $('#best-score').textContent = this.best.toLocaleString();
    if (over) {
      $('#result-score').textContent = this.game.score.toLocaleString();
      $('#result-distance').textContent = `${Math.floor(this.game.distance).toLocaleString()} m`;
      $('#result-overtakes').textContent = this.game.overtakes;
      $('#result-speed').textContent = `${Math.round(this.game.topSpeed)} km/h`;
    }
    $('#start-game').focus({ preventScroll: true });
  }

  callout(message, now) {
    $('#game-callout').textContent = message;
    $('#game-callout').classList.add('visible');
    this.calloutUntil = now + 1700;
  }

  resetTraffic() {
    for (const model of this.trafficModels.values()) {
      model.visible = false;
      this.pool.push(model);
    }
    this.trafficModels.clear();
  }

  createTrafficCar() {
    // Simple shared car geometry keeps traffic inexpensive on mobile GPUs.
    const group = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: '#789399', metalness: 0.65, roughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: '#10171d', metalness: 0.2, roughness: 0.25 });
    const tireMaterial = new THREE.MeshStandardMaterial({ color: '#171a19', roughness: 0.95 });
    const alloy = new THREE.MeshStandardMaterial({ color: '#9ba4a6', metalness: 0.85, roughness: 0.25 });
    const red = new THREE.MeshBasicMaterial({ color: '#fb472f', toneMapped: false });
    const white = new THREE.MeshBasicMaterial({ color: '#dddcc3', toneMapped: false });
    const mesh = (geometry, material, position) => {
      const object = new THREE.Mesh(geometry, material);
      object.position.set(...position);
      group.add(object);
      return object;
    };
    const body = mesh(new THREE.BoxGeometry(1.82, 0.43, 4.15), paint, [0, 0.54, 0]);
    body.castShadow = true;
    const cabin = mesh(new THREE.BoxGeometry(1.5, 0.55, 1.9), dark, [0, 1.0, 0.18]);
    cabin.castShadow = true;
    mesh(new THREE.BoxGeometry(1.53, 0.07, 1.75), paint, [0, 1.3, 0.22]);
    mesh(new THREE.BoxGeometry(1.8, 0.13, 0.09), dark, [0, 0.42, 2.1]);
    mesh(new THREE.BoxGeometry(1.8, 0.13, 0.09), dark, [0, 0.42, -2.1]);
    const wheelGeometry = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 12);
    const rimGeometry = new THREE.CylinderGeometry(0.19, 0.19, 0.205, 10);
    const rotating = [];
    for (const x of [-0.88, 0.88]) {
      for (const z of [-1.3, 1.35]) {
        const tire = mesh(wheelGeometry, tireMaterial, [x, 0.31, z]);
        tire.rotation.z = Math.PI / 2;
        const rim = mesh(rimGeometry, alloy, [x * 1.015, 0.31, z]);
        rim.rotation.z = Math.PI / 2;
        rotating.push(tire, rim);
      }
      mesh(new THREE.BoxGeometry(0.3, 0.12, 0.07), red, [x * 0.8, 0.65, 2.1]);
      mesh(new THREE.BoxGeometry(0.3, 0.1, 0.07), white, [x * 0.8, 0.65, -2.1]);
    }
    group.userData.paint = paint;
    group.userData.wheels = rotating;
    this.trafficGroup.add(group);
    return group;
  }

  syncTraffic(dt) {
    const ids = new Set(this.game.traffic.map(vehicle => vehicle.id));
    for (const [id, model] of this.trafficModels) {
      if (!ids.has(id)) {
        model.visible = false;
        this.trafficModels.delete(id);
        this.pool.push(model);
      }
    }
    const colors = ['#627d88', '#b8aa8b', '#a3483a', '#d0d1cb', '#47584c'];
    for (const vehicle of this.game.traffic) {
      let model = this.trafficModels.get(vehicle.id);
      if (!model) {
        model = this.pool.pop() || this.createTrafficCar();
        model.userData.paint.color.set(colors[vehicle.color]);
        this.trafficModels.set(vehicle.id, model);
      }
      model.visible = true;
      model.position.set(vehicle.x, 0, vehicle.z);
      for (const wheel of model.userData.wheels) wheel.rotation.y -= vehicle.speed / 3.6 / 0.32 * dt;
    }
  }

  resize() {
    this.camera.aspect = window.innerWidth / $('#experience').clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, $('#experience').clientHeight);
  }

  updateCamera(dt, snap = false) {
    const game = this.game;
    const mobile = window.innerWidth < 680;
    if (this.view === 'hood') {
      this.cameraPosition.set(game.x, 1.03, -1.45);
      this.cameraLook.set(game.x + game.lateralSpeed * 0.18, 0.75, -45);
    } else {
      this.cameraPosition.set(game.x * 0.65, mobile ? 3.6 : 3.1, mobile ? 9 : 7.6);
      this.cameraLook.set(game.x * 0.82 + game.lateralSpeed * 0.08, 0.65, mobile ? -11 : -13);
    }
    const smoothing = snap ? 1 : 1 - Math.exp(-7 * dt);
    this.camera.position.lerp(this.cameraPosition, smoothing);
    if (this.flash > 0 && !this.reducedMotion && this.game.status === 'running') {
      this.camera.position.x += Math.sin(performance.now() * 0.05) * this.flash * 0.08;
    }
    this.camera.lookAt(this.cameraLook);
    const targetFov = (this.view === 'hood' ? 70 : mobile ? 66 : 58) + (this.reducedMotion ? 0 : Math.min(game.speed / 38, 5) + (game.boosting ? 5 : 0));
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, snap ? 1 : 1 - Math.exp(-3 * dt));
    this.camera.updateProjectionMatrix();
  }

  updateHud() {
    const game = this.game;
    $('#game-speed').textContent = Math.round(game.speed);
    $('#game-distance').textContent = Math.min(GAME_RULES.finishDistance, Math.floor(game.distance)).toLocaleString();
    $('#game-time').textContent = `${String(Math.floor(game.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(game.elapsed % 60)).padStart(2, '0')}`;
    $('#game-score').textContent = game.score.toLocaleString();
    $('#game-gear').textContent = game.speed < 1 ? 'N' : `D${Math.min(7, Math.max(1, Math.ceil(game.speed / 32)))}`;
    $('#race-progress-fill').style.width = `${Math.min(100, game.distance / GAME_RULES.finishDistance * 100)}%`;
    $('#race-progress').setAttribute('aria-valuenow', String(Math.min(GAME_RULES.finishDistance, Math.floor(game.distance))));
    $('#game-health-fill').style.width = `${game.health}%`;
    $('#game-health-fill').classList.toggle('low', game.health < 35);
    $('#game-health').setAttribute('aria-valuenow', String(Math.round(game.health)));
    $('#game-health-label').textContent = `${Math.round(game.health)}%`;
    $('#game-boost-fill').style.width = `${game.boost}%`;
    $('#game-boost').setAttribute('aria-valuenow', String(Math.round(game.boost)));
    $('#game-boost-label').innerHTML = `${game.boosting ? 'ACTIVE' : game.boost > 25 ? 'READY' : 'CHARGING'} <kbd>SHIFT</kbd>`;
    $('#game-pause').setAttribute('aria-label', game.status === 'paused' ? 'Resume game' : 'Pause game');
  }

  update(dt, now) {
    const game = this.game;
    const previousDistance = game.distance;
    const events = game.update(dt, this.getInput());
    const meters = game.distance - previousDistance;
    const running = game.status === 'running';
    for (const event of events) {
      if (event.type === 'collision') {
        this.flash = 1;
        this.callout('IMPACT · Watch your line', now);
      } else if (event.type === 'near-miss') this.callout('CLOSE CALL +200', now);
      else if (event.type === 'overtake') this.callout('CLEAN PASS +75', now);
      else if (event.type === 'go') this.callout('GO · Hold W or ↑ to accelerate', now);
      else if (event.type === 'finish') {
        this.clearInput();
        this.saveBest();
        this.showCard('over');
      }
    }
    this.trafficGroup.visible = game.status !== 'ready';
    this.syncTraffic(running ? dt : 0);
    this.flash = Math.max(0, this.flash - dt * 2.3);
    $('#damage-flash').style.opacity = this.flash * (this.reducedMotion ? 0.18 : 0.6);
    $('#experience').classList.toggle('boosting', running && game.boosting);
    if (now > this.calloutUntil) $('#game-callout').classList.remove('visible');
    $('#game-countdown').hidden = game.status !== 'countdown';
    if (game.status === 'countdown') {
      const next = String(Math.ceil(game.countdown));
      if ($('#game-countdown').dataset.value !== next) {
        $('#game-countdown').dataset.value = next;
        $('#game-countdown').innerHTML = `<span>GET READY</span><strong>${next}</strong><span>THE ROAD IS YOURS</span>`;
      }
    } else $('#game-countdown').dataset.value = '';

    this.carRig.position.x = game.x;
    this.carRig.position.y = this.reducedMotion || !running ? 0 : Math.sin(game.elapsed * 11) * Math.min(game.speed / 100, 1.5) * 0.003;
    this.carRig.rotation.y = THREE.MathUtils.damp(this.carRig.rotation.y, -game.lateralSpeed * 0.037, 8, dt);
    this.carRig.rotation.z = THREE.MathUtils.damp(this.carRig.rotation.z, -game.steering * Math.min(game.speed / 100, 1) * 0.014, 7, dt);
    this.carRig.rotation.x = THREE.MathUtils.damp(this.carRig.rotation.x, running && game.braking && game.speed > 5 ? 0.012 : 0, 6, dt);
    for (const { object, angle } of this.frontWheels) object.rotation.y = angle - game.steering * 0.2;
    this.updateCamera(dt);
    if (!this.lastHud || now - this.lastHud > 80) {
      this.updateHud();
      this.lastHud = now;
    }
    return { meters, speed: game.speed, distance: game.distance / 1000, running, braking: game.braking };
  }

  bindEvents() {
    $('#take-wheel').addEventListener('click', () => this.open());
    $('#start-game').addEventListener('click', () => this.game.status === 'paused' ? this.togglePause() : this.start());
    $('#back-to-drive').addEventListener('click', () => this.exit());
    $('#game-exit').addEventListener('click', () => this.exit());
    $('#game-pause').addEventListener('click', () => this.togglePause());
    $('#game-camera').addEventListener('click', () => {
      this.view = this.view === 'chase' ? 'hood' : 'chase';
      $('#viewport').focus({ preventScroll: true });
    });

    document.addEventListener('keydown', event => {
      if (!this.active || $('#about-dialog').open || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!$('#game-overlay').hidden && event.code === 'Tab') {
        const buttons = [...$('#game-overlay').querySelectorAll('button:not([disabled])')];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && (document.activeElement === first || !$('#game-overlay').contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !$('#game-overlay').contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
        return;
      }
      if (keyControls[event.code]) {
        event.preventDefault();
        if (drivingStatuses.includes(this.game.status)) this.keys.add(event.code);
      } else if (['Escape', 'KeyP', 'Space'].includes(event.code)) {
        // Space on a focused menu button should retain native button activation.
        if (!$('#game-overlay').hidden && event.code === 'Space') return;
        event.preventDefault();
        if (!event.repeat) {
          if (event.code === 'Escape' && ['ready', 'over'].includes(this.game.status)) this.exit();
          else this.togglePause();
        }
      } else if (event.code === 'KeyR') {
        event.preventDefault();
        if (!event.repeat) this.start();
      } else if (event.code === 'KeyC') {
        event.preventDefault();
        if (!event.repeat && $('#game-overlay').hidden) $('#game-camera').click();
      }
    });
    document.addEventListener('keyup', event => { this.keys.delete(event.code); });

    $$('[data-control]').forEach(button => {
      button.addEventListener('pointerdown', event => {
        if (!this.active || !drivingStatuses.includes(this.game.status)) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, button.dataset.control);
        button.classList.add('held');
        button.setAttribute('aria-pressed', 'true');
      });
      const release = event => {
        this.pointers.delete(event.pointerId);
        const held = [...this.pointers.values()].includes(button.dataset.control);
        button.classList.toggle('held', held);
        button.setAttribute('aria-pressed', String(held));
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });

    const loseFocus = () => {
      this.clearInput();
      if (this.active && drivingStatuses.includes(this.game.status)) this.togglePause();
    };
    window.addEventListener('blur', loseFocus);
    document.addEventListener('visibilitychange', () => { if (document.hidden) loseFocus(); });
  }
}
