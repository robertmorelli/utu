//! N-body, the Jovian-planets simulation of the Computer Language Benchmarks
//! Game, as Are We Fast Yet's `NBody` has it, in idiomatic safe Rust: five
//! `Body` structs in a `Vec`, a symplectic-Euler step that updates each pair
//! once (`split_at_mut` hands out the two bodies of a pair), and the system's
//! energy. Every port runs the same floating-point operations in the same
//! order, so their checksums agree bit for bit.
//!
//! There is no `unsafe` code. The crate denies `unsafe_code` rather than
//! forbidding it only because that lint also flags `#[no_mangle]`, so the
//! export at the bottom opts out of it.
#![deny(unsafe_code)]

const PI: f64 = 3.141592653589793;
const SOLAR_MASS: f64 = 4.0 * PI * PI;
const DAYS_PER_YEAR: f64 = 365.24;

struct Body {
    x: f64,
    y: f64,
    z: f64,
    vx: f64,
    vy: f64,
    vz: f64,
    mass: f64,
}

impl Body {
    fn new(x: f64, y: f64, z: f64, vx: f64, vy: f64, vz: f64, mass: f64) -> Body {
        Body {
            x,
            y,
            z,
            vx: vx * DAYS_PER_YEAR,
            vy: vy * DAYS_PER_YEAR,
            vz: vz * DAYS_PER_YEAR,
            mass: mass * SOLAR_MASS,
        }
    }

    fn offset_momentum(&mut self, px: f64, py: f64, pz: f64) {
        self.vx = 0.0 - px / SOLAR_MASS;
        self.vy = 0.0 - py / SOLAR_MASS;
        self.vz = 0.0 - pz / SOLAR_MASS;
    }
}

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

fn sun() -> Body {
    Body::new(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0)
}

/// The five bodies, with the Sun's velocity set so the total momentum is zero.
fn create_bodies() -> Vec<Body> {
    let mut bodies = vec![sun(), jupiter(), saturn(), uranus(), neptune()];
    let mut px = 0.0;
    let mut py = 0.0;
    let mut pz = 0.0;
    for b in &bodies {
        px += b.vx * b.mass;
        py += b.vy * b.mass;
        pz += b.vz * b.mass;
    }
    bodies[0].offset_momentum(px, py, pz);
    bodies
}

fn advance(bodies: &mut [Body], dt: f64) {
    for i in 0..bodies.len() {
        let (head, rest) = bodies.split_at_mut(i + 1);
        let ib = &mut head[i];
        for jb in rest.iter_mut() {
            let dx = ib.x - jb.x;
            let dy = ib.y - jb.y;
            let dz = ib.z - jb.z;
            let d_squared = dx * dx + dy * dy + dz * dz;
            let distance = d_squared.sqrt();
            let mag = dt / (d_squared * distance);
            ib.vx = ib.vx - dx * jb.mass * mag;
            ib.vy = ib.vy - dy * jb.mass * mag;
            ib.vz = ib.vz - dz * jb.mass * mag;
            jb.vx = jb.vx + dx * ib.mass * mag;
            jb.vy = jb.vy + dy * ib.mass * mag;
            jb.vz = jb.vz + dz * ib.mass * mag;
        }
    }
    for b in bodies.iter_mut() {
        b.x = b.x + dt * b.vx;
        b.y = b.y + dt * b.vy;
        b.z = b.z + dt * b.vz;
    }
}

fn energy(bodies: &[Body]) -> f64 {
    let mut e = 0.0;
    for (i, ib) in bodies.iter().enumerate() {
        e = e + 0.5 * ib.mass * (ib.vx * ib.vx + ib.vy * ib.vy + ib.vz * ib.vz);
        for jb in &bodies[i + 1..] {
            let dx = ib.x - jb.x;
            let dy = ib.y - jb.y;
            let dz = ib.z - jb.z;
            let distance = (dx * dx + dy * dy + dz * dz).sqrt();
            e = e - ib.mass * jb.mass / distance;
        }
    }
    e
}

/// One run: a fresh system advanced `steps` times; its energy in nano-units,
/// rounded half up.
fn run(steps: i32) -> i64 {
    let mut bodies = create_bodies();
    for _ in 0..steps {
        advance(&mut bodies, 0.01);
    }
    (energy(&bodies) * 1.0e9 + 0.5).floor() as i64
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn bench(iterations: i32) -> i64 {
    (0..iterations).map(|_| run(20000)).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn energy_matches_the_reference() {
        assert_eq!(run(0), -169075164);
        assert_eq!(run(1000), -169087605);
    }
}
