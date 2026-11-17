import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingGame, GAME_RULES } from '../driving-game.js';

function ready() {
  const game = new DrivingGame({ random: () => 0.5 });
  game.start();
  for (let i = 0; i < 40; i++) game.update(0.1);
  game.traffic = [];
  return game;
}

function advance(game, seconds, input = {}, hz = 60) {
  for (let frame = 0; frame < seconds * hz; frame++) game.update(1 / hz, input);
}

test('countdown waits for the player and only transitions once', () => {
  const game = new DrivingGame();
  game.start();
  advance(game, 2, { throttle: true });
  assert.equal(game.status, 'countdown');
  assert.equal(game.speed, 0);
  assert.equal(game.distance, 0);
  advance(game, 1.1);
  assert.equal(game.status, 'running');
});

test('throttle, coasting, and braking control the actual car speed', () => {
  const game = ready();
  advance(game, 3, { throttle: true });
  assert.ok(game.speed > 60 && game.speed < 100);
  const accelerated = game.speed;
  advance(game, 1);
  assert.ok(game.speed < accelerated);
  advance(game, 2, { throttle: true, brake: true });
  assert.equal(game.speed, 0);
});

test('steering needs forward motion, moves both ways, and stays on the road', () => {
  const game = ready();
  advance(game, 1, { left: true });
  assert.equal(game.x, 0);
  advance(game, 1.5, { throttle: true, left: true });
  assert.ok(game.x < -1);
  advance(game, 3, { throttle: true, right: true });
  assert.ok(game.x > 1);
  assert.ok(game.x <= GAME_RULES.roadLimit);
});

test('boost is finite, recharges, and increases acceleration', () => {
  const normal = ready();
  const boosted = ready();
  advance(normal, 2, { throttle: true });
  advance(boosted, 2, { throttle: true, boost: true });
  assert.ok(boosted.speed > normal.speed + 10);
  assert.ok(boosted.boost < 45 && boosted.boost > 30);
  const depleted = boosted.boost;
  advance(boosted, 1);
  assert.ok(boosted.boost > depleted);
});

test('pause freezes distance, traffic, countdown, and health', () => {
  const game = ready();
  advance(game, 2, { throttle: true });
  game.pause();
  const snapshot = JSON.stringify([game.speed, game.distance, game.traffic, game.health, game.boost]);
  advance(game, 2, { throttle: true, left: true });
  assert.equal(JSON.stringify([game.speed, game.distance, game.traffic, game.health, game.boost]), snapshot);
  game.resume();
  assert.equal(game.status, 'running');
  const distance = game.distance;
  advance(game, 1, { throttle: true });
  assert.ok(game.distance > distance);
});

test('collision damages once, slows the car, and grants a recovery window', () => {
  const game = ready();
  game.speed = 120;
  game.spawnTraffic(-4.5, 0, 40);
  advance(game, 0.2, { throttle: true });
  assert.equal(game.health, 66);
  assert.ok(game.speed < 70);
  assert.ok(game.invulnerability > 1);
  advance(game, 0.5, { throttle: true });
  assert.equal(game.health, 66);
});

test('clean overtakes and close passes award points only once', () => {
  const game = ready();
  game.speed = 140;
  game.x = 2;
  game.spawnTraffic(-5, 0, 40);
  advance(game, 0.6, { throttle: true });
  assert.equal(game.health, 100);
  assert.equal(game.overtakes, 1);
  assert.equal(game.nearMisses, 1);
  assert.equal(game.bonus, 200);
  advance(game, 1, { throttle: true });
  assert.equal(game.overtakes, 1);
});

test('reaching 2km wins, zero health ends the run, restart clears the run', () => {
  const game = ready();
  game.distance = 1999.9;
  game.speed = 120;
  game.update(1 / 60, { throttle: true });
  assert.equal(game.status, 'over');
  assert.equal(game.won, true);
  assert.ok(game.score >= 4999);
  game.start();
  assert.equal(game.distance, 0);
  assert.equal(game.health, 100);
  assert.equal(game.speed, 0);
  assert.equal(game.status, 'countdown');
  advance(game, 3.1);
  game.health = 1;
  game.speed = 100;
  game.x = 5.1;
  advance(game, 0.5, { throttle: true });
  assert.equal(game.status, 'over');
  assert.equal(game.won, false);
});

test('physics gives equivalent results at 30, 60, and 144 fps', () => {
  const simulations = [30, 60, 144].map(hz => {
    const game = ready();
    advance(game, 4, { throttle: true }, hz);
    return game;
  });
  for (const game of simulations) {
    assert.ok(Math.abs(game.speed - simulations[0].speed) < 0.4);
    assert.ok(Math.abs(game.distance - simulations[0].distance) < 0.3);
  }
});

test('long frames cannot teleport through traffic or cause a huge simulation jump', () => {
  const game = ready();
  game.speed = 200;
  game.spawnTraffic(-5, 0, 40);
  const events = game.update(3, { throttle: true });
  assert.equal(game.health, 66);
  assert.ok(game.distance < 6);
  assert.equal(events.filter(event => event.type === 'collision').length, 1);
});
