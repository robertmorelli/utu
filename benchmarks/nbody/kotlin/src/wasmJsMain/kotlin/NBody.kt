// N-body, the Jovian-planets simulation of the Computer Language Benchmarks
// Game, as Are We Fast Yet's `NBody` has it, in idiomatic Kotlin: five bodies
// in an Array of objects, a symplectic-Euler step that updates each pair once,
// and the system's energy. Every port in this directory runs the same
// floating-point operations in the same order, so their checksums agree bit
// for bit. Compiled to WasmGC by Kotlin/Wasm; bench is exported to JavaScript.

@file:OptIn(ExperimentalJsExport::class)

import kotlin.math.floor
import kotlin.math.sqrt

const val PI = 3.141592653589793
const val SOLAR_MASS = 4.0 * PI * PI
const val DAYS_PER_YEAR = 365.24

class Body(
    var x: Double,
    var y: Double,
    var z: Double,
    vx: Double,
    vy: Double,
    vz: Double,
    mass: Double,
) {
    var vx = vx * DAYS_PER_YEAR
    var vy = vy * DAYS_PER_YEAR
    var vz = vz * DAYS_PER_YEAR
    val mass = mass * SOLAR_MASS

    fun offsetMomentum(px: Double, py: Double, pz: Double) {
        vx = 0.0 - px / SOLAR_MASS
        vy = 0.0 - py / SOLAR_MASS
        vz = 0.0 - pz / SOLAR_MASS
    }
}

fun jupiter() = Body(
    4.84143144246472090e+00,
    -1.16032004402742839e+00,
    -1.03622044471123109e-01,
    1.66007664274403694e-03,
    7.69901118419740425e-03,
    -6.90460016972063023e-05,
    9.54791938424326609e-04,
)

fun saturn() = Body(
    8.34336671824457987e+00,
    4.12479856412430479e+00,
    -4.03523417114321381e-01,
    -2.76742510726862411e-03,
    4.99852801234917238e-03,
    2.30417297573763929e-05,
    2.85885980666130812e-04,
)

fun uranus() = Body(
    1.28943695621391310e+01,
    -1.51111514016986312e+01,
    -2.23307578892655734e-01,
    2.96460137564761618e-03,
    2.37847173959480950e-03,
    -2.96589568540237556e-05,
    4.36624404335156298e-05,
)

fun neptune() = Body(
    1.53796971148509165e+01,
    -2.59193146099879641e+01,
    1.79258772950371181e-01,
    2.68067772490389322e-03,
    1.62824170038242295e-03,
    -9.51592254519715870e-05,
    5.15138902046611451e-05,
)

fun sun() = Body(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0)

// The five bodies, with the Sun's velocity set so the total momentum is zero.
fun createBodies(): Array<Body> {
    val bodies = arrayOf(sun(), jupiter(), saturn(), uranus(), neptune())
    var px = 0.0
    var py = 0.0
    var pz = 0.0
    for (b in bodies) {
        px += b.vx * b.mass
        py += b.vy * b.mass
        pz += b.vz * b.mass
    }
    bodies[0].offsetMomentum(px, py, pz)
    return bodies
}

fun advance(bodies: Array<Body>, dt: Double) {
    for (i in bodies.indices) {
        val ib = bodies[i]
        for (j in i + 1 until bodies.size) {
            val jb = bodies[j]
            val dx = ib.x - jb.x
            val dy = ib.y - jb.y
            val dz = ib.z - jb.z
            val dSquared = dx * dx + dy * dy + dz * dz
            val distance = sqrt(dSquared)
            val mag = dt / (dSquared * distance)
            ib.vx = ib.vx - dx * jb.mass * mag
            ib.vy = ib.vy - dy * jb.mass * mag
            ib.vz = ib.vz - dz * jb.mass * mag
            jb.vx = jb.vx + dx * ib.mass * mag
            jb.vy = jb.vy + dy * ib.mass * mag
            jb.vz = jb.vz + dz * ib.mass * mag
        }
    }
    for (b in bodies) {
        b.x = b.x + dt * b.vx
        b.y = b.y + dt * b.vy
        b.z = b.z + dt * b.vz
    }
}

fun energy(bodies: Array<Body>): Double {
    var e = 0.0
    for (i in bodies.indices) {
        val ib = bodies[i]
        e = e + 0.5 * ib.mass * (ib.vx * ib.vx + ib.vy * ib.vy + ib.vz * ib.vz)
        for (j in i + 1 until bodies.size) {
            val jb = bodies[j]
            val dx = ib.x - jb.x
            val dy = ib.y - jb.y
            val dz = ib.z - jb.z
            val distance = sqrt(dx * dx + dy * dy + dz * dz)
            e = e - ib.mass * jb.mass / distance
        }
    }
    return e
}

// One run: a fresh system advanced `steps` times; its energy in nano-units,
// rounded half up.
fun run(steps: Int): Long {
    val bodies = createBodies()
    for (i in 0 until steps) advance(bodies, 0.01)
    return floor(energy(bodies) * 1.0e9 + 0.5).toLong()
}

@JsExport
fun bench(iterations: Int): Long {
    var sum = 0L
    for (i in 0 until iterations) sum += run(20000)
    return sum
}
