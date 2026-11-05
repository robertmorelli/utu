// Not on BG: Kotlin translated from BG pidigits Java GraalVM AOT #5 (Michael
// Ganss; Oleksii Prudkyi; Mike Pall, Wim Couwenberg; Craig Russell; Mr Ledrug;
// ported to Java by Piotr Tarsa):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/pidigits-graalvmaot-5.html
// The Java calls GMP through the foreign-function API; Kotlin/Wasm has neither
// GMP nor BigInteger, so the numbers are com.ionspin.kotlin:bignum 0.3.10
// (pure Kotlin, immutable): each mpz call becomes the expression it computes.
// bench(n) returns the FNV-1a hash of the bytes the Java program prints.
import com.ionspin.kotlin.bignum.integer.BigInteger
import kotlin.js.ExperimentalJsExport
import kotlin.js.JsExport

private fun fnv(h0: Int, s: String): Int {
    var h = h0
    for (c in s) h = (h xor c.code) * 16777619
    return h
}

@OptIn(ExperimentalJsExport::class)
@JsExport
fun bench(n: Int): Int {
    var n1 = BigInteger.fromInt(4)
    var n2 = BigInteger.fromInt(3)
    var d = BigInteger.fromInt(1)
    var u: BigInteger
    var v: BigInteger
    var w: BigInteger
    var k = 1
    var k2: Int
    var i = 0

    val outBuf = StringBuilder()
    var h = -2128831035

    while (true) {
        u = n1 / d
        v = n2 / d

        if (u.compareTo(v) == 0) {
            outBuf.append(u.intValue())
            i++
            if (i % 10 == 0) {
                outBuf.append("\t:").append(i).append("\n")
                h = fnv(h, outBuf.toString())
                outBuf.clear()
            }
            if (i == n)
                break

            // extract
            u = u * BigInteger.fromInt(-10)
            u = d * u
            n1 = n1 * BigInteger.fromInt(10)
            n1 = n1 + u
            n2 = n2 * BigInteger.fromInt(10)
            n2 = n2 + u
        } else {
            // produce
            k2 = k * 2
            u = n1 * BigInteger.fromInt(k2 - 1)
            v = n2 + n2
            w = n1 * BigInteger.fromInt(k - 1)
            n1 = u + v
            u = n2 * BigInteger.fromInt(k + 2)
            n2 = w + u
            d = d * BigInteger.fromInt(k2 + 1)
            k++
        }
    }

    if (i % 10 != 0)
        outBuf.append(" ".repeat(10 - n % 10)).append("\t:").append(n).append("\n")
    return fnv(h, outBuf.toString())
}
