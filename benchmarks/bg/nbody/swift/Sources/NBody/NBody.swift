// BG nbody Swift #3 (Stuart Carnie), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/nbody-swift-3.html
// Changes: `#if !os(Linux) import simd` -> `#if canImport(simd)` (WASI has no simd
// module, so the file's own dot() is used, as on Linux); the top-level code ->
// the export bench(n), which builds the system, runs n steps, and returns the
// FNV-1a hash of the bytes the program printed. String(format:) needs Foundation,
// which is 50 MB in Wasm (ICU data): "%.9f" goes through libc's snprintf instead.
// SIMD4<Double> lowers to wasm simd128 where LLVM can.


/// The Computer Language Benchmarks Game
/// https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
///
/// contributed by Stuart Carnie
///
/// derived from numerous versions, including Swift and Go
///
/// This code requires hardware supporting
/// CPU feature AVX2, using SIMD4 types.

#if canImport(WASILibc)
import WASILibc
#else
import Foundation
#endif
#if canImport(simd)
import simd
#else
func dot<V : SIMD>(_ a: V, _ b: V) -> V.Scalar where V.Scalar : FloatingPoint {
    return (a * b).sum()
}
#endif

let SOLAR_MASS = 4 * Double.pi * Double.pi
let DAYS_PER_YEAR = 365.24

public typealias Vec4 = (x: Double, y: Double, z: Double, w: Double)

extension SIMD4 where Scalar == Double {
    @_transparent
    init(_ v: Vec4) {
        self.init(x: v.x, y: v.y, z: v.z, w: v.w)
    }
}

@frozen
@usableFromInline
struct Body {
    public var pos: Vec4
    public var vel: Vec4
    public let mass: Double
    
    init() {
        let zero = Vec4(0, 0, 0, 0)
        self.init(pos: zero, vel: zero, mass: 0)
    }
    
    init(pos: Vec4, vel: Vec4, mass: Double) {
        self.pos = pos
        self.vel = vel
        self.mass = mass
    }
}

// ensures loops are static so they can be unrolled explicitly at compile-time
let planetsCount = 5

@usableFromInline
@frozen struct System {
    @inline(__always)
    var bodies: [Body]
    
    @inline(__always)
    let bodiesp: UnsafeMutablePointer<Body>
    
    init(_ bodies: [Body]) {
        self.bodies = bodies
        bodiesp = UnsafeMutablePointer<Body>(mutating: self.bodies)
        start()
    }
    
    func energy() -> Double {
        var energy = 0.0
        for i in 0..<planetsCount {
            let bodyi = bodiesp[i]
            let posi = SIMD4(bodyi.pos)
            let veli = SIMD4(bodyi.vel)
            
            energy += 0.5 * bodyi.mass * dot(veli, veli)
            
            for j in i+1..<planetsCount {
                let bodyj = bodiesp[j]
                let posj = SIMD4(bodyj.pos)
                let d  = posi - posj
                let distance = sqrt(dot(d, d))
                energy -= (bodyi.mass * bodyj.mass) / distance
            }
        }
        
        return energy
    }
    
    @inline(__always)
    mutating func step(dt: Double) {
        for i in 0..<planetsCount {
            let bodyi = bodiesp[i]
            for j in i+1..<planetsCount {
                let bodyj = bodiesp[j]
                
                let d = SIMD4(bodyi.pos) - SIMD4(bodyj.pos)
                let dSquared = dot(d, d)
                let distance = sqrt(dSquared)
                let mag = dt / (dSquared * distance)
                
                let nveli = SIMD4(bodiesp[i].vel) - d *
                    SIMD4(repeating: bodyj.mass) * mag
                bodiesp[i].vel = (nveli.x, nveli.y, nveli.z, nveli.w)
                
                let nvelj = SIMD4(bodiesp[j].vel) + d *
                    SIMD4(repeating: bodyi.mass) * mag
                bodiesp[j].vel = (nvelj.x, nvelj.y, nvelj.z, nvelj.w)
            }
        }
        
        for i in 0..<planetsCount {
            let body = bodiesp[i]
            var pos  = SIMD4(body.pos)
            pos += dt * SIMD4(body.vel)
            bodiesp[i].pos = (pos.x, pos.y, pos.z, pos.w)
        }
    }
    
    // Adjusts momentum of the sun
    private mutating func start() {
        var p = SIMD4<Double>()
        for i in 0..<planetsCount {
            let body = bodiesp[i]
            let mass = SIMD4(repeating: body.mass)
            let vel  = SIMD4(body.vel)
            p += vel * mass
        }
        let solarMass = SIMD4(repeating: SOLAR_MASS)
        let vel = -p / solarMass
        bodiesp[0].vel = (vel.x, vel.y, vel.z, vel.w)
    }
}

let sun = Body(
    pos: (x: 0.0, y: 0.0, z: 0.0, w: 0),
    vel: (x: 0.0, y: 0.0, z: 0.0, w: 0),
    mass: SOLAR_MASS)

let jupiter = Body(
    pos: (
        x: 4.8414314424647209,
        y: -1.16032004402742839,
        z: -0.103622044471123109,
        w: 0),
    vel: (
        x: 1.66007664274403694e-03 * DAYS_PER_YEAR,
        y: 7.69901118419740425e-03 * DAYS_PER_YEAR,
        z: -6.90460016972063023e-05 * DAYS_PER_YEAR,
        w: 0),
    mass: 9.54791938424326609e-04 * SOLAR_MASS)

let saturn = Body(
    pos: (
        x: 8.34336671824457987,
        y: 4.12479856412430479,
        z: -4.03523417114321381e-01,
        w: 0),
    vel: (
        x: -2.76742510726862411e-03 * DAYS_PER_YEAR,
        y: 4.99852801234917238e-03 * DAYS_PER_YEAR,
        z: 2.30417297573763929e-05 * DAYS_PER_YEAR,
        w: 0),
    mass: 2.85885980666130812e-04 * SOLAR_MASS )

let uranus = Body(
    pos: (
        x: 1.28943695621391310e+01,
        y: -1.51111514016986312e+01,
        z: -2.23307578892655734e-01,
        w: 0),
    vel: (
        x: 2.96460137564761618e-03 * DAYS_PER_YEAR,
        y: 2.37847173959480950e-03 * DAYS_PER_YEAR,
        z: -2.96589568540237556e-05 * DAYS_PER_YEAR,
        w: 0),
    mass: 4.36624404335156298e-05 * SOLAR_MASS )

let neptune = Body(
    pos: (
        x: 1.53796971148509165e+01,
        y: -2.59193146099879641e+01,
        z: 1.79258772950371181e-01,
        w: 0),
    vel: (
        x: 2.68067772490389322e-03 * DAYS_PER_YEAR,
        y: 1.62824170038242295e-03 * DAYS_PER_YEAR,
        z: -9.51592254519715870e-05 * DAYS_PER_YEAR,
        w: 0),
    mass: 5.15138902046611451e-05 * SOLAR_MASS )

func fnv(_ h: UInt32, _ s: String) -> UInt32 {
    var h = h
    for b in s.utf8 { h ^= UInt32(b); h = h &* 16777619 }
    return h
}

// String(format: "%.9f", x), through libc.
func format9(_ x: Double) -> String {
    var buf = [CChar](repeating: 0, count: 64)
    _ = withVaList([x]) { vsnprintf(&buf, 64, "%.9f", $0) }
    return String(cString: buf)
}

@_expose(wasm, "bench")
@_cdecl("bench")
public func bench(_ n: Int32) -> UInt32 {
    var h: UInt32 = 2166136261
    var system = System([sun, jupiter, saturn, uranus, neptune])
    h = fnv(h, format9(system.energy()) + "\n")
    for _ in 0..<n {
        system.step(dt: 0.01)
    }
    h = fnv(h, format9(system.energy()) + "\n")
    return h
}
