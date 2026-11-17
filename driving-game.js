// Rendering-independent simulation. Units: meters, seconds, km/h.
export const GAME_RULES = Object.freeze({
  finishDistance: 2000,
  maxSpeed: 185,
  boostSpeed: 240,
  roadLimit: 5.1,
  shoulder: 4.75,
  lanes: [-3.8, 0, 3.8],
  collisionWidth: 1.72,
  collisionLength: 4.25,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const damp = (value, target, rate, dt) => target + (value - target) * Math.exp(-rate * dt);

export class DrivingGame {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.status = 'ready';
    this.reset();
  }

  reset() {
    this.speed = 0;
    this.x = 0;
    this.lateralSpeed = 0;
    this.steering = 0;
    this.distance = 0;
    this.elapsed = 0;
    this.health = 100;
    this.boost = 100;
    this.boosting = false;
    this.braking = false;
    this.score = 0;
    this.bonus = 0;
    this.overtakes = 0;
    this.nearMisses = 0;
    this.topSpeed = 0;
    this.won = false;
    this.invulnerability = 0;
    this.traffic = [];
    this.nextId = 1;
    this.spawnTimer = 2.8;
    this.countdown = 3;
    this.accumulator = 0;
    this.events = [];
    this.status = 'ready';
  }

  start() {
    this.reset();
    this.status = 'countdown';
    this.spawnTraffic(-115, -3.8, 44);
    this.spawnTraffic(-175, 3.8, 52);
  }

  pause() {
    if (!['running', 'countdown'].includes(this.status)) return;
    this.previousStatus = this.status;
    this.status = 'paused';
    this.accumulator = 0;
  }

  resume() {
    if (this.status !== 'paused') return;
    this.status = this.previousStatus || 'running';
    this.accumulator = 0;
  }

  spawnTraffic(z, x, speed) {
    // A gap of at least 35m avoids an unpassable wall across all three lanes.
    if (this.traffic.length >= 7) return;
    const lane = x ?? GAME_RULES.lanes[Math.floor(this.random() * GAME_RULES.lanes.length)];
    const position = z ?? -165 - this.random() * 25;
    if (this.traffic.some(vehicle => Math.abs(vehicle.z - position) < 35)) return;
    this.traffic.push({
      id: this.nextId++, x: lane, z: position,
      speed: speed ?? 38 + this.random() * 28,
      color: Math.floor(this.random() * 5),
      passed: false, hit: false, closest: Infinity,
    });
  }

  update(dt, input = {}) {
    this.events = [];
    if (!Number.isFinite(dt) || dt <= 0) return this.events;
    if (this.status === 'countdown') {
      this.countdown = Math.max(0, this.countdown - Math.min(dt, 0.1));
      if (this.countdown < 0.00001) {
        this.countdown = 0;
        this.status = 'running';
        this.events.push({ type: 'go' });
      }
      return this.events;
    }
    if (this.status !== 'running') return this.events;

    // Small fixed steps keep handling and collision checks stable at any frame rate.
    this.accumulator += Math.min(dt, 0.1);
    const step = 1 / 120;
    while (this.accumulator >= step && this.status === 'running') {
      this.step(step, input);
      this.accumulator -= step;
    }
    return this.events;
  }

  step(dt, input) {
    this.elapsed += dt;
    this.invulnerability = Math.max(0, this.invulnerability - dt);
    const throttle = Boolean(input.throttle);
    this.braking = Boolean(input.brake);
    this.boosting = Boolean(input.boost && throttle && !this.braking && this.boost > 1);
    const maxSpeed = this.boosting ? GAME_RULES.boostSpeed : GAME_RULES.maxSpeed;

    // Braking takes precedence over throttle. Releasing the throttle coasts naturally.
    if (this.braking) this.speed -= 78 * dt;
    else if (throttle) this.speed += (this.boosting ? 42 : 31) * (1 - 0.52 * this.speed / maxSpeed) * dt;
    else this.speed -= (5 + this.speed * this.speed * 0.00022) * dt;
    if (this.speed > maxSpeed) this.speed -= Math.min(this.speed - maxSpeed, 25 * dt);
    this.speed = clamp(this.speed, 0, GAME_RULES.boostSpeed);

    this.boost = clamp(this.boost + (this.boosting ? -31 : 10) * dt, 0, 100);
    const axis = Number(Boolean(input.right)) - Number(Boolean(input.left));
    this.steering = damp(this.steering, axis, 10, dt);
    const steeringGrip = Math.min(1, this.speed / 22);
    const lateralTarget = this.steering * (3.7 + this.speed / 100) * steeringGrip;
    this.lateralSpeed = damp(this.lateralSpeed, lateralTarget, this.braking ? 5 : 8, dt);
    this.x += this.lateralSpeed * dt;
    if (Math.abs(this.x) > GAME_RULES.roadLimit) {
      this.x = Math.sign(this.x) * GAME_RULES.roadLimit;
      this.lateralSpeed = 0;
    }
    if (Math.abs(this.x) > GAME_RULES.shoulder && this.speed > 8) {
      this.health = Math.max(0, this.health - 5 * dt);
      this.speed = Math.max(0, this.speed - 22 * dt);
    }

    const meters = this.speed / 3.6 * dt;
    this.distance += meters;
    this.topSpeed = Math.max(this.topSpeed, this.speed);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTraffic();
      this.spawnTimer = Math.max(1.4, 3.3 - this.distance / 1800) + this.random() * 0.7;
    }

    for (const vehicle of this.traffic) {
      const previousZ = vehicle.z;
      vehicle.z += (this.speed - vehicle.speed) / 3.6 * dt;
      const lateralGap = Math.abs(this.x - vehicle.x);
      const crossesPlayer = Math.min(previousZ, vehicle.z) <= GAME_RULES.collisionLength && Math.max(previousZ, vehicle.z) >= -GAME_RULES.collisionLength;

      if (crossesPlayer) vehicle.closest = Math.min(vehicle.closest, lateralGap);
      if (!vehicle.hit && this.invulnerability <= 0 && lateralGap < GAME_RULES.collisionWidth && crossesPlayer) {
        vehicle.hit = true;
        this.health = Math.max(0, this.health - 34);
        this.speed *= 0.48;
        this.invulnerability = 1.6;
        this.boosting = false;
        this.events.push({ type: 'collision' });
      }
      if (!vehicle.passed && vehicle.z > 6) {
        vehicle.passed = true;
        if (!vehicle.hit) {
          this.overtakes++;
          const nearMiss = vehicle.closest >= GAME_RULES.collisionWidth && vehicle.closest < 2.55 && this.speed > 65;
          const points = nearMiss ? 200 : 75;
          this.nearMisses += nearMiss ? 1 : 0;
          this.bonus += points;
          this.events.push({ type: nearMiss ? 'near-miss' : 'overtake', points });
        }
      }
    }
    this.traffic = this.traffic.filter(vehicle => vehicle.z < 35 && vehicle.z > -260);
    this.score = Math.floor(this.distance * 1.5) + this.bonus;

    if (this.health <= 0) this.finish(false);
    else if (this.distance >= GAME_RULES.finishDistance) this.finish(true);
  }

  finish(won) {
    this.status = 'over';
    this.won = won;
    this.boosting = false;
    if (won) {
      this.bonus += 1000 + Math.round(this.health * 10);
      this.score = Math.floor(this.distance * 1.5) + this.bonus;
    }
    this.events.push({ type: 'finish', won });
  }
}
