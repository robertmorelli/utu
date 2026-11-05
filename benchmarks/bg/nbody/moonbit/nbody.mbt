// Not on BG: MoonBit translated from BG nbody Node #6 (Isaac Gouy; Andrey
// Filatkin), the fastest source that fits MoonBit (no SIMD; the C/C++/Rust ones
// are AVX): https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/nbody-node-6.html
// Five Body structs in an Array; advance keeps body i's velocity in locals, as
// Node #6 does. bench(n) builds the bodies, runs n steps, and returns the FNV-1a
// hash of the bytes Node #6 prints ("%.9f\n" twice), hashed as they are formatted.

///|
const PI : Double = 3.141592653589793

///|
const SOLAR_MASS : Double = 4.0 * PI * PI

///|
const DAYS_PER_YEAR : Double = 365.24

///|
priv struct Body {
  mut x : Double
  mut y : Double
  mut z : Double
  mut vx : Double
  mut vy : Double
  mut vz : Double
  mass : Double
}

///|
fn Body::new(
  x : Double,
  y : Double,
  z : Double,
  vx : Double,
  vy : Double,
  vz : Double,
  mass : Double,
) -> Body {
  {
    x,
    y,
    z,
    vx: vx * DAYS_PER_YEAR,
    vy: vy * DAYS_PER_YEAR,
    vz: vz * DAYS_PER_YEAR,
    mass: mass * SOLAR_MASS,
  }
}

///|
fn Body::offset_momentum(self : Body, px : Double, py : Double, pz : Double) -> Unit {
  self.vx = 0.0 - px / SOLAR_MASS
  self.vy = 0.0 - py / SOLAR_MASS
  self.vz = 0.0 - pz / SOLAR_MASS
}

///|
fn jupiter() -> Body {
  Body::new(
    4.84143144246472090e+00,
    -1.16032004402742839e+00,
    -1.03622044471123109e-01,
    1.66007664274403694e-03,
    7.69901118419740425e-03,
    -6.90460016972063023e-05,
    9.54791938424326609e-04,
  )
}

///|
fn saturn() -> Body {
  Body::new(
    8.34336671824457987e+00,
    4.12479856412430479e+00,
    -4.03523417114321381e-01,
    -2.76742510726862411e-03,
    4.99852801234917238e-03,
    2.30417297573763929e-05,
    2.85885980666130812e-04,
  )
}

///|
fn uranus() -> Body {
  Body::new(
    1.28943695621391310e+01,
    -1.51111514016986312e+01,
    -2.23307578892655734e-01,
    2.96460137564761618e-03,
    2.37847173959480950e-03,
    -2.96589568540237556e-05,
    4.36624404335156298e-05,
  )
}

///|
fn neptune() -> Body {
  Body::new(
    1.53796971148509165e+01,
    -2.59193146099879641e+01,
    1.79258772950371181e-01,
    2.68067772490389322e-03,
    1.62824170038242295e-03,
    -9.51592254519715870e-05,
    5.15138902046611451e-05,
  )
}

///|
fn sun() -> Body {
  Body::new(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0)
}

///|
/// The five bodies, with the Sun's velocity set so the total momentum is zero.
fn create_bodies() -> Array[Body] {
  let bodies = [sun(), jupiter(), saturn(), uranus(), neptune()]
  let mut px = 0.0
  let mut py = 0.0
  let mut pz = 0.0
  for b in bodies {
    px += b.vx * b.mass
    py += b.vy * b.mass
    pz += b.vz * b.mass
  }
  bodies[0].offset_momentum(px, py, pz)
  bodies
}

///|
fn advance(bodies : Array[Body], dt : Double) -> Unit {
  let size = bodies.length()
  for i in 0..<size {
    let bodyi = bodies[i]
    let mut vxi = bodyi.vx
    let mut vyi = bodyi.vy
    let mut vzi = bodyi.vz
    for j in (i + 1)..<size {
      let bodyj = bodies[j]
      let dx = bodyi.x - bodyj.x
      let dy = bodyi.y - bodyj.y
      let dz = bodyi.z - bodyj.z
      let d2 = dx * dx + dy * dy + dz * dz
      let mag = dt / (d2 * d2.sqrt())
      let massj = bodyj.mass
      vxi -= dx * massj * mag
      vyi -= dy * massj * mag
      vzi -= dz * massj * mag
      let massi = bodyi.mass
      bodyj.vx += dx * massi * mag
      bodyj.vy += dy * massi * mag
      bodyj.vz += dz * massi * mag
    }
    bodyi.vx = vxi
    bodyi.vy = vyi
    bodyi.vz = vzi
  }
  for i in 0..<size {
    let body = bodies[i]
    body.x += dt * body.vx
    body.y += dt * body.vy
    body.z += dt * body.vz
  }
}

///|
fn energy(bodies : Array[Body]) -> Double {
  let mut e = 0.0
  let size = bodies.length()
  for i in 0..<size {
    let bodyi = bodies[i]
    e += 0.5 *
      bodyi.mass *
      (bodyi.vx * bodyi.vx + bodyi.vy * bodyi.vy + bodyi.vz * bodyi.vz)
    for j in (i + 1)..<size {
      let bodyj = bodies[j]
      let dx = bodyi.x - bodyj.x
      let dy = bodyi.y - bodyj.y
      let dz = bodyi.z - bodyj.z
      let distance = (dx * dx + dy * dy + dz * dz).sqrt()
      e -= bodyi.mass * bodyj.mass / distance
    }
  }
  e
}

///|
fn fnv(h : Int, byte : Int) -> Int {
  (h ^ byte) * 16777619
}

///|
/// Hashes the bytes of "%.9f\n" for x: x rounded to nanos, then the digits.
fn fnv_fixed9(h0 : Int, x : Double) -> Int {
  let mut h = h0
  if x < 0.0 {
    h = fnv(h, '-'.to_int())
  }
  let nanos = (x.abs() * 1.0e9 + 0.5).floor().to_int64()
  let whole = nanos / 1000000000L
  let mut p = 1L
  while p * 10L <= whole {
    p = p * 10L
  }
  while p > 0L {
    h = fnv(h, 48 + (whole / p % 10L).to_int())
    p = p / 10L
  }
  h = fnv(h, '.'.to_int())
  let frac = nanos % 1000000000L
  let mut d = 100000000L
  while d > 0L {
    h = fnv(h, 48 + (frac / d % 10L).to_int())
    d = d / 10L
  }
  fnv(h, '\n'.to_int())
}

///|
pub fn bench(n : Int) -> Int {
  let bodies = create_bodies()
  let mut h = fnv_fixed9(-2128831035, energy(bodies))
  for _ in 0..<n {
    advance(bodies, 0.01)
  }
  h = fnv_fixed9(h, energy(bodies))
  h
}
