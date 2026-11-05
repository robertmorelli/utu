// Not on BG: Kotlin/Wasm translation of BG k-nucleotide Java GraalVM #1
// (James McIlree, Tagir Valeev):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/knucleotide-graalvmaot-1.html
// Changes: single-threaded (the fragment tasks run in order, not on an
// ExecutorService); fastutil's Long2IntOpenHashMap is a JVM library, so a
// minimal one is written here the same way (open addressing, linear probing,
// fastutil's mix hash, the 0 key kept apart, load factor 0.75); stdin -> the
// fasta text setup(n) makes; no String.format in Kotlin/Wasm, so "%.3f" is
// formatted by hand (round to thousandths); System.out -> FNV-1a 32 of the
// bytes, returned by bench(n).

/* The Computer Language Benchmarks Game
 https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

 contributed by James McIlree
 modified by Tagir Valeev
 */

import kotlin.math.round

class Long2IntOpenHashMap {
    private var key = LongArray(16)
    private var value = IntArray(16)
    private var mask = 15
    private var n = 16
    private var containsNullKey = false
    private var nullValue = 0
    private var size = 0
    private var maxFill = 12

    private fun mix(x: Long): Int {
        var h = x * -0x61c8864680b583ebL // fastutil HashCommon.LONG_PHI
        h = h xor (h ushr 32)
        return (h xor (h ushr 16)).toInt()
    }

    fun size(): Int = size + (if (containsNullKey) 1 else 0)

    fun addTo(k: Long, incr: Int) {
        if (k == 0L) {
            if (!containsNullKey) { containsNullKey = true; nullValue = 0 }
            nullValue += incr
            return
        }
        var pos = mix(k) and mask
        while (true) {
            val curr = key[pos]
            if (curr == 0L) break
            if (curr == k) { value[pos] += incr; return }
            pos = (pos + 1) and mask
        }
        key[pos] = k
        value[pos] = incr
        if (++size >= maxFill) rehash(n * 2)
    }

    fun get(k: Long): Int {
        if (k == 0L) return if (containsNullKey) nullValue else 0
        var pos = mix(k) and mask
        while (true) {
            val curr = key[pos]
            if (curr == 0L) return 0
            if (curr == k) return value[pos]
            pos = (pos + 1) and mask
        }
    }

    private fun rehash(newN: Int) {
        val oldKey = key
        val oldValue = value
        val newMask = newN - 1
        val newKey = LongArray(newN)
        val newValue = IntArray(newN)
        for (i in 0 until n) {
            val k = oldKey[i]
            if (k == 0L) continue
            var pos = mix(k) and newMask
            while (newKey[pos] != 0L) pos = (pos + 1) and newMask
            newKey[pos] = k
            newValue[pos] = oldValue[i]
        }
        n = newN
        mask = newMask
        maxFill = (newN * 3) / 4
        key = newKey
        value = newValue
    }

    fun forEach(action: (Long, Int) -> Unit) {
        if (containsNullKey) action(0L, nullValue)
        for (i in n - 1 downTo 0) if (key[i] != 0L) action(key[i], value[i])
    }
}

val codes = byteArrayOf(-1, 0, -1, 1, 3, -1, -1, 2)
val nucleotides = charArrayOf('A', 'C', 'G', 'T')

class Result(val keyLength: Int) {
    val map = Long2IntOpenHashMap()
}

fun createFragmentTasks(sequence: ByteArray, fragmentLengths: IntArray): ArrayList<() -> Result> {
    val tasks = ArrayList<() -> Result>()
    for (fragmentLength in fragmentLengths) {
        for (index in 0 until fragmentLength) {
            val offset = index
            tasks.add { createFragmentMap(sequence, offset, fragmentLength) }
        }
    }
    return tasks
}

fun createFragmentMap(sequence: ByteArray, offset: Int, fragmentLength: Int): Result {
    val res = Result(fragmentLength)
    val map = res.map
    val lastIndex = sequence.size - fragmentLength + 1
    var index = offset
    while (index < lastIndex) {
        map.addTo(getKey(sequence, index, fragmentLength), 1)
        index += fragmentLength
    }
    return res
}

fun sumTwoMaps(map1: Result, map2: Result): Result {
    map2.map.forEach { key, value -> map1.map.addTo(key, value) }
    return map1
}

// String.format(Locale.ENGLISH, "%.3f", x)
fun format3(x: Double): String {
    val r = round(x * 1000.0).toLong()
    val frac = (r % 1000).toString().padStart(3, '0')
    return "${r / 1000}.$frac"
}

fun writeFrequencies(totalCount: Float, frequencies: Result): String {
    val freq = ArrayList<Pair<String, Int>>(frequencies.map.size())
    frequencies.map.forEach { key, cnt -> freq.add(Pair(keyToString(key, frequencies.keyLength), cnt)) }
    freq.sortWith(compareByDescending { it.second })
    val sb = StringBuilder()
    for (entry in freq) {
        sb.append(entry.first).append(' ').append(format3((entry.second * 100.0f / totalCount).toDouble())).append('\n')
    }
    return sb.append('\n').toString()
}

fun writeCount(futures: List<Result>, nucleotideFragment: String): String {
    val key = toCodes(nucleotideFragment.encodeToByteArray(), nucleotideFragment.length)
    val k = getKey(key, 0, nucleotideFragment.length)
    var count = 0
    for (f in futures) {
        if (f.keyLength == nucleotideFragment.length) {
            count += f.map.get(k)
        }
    }
    return count.toString() + "\t" + nucleotideFragment + '\n'
}

/** Convert long key to the nucleotides string */
fun keyToString(key0: Long, length: Int): String {
    var key = key0
    val res = CharArray(length)
    for (i in 0 until length) {
        res[length - i - 1] = nucleotides[(key and 0x3).toInt()]
        key = key shr 2
    }
    return res.concatToString()
}

/** Get the long key for given byte array of codes at given offset and length */
fun getKey(arr: ByteArray, offset: Int, length: Int): Long {
    var key = 0L
    for (i in offset until offset + length) {
        key = key * 4 + arr[i]
    }
    return key
}

/** Convert given byte array (limiting to given length) containing acgtACGT to codes */
fun toCodes(sequence: ByteArray, length: Int): ByteArray {
    val result = ByteArray(length)
    for (i in 0 until length) {
        result[i] = codes[sequence[i].toInt() and 0x7]
    }
    return result
}

// BufferedReader.readLine over the fasta text.
class LineReader(private val s: ByteArray) {
    private var pos = 0
    fun readLine(): String? {
        if (pos >= s.size) return null
        var end = pos
        while (end < s.size && s[end] != '\n'.code.toByte()) end++
        val line = s.decodeToString(pos, end)
        pos = end + 1
        return line
    }
}

fun read(input: LineReader): ByteArray {
    var line: String?
    while (true) {
        line = input.readLine()
        if (line == null || line.startsWith(">THREE")) break
    }

    var bytes = ByteArray(1048576)
    var position = 0
    while (true) {
        line = input.readLine()
        if (line == null || line[0] == '>') break
        if (line.length + position > bytes.size) {
            val newBytes = ByteArray(bytes.size * 2)
            bytes.copyInto(newBytes, 0, 0, position)
            bytes = newBytes
        }
        for (i in 0 until line.length) bytes[position++] = line[i].code.toByte()
    }

    return toCodes(bytes, position)
}

fun run(): String {
    val sequence = read(LineReader(INPUT))

    val fragmentLengths = intArrayOf(1, 2, 3, 4, 6, 12, 18)
    val futures = createFragmentTasks(sequence, fragmentLengths).map { it() } // BG: pool.invokeAll

    val sb = StringBuilder()

    sb.append(writeFrequencies(sequence.size.toFloat(), futures[0]))
    sb.append(writeFrequencies((sequence.size - 1).toFloat(), sumTwoMaps(futures[1], futures[2])))

    val nucleotideFragments = arrayOf("GGT", "GGTA", "GGTATT", "GGTATTTTAATT", "GGTATTTTAATTTATAGT")
    for (nucleotideFragment in nucleotideFragments) {
        sb.append(writeCount(futures, nucleotideFragment))
    }
    return sb.toString()
}

// ---- setup(n): BG fasta's output for n (ALU repeated for 2n, IUB random for
// 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
// probabilities in double). Untimed.
var INPUT = ByteArray(0)

fun fasta(n: Int): ByteArray {
    val alu = "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA"
    val out = StringBuilder()
    out.append(">ONE Homo sapiens alu\n")
    var k = 0
    var left = 2 * n
    while (left > 0) {
        for (i in 0 until minOf(left, 60)) {
            out.append(alu[k])
            k = (k + 1) % alu.length
        }
        out.append('\n')
        left -= 60
    }
    var seed = 42
    fun random(chars: String, probs: DoubleArray, count: Int) {
        val cum = DoubleArray(probs.size)
        var c = 0.0
        for (i in probs.indices) { c += probs[i]; cum[i] = c }
        var left2 = count
        while (left2 > 0) {
            for (i in 0 until minOf(left2, 60)) {
                seed = (seed * 3877 + 29573) % 139968
                val r = seed / 139968.0
                var j = 0
                while (j < cum.size - 1 && r >= cum[j]) j++
                out.append(chars[j])
            }
            out.append('\n')
            left2 -= 60
        }
    }
    out.append(">TWO IUB ambiguity codes\n")
    random("acgtBDHKMNRSVWY", doubleArrayOf(0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02), 3 * n)
    out.append(">THREE Homo sapiens frequency\n")
    random("acgt", doubleArrayOf(0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008), 5 * n)
    return out.toString().encodeToByteArray()
}

@JsExport
fun setup(n: Int) {
    INPUT = fasta(n)
}

@JsExport
fun bench(n: Int): Int {
    var h = 2166136261.toInt()
    for (c in run()) h = (h xor c.code) * 16777619
    return h
}
