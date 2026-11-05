// BG mandelbrot Swift #7 (Isaac Gouy, David Turnbull, Patrick Stein), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/mandelbrot-swift-7.html
// Changes: no Foundation (50 MB in Wasm: ICU) or Dispatch: one thread, each
// DispatchQueue.concurrentPerform is a for loop; the top-level code -> the export
// bench(n) (width from n, not CommandLine), which returns the FNV-1a hash of the
// bytes the program wrote (header and pixelBuffer) in place of FileHandle writes,
// and frees pixelBuffer. onepixel and mandelbrot unchanged. SIMD8<Double> lowers
// to simd128 where LLVM can.

/* The Computer Language Benchmarks Game
 https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

 direct transliteration of Greg Buchholz's C program
 contributed by Isaac Gouy, fix by David Turnbull
 dispatching to multiple cores, use SIMD operationn, early break
 depending on previous depth by Patrick Stein
 */

func fnv(_ h0: UInt32, _ p: UnsafePointer<UInt8>, _ count: Int) -> UInt32 {
    var h = h0
    for i in 0..<count { h ^= UInt32(p[i]); h = h &* 16777619 }
    return h
}

@_expose(wasm, "bench")
@_cdecl("bench")
public func bench(_ n: Int32) -> UInt32 {
let width       = Int(n)
let height      = width
let startPoint  = (x:-1.5, i:-1.0)
let endPoint    = (x:0.5,  i:1.0)

let linecount   = height
let linesize    = (width + 7) / 8
let pixelheight = abs(endPoint.x-startPoint.x) / Double(height)
let pixelwidth  = abs(endPoint.i-startPoint.i) / Double(width)
let pixelwidth8 = pixelwidth * 8.0

let outputsize  = linecount * linesize
let pixelBuffer = UnsafeMutablePointer<UInt8>.allocate(capacity: outputsize)
let Ci0         = startPoint.i
let Cr0         = (SIMD8<Double>(0,1,2,3,4,5,6,7) * pixelwidth) + startPoint.x

let Cr0Array = ContiguousArray<SIMD8<Double>>.init(unsafeUninitializedCapacity: linesize)
    {
        buffer, initializedCount in

        let safeBuffer = buffer
        for x in 0..<linesize
        {
            safeBuffer[x] = Cr0 + ( Double(x) * pixelwidth8 )
        }

        initializedCount = linesize
    }

for y in 0..<linecount
{
    let lineaddress = pixelBuffer + (y * linesize)
    let Ci = Ci0 + (Double(y) * pixelheight)
    var pixel:UInt8 = 0

    for x in 0..<linesize
    {
        mandelbrot(Cr: Cr0Array[x],Ci: Ci,pixel:&pixel)
        lineaddress[x] = pixel
    }
}

    var h: UInt32 = 2166136261
    for b in "P4\n\(width) \(height)\n".utf8 { h ^= UInt32(b); h = h &* 16777619 }
    h = fnv(h, pixelBuffer, outputsize)
    pixelBuffer.deallocate()
    return h
}

let iterations  = 50
let depth       = 4.0

// SIMD mandelbrot calculation for 8 points in parallel

@inline(__always) func onepixel(Cr:SIMD8<Double>,Ci:Double,
                                Zr:inout SIMD8<Double>,Zi:inout SIMD8<Double>,
                                Tr:inout SIMD8<Double>,Ti:inout SIMD8<Double>)
{
    Zi = 2.0 * Zr * Zi + Ci
    Zr = Tr - Ti + Cr
    Tr = Zr * Zr
    Ti = Zi * Zi
}

// one pixel calculation stepping 8 points at a time

@inline(__always)
func mandelbrot(Cr:SIMD8<Double>,Ci:Double, pixel:inout UInt8)
{
    var Zr:SIMD8<Double> = .zero
    var Zi:SIMD8<Double> = .zero
    var Tr:SIMD8<Double> = .zero
    var Ti:SIMD8<Double> = .zero

    let thresholds  = SIMD8<Double>(repeating:depth)
    let isFalse     = SIMDMask<SIMD8<Double.SIMDMaskScalar>>(repeating: false)
    let ramp        = SIMD8<Int64>([128,64,32,16,8,4,2,1])

    if pixel == 0
    {
        for _ in 0..<iterations/5
        {
            for _ in 0..<5
            {
                onepixel(Cr:Cr,Ci:Ci,Zr:&Zr,Zi:&Zi,Tr:&Tr,Ti:&Ti)
            }

            let result = Tr + Ti .< thresholds

            if result == isFalse
            {
                return
            }
        }
    }
    else
    {
        for _ in 0..<iterations
        {
            onepixel(Cr:Cr,Ci:Ci,Zr:&Zr,Zi:&Zi,Tr:&Tr,Ti:&Ti)
        }
    }
    let cmpresult = Tr + Ti .< thresholds

    let reduced: SIMD8<Int64> = unsafeBitCast(cmpresult,to: SIMD8<Int64>.self)
    let summask: SIMD8<Int64> = ramp & reduced

    pixel = UInt8(summask.wrappedSum())
}
