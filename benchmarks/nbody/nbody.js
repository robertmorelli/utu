// N-body, the Jovian-planets simulation of the Computer Language Benchmarks
// Game, as Are We Fast Yet's `NBody` has it: five bodies in an array of
// objects, a symplectic-Euler step that updates each pair once, and the
// system's energy. Every port in this directory runs the same floating-point
// operations in the same order, so their checksums agree bit for bit.

const PI = 3.141592653589793;
const SOLAR_MASS = 4.0 * PI * PI;
const DAYS_PER_YEAR = 365.24;

class Body {
  constructor(x, y, z, vx, vy, vz, mass) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = vx * DAYS_PER_YEAR;
    this.vy = vy * DAYS_PER_YEAR;
    this.vz = vz * DAYS_PER_YEAR;
    this.mass = mass * SOLAR_MASS;
  }

  offsetMomentum(px, py, pz) {
    this.vx = 0.0 - px / SOLAR_MASS;
    this.vy = 0.0 - py / SOLAR_MASS;
    this.vz = 0.0 - pz / SOLAR_MASS;
  }
}

function jupiter() {
  return new Body(
    4.84143144246472090e+00,
    -1.16032004402742839e+00,
    -1.03622044471123109e-01,
    1.66007664274403694e-03,
    7.69901118419740425e-03,
    -6.90460016972063023e-05,
    9.54791938424326609e-04,
  );
}

function saturn() {
  return new Body(
    8.34336671824457987e+00,
    4.12479856412430479e+00,
    -4.03523417114321381e-01,
    -2.76742510726862411e-03,
    4.99852801234917238e-03,
    2.30417297573763929e-05,
    2.85885980666130812e-04,
  );
}

function uranus() {
  return new Body(
    1.28943695621391310e+01,
    -1.51111514016986312e+01,
    -2.23307578892655734e-01,
    2.96460137564761618e-03,
    2.37847173959480950e-03,
    -2.96589568540237556e-05,
    4.36624404335156298e-05,
  );
}

function neptune() {
  return new Body(
    1.53796971148509165e+01,
    -2.59193146099879641e+01,
    1.79258772950371181e-01,
    2.68067772490389322e-03,
    1.62824170038242295e-03,
    -9.51592254519715870e-05,
    5.15138902046611451e-05,
  );
}

function sun() {
  return new Body(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
}

// The five bodies, with the Sun's velocity set so the total momentum is zero.
function createBodies() {
  const bodies = [sun(), jupiter(), saturn(), uranus(), neptune()];
  let px = 0.0;
  let py = 0.0;
  let pz = 0.0;
  for (const b of bodies) {
    px += b.vx * b.mass;
    py += b.vy * b.mass;
    pz += b.vz * b.mass;
  }
  bodies[0].offsetMomentum(px, py, pz);
  return bodies;
}

function advance(bodies, dt) {
  for (let i = 0; i < bodies.length; i++) {
    const ib = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const jb = bodies[j];
      const dx = ib.x - jb.x;
      const dy = ib.y - jb.y;
      const dz = ib.z - jb.z;
      const dSquared = dx * dx + dy * dy + dz * dz;
      const distance = Math.sqrt(dSquared);
      const mag = dt / (dSquared * distance);
      ib.vx = ib.vx - dx * jb.mass * mag;
      ib.vy = ib.vy - dy * jb.mass * mag;
      ib.vz = ib.vz - dz * jb.mass * mag;
      jb.vx = jb.vx + dx * ib.mass * mag;
      jb.vy = jb.vy + dy * ib.mass * mag;
      jb.vz = jb.vz + dz * ib.mass * mag;
    }
  }
  for (const b of bodies) {
    b.x = b.x + dt * b.vx;
    b.y = b.y + dt * b.vy;
    b.z = b.z + dt * b.vz;
  }
}

function energy(bodies) {
  let e = 0.0;
  for (let i = 0; i < bodies.length; i++) {
    const ib = bodies[i];
    e = e + 0.5 * ib.mass * (ib.vx * ib.vx + ib.vy * ib.vy + ib.vz * ib.vz);
    for (let j = i + 1; j < bodies.length; j++) {
      const jb = bodies[j];
      const dx = ib.x - jb.x;
      const dy = ib.y - jb.y;
      const dz = ib.z - jb.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      e = e - ib.mass * jb.mass / distance;
    }
  }
  return e;
}

// One run: a fresh system advanced `steps` times; its energy in nano-units,
// rounded half up.
function run(steps) {
  const bodies = createBodies();
  for (let i = 0; i < steps; i++) advance(bodies, 0.01);
  return Math.floor(energy(bodies) * 1.0e9 + 0.5);
}

export function bench(iterations) {
  let sum = 0;
  for (let i = 0; i < iterations; i++) sum += run(20000);
  return sum;
}
