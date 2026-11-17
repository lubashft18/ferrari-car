import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import * as THREE from '../vendor/three.module.js';

// Exercise real scene-graph and controller code without requiring a GPU/browser.
// The small DOM fixture is built from the actual HTML to catch missing controls.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const elements = [];
const documentListeners = new Map();
const windowListeners = new Map();
function listen(map, name, callback) {
  if (!map.has(name)) map.set(name, []);
  map.get(name).push(callback);
}
for (const match of html.matchAll(/<(\w+)([^>]*)>/g)) {
  const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(value => [value[1], value[2]]));
  const classes = new Set((attributes.class || '').split(' '));
  const events = new Map();
  const element = {
    tagName: match[1].toUpperCase(), id: attributes.id, attributes,
    dataset: Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5), value])),
    hidden: /\bhidden\b/.test(match[2]), inert: false,
    style: { setProperty(key, value) { this[key] = value; } },
    classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value), toggle(value, force) { const add = force ?? !classes.has(value); if (add) classes.add(value); else classes.delete(value); } },
    setAttribute(name, value) { attributes[name] = String(value); },
    removeAttribute(name) { delete attributes[name]; },
    addEventListener(name, callback) { listen(events, name, callback); },
    click() { for (const callback of events.get('click') || []) callback({ target: this }); },
    focus() { document.activeElement = this; },
    setPointerCapture() {},
    fire(name, event) { for (const callback of events.get(name) || []) callback({ target: this, preventDefault() {}, ...event }); },
    contains(target) { return this === target || ['start-game', 'back-to-drive'].includes(target?.id); },
    querySelectorAll() { return elements.filter(value => ['start-game', 'back-to-drive'].includes(value.id)); },
    clientHeight: 900,
  };
  elements.push(element);
}
function find(selector) {
  if (selector.startsWith('#')) return elements.filter(element => element.id === selector.slice(1));
  if (selector.startsWith('.')) return elements.filter(element => element.classList.contains(selector.slice(1)));
  if (selector === '[data-control]') return elements.filter(element => element.dataset.control);
  throw new Error(`Unsupported fixture selector: ${selector}`);
}
globalThis.document = {
  querySelector(selector) { const result = find(selector)[0]; assert.ok(result, `HTML contains ${selector}`); return result; },
  querySelectorAll: find,
  addEventListener(name, callback) { listen(documentListeners, name, callback); },
  activeElement: null,
};
globalThis.window = { innerWidth: 1280, addEventListener(name, callback) { listen(windowListeners, name, callback); } };
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
const $ = selector => document.querySelector(selector);
const source = (await readFile(new URL('../game-controller.js', import.meta.url), 'utf8'))
  .replace("from 'three'", `from '${pathToFileURL(resolve('vendor/three.module.js')).href}'`)
  .replace("from './driving-game.js'", `from '${pathToFileURL(resolve('driving-game.js')).href}'`);
const { GameController } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('game input, 3D traffic, camera, pause, touch cancellation, restart, and exit work together', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 600);
  const car = new THREE.Group();
  for (const name of ['wheel_fl', 'wheel_fr']) { const wheel = new THREE.Group(); wheel.name = name; car.add(wheel); }
  const carRig = new THREE.Group();
  carRig.add(car);
  scene.add(carRig);
  const controls = { enabled: true };
  let entered = false, exited = false;
  const controller = new GameController({ scene, camera, carRig, car, controls, renderer: { setSize() {} }, onEnter() { entered = true; }, onExit() { exited = true; }, reducedMotion: false });
  const key = (type, code) => { for (const callback of documentListeners.get(type) || []) callback({ code, target: $('#viewport'), preventDefault() {}, repeat: false }); };
  let now = 100;
  const frames = (seconds) => { for (let i = 0; i < seconds * 60; i++) { now += 1000 / 60; controller.update(1 / 60, now); } };

  $('#take-wheel').click();
  assert.equal(entered, true);
  assert.equal(controller.active, true);
  assert.equal(controls.enabled, false);
  assert.equal($('#game-overlay').hidden, false);
  $('#start-game').click();
  assert.equal($('#game-overlay').hidden, true);
  frames(3.1);
  key('keydown', 'KeyW');
  frames(2);
  assert.ok(controller.game.speed > 45);
  assert.ok(controller.game.distance > 10);
  assert.equal(controller.trafficModels.size, controller.game.traffic.length);
  assert.ok(controller.trafficGroup.children.some(child => child.isGroup && child.children.some(object => object.isMesh)));
  assert.ok(camera.fov > 58 && Number.isFinite(camera.position.z));

  key('keydown', 'KeyA');
  frames(0.4);
  key('keyup', 'KeyA');
  assert.ok(carRig.position.x < -0.5);
  key('keydown', 'KeyC');
  assert.equal(controller.view, 'hood');
  key('keydown', 'Escape');
  assert.equal(controller.game.status, 'paused');
  assert.equal($('#game-overlay').hidden, false);
  const stopped = controller.game.distance;
  frames(1);
  assert.equal(controller.game.distance, stopped);
  $('#start-game').click();
  assert.equal(controller.game.status, 'running');
  assert.deepEqual(controller.getInput(), {});

  const gas = elements.find(element => element.dataset.control === 'throttle');
  const right = elements.find(element => element.dataset.control === 'right');
  gas.fire('pointerdown', { pointerId: 1 });
  right.fire('pointerdown', { pointerId: 2 });
  assert.deepEqual(controller.getInput(), { throttle: true, right: true });
  frames(0.5);
  gas.fire('pointercancel', { pointerId: 1 });
  assert.deepEqual(controller.getInput(), { right: true });
  right.fire('pointerup', { pointerId: 2 });
  assert.deepEqual(controller.getInput(), {});
  for (const callback of windowListeners.get('blur') || []) callback();
  assert.equal(controller.game.status, 'paused');

  key('keydown', 'KeyR');
  assert.equal(controller.game.status, 'countdown');
  assert.equal(controller.game.distance, 0);
  assert.equal(controller.game.health, 100);
  frames(3.1);
  controller.game.distance = 1999.9;
  controller.game.speed = 100;
  frames(0.1);
  assert.equal(controller.game.status, 'over');
  assert.equal($('#game-overlay').hidden, false);
  assert.equal($('#game-results').hidden, false);
  assert.ok(Number(storage.get('omnidrive-best-score')) >= 4999);

  $('#back-to-drive').click();
  assert.equal(exited, true);
  assert.equal(controller.active, false);
  assert.equal(controls.enabled, true);
  assert.equal($('#game-hud').hidden, true);
  assert.equal(camera.fov, 36);
  assert.equal(carRig.position.x, 0);
});
