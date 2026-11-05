// Not on BG: Kotlin translated from BG fasta Java GraalVM AOT #6 (Mehmet D. AKIN;
// Daryl Griffith; Mike):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fasta-graalvmaot-6.html
// Same buffer classes, fields, and loops. Single-threaded: the NucleotideSelector
// worker threads' queues become one FIFO (`pipeline`); put() fills the randoms
// (as Java's main thread does), runs selectNucleotides (the worker's job) and
// enqueues, take() dequeues: the same buffers in the same order. The Java needs
// n*2 >= 6 buffers (n >= 184,320). writer.write -> out(), the output sink (here:
// FNV-1a over the bytes); main -> fasta(n) and bench(n). Programs that read
// fasta's output copy the block between the "fasta generator" markers and make out()
// append (scratchpad fasta-input.md).

// ---- output sink: what BG writes to stdout goes here
var fnvHash = 0
fun out(bytes: ByteArray) {
    var h = fnvHash
    for (b in bytes) {
        h = (h xor (b.toInt() and 0xff)) * 16777619
    }
    fnvHash = h
}
// ---- fasta generator: copy from here to "end of the fasta generator"

/** Maximum length of the FASTA sequence lines. */
private const val LINE_LENGTH = 60

/** Maximum number of FASTA sequence lines that we process at one time. */
private const val LINE_COUNT = 1024

private const val BUFFERS_IN_PLAY = 6

private val pipeline = ArrayDeque<AbstractBuffer>()

fun fasta(n: Int) {
    StochasticBuffer.last = 42
    pipeline.clear()
    val bufferSize = LINE_COUNT * LINE_LENGTH

    for (i in 0 until BUFFERS_IN_PLAY) {
        lineFillALU(AluBuffer(LINE_LENGTH, bufferSize, i * bufferSize))
    }
    speciesFillALU(n * 2, ">ONE Homo sapiens alu\n")
    for (i in 0 until BUFFERS_IN_PLAY) {
        writeBuffer()
        lineFillRandom(IubBuffer(LINE_LENGTH, bufferSize))
    }
    speciesFillRandom(n * 3, ">TWO IUB ambiguity codes\n", true)
    for (i in 0 until BUFFERS_IN_PLAY) {
        writeBuffer()
        lineFillRandom(SapienBuffer(LINE_LENGTH, bufferSize))
    }
    speciesFillRandom(n * 5, ">THREE Homo sapiens frequency\n", false)
    for (i in 0 until BUFFERS_IN_PLAY) {
        writeBuffer()
    }
}

// A worker's put: select the nucleotides, then queue the buffer.
private fun put(buffer: AbstractBuffer) {
    buffer.selectNucleotides()
    pipeline.addLast(buffer)
}

private fun take(): AbstractBuffer = pipeline.removeFirst()

private fun lineFillALU(buffer: AbstractBuffer) {
    put(buffer)
}

private fun bufferFillALU(buffers: Int) {
    for (i in 0 until buffers) {
        val buffer = take()
        out(buffer.nucleotides)
        lineFillALU(buffer)
    }
}

private fun speciesFillALU(nChars: Int, name: String) {
    val bufferCount = nChars / (LINE_COUNT * LINE_LENGTH)
    val charsLeftover = nChars % (LINE_COUNT * LINE_LENGTH)

    out(name.encodeToByteArray())
    bufferFillALU(bufferCount - BUFFERS_IN_PLAY)
    if (charsLeftover > 0) {
        writeBuffer()
        lineFillALU(AluBuffer(LINE_LENGTH, charsLeftover, nChars - charsLeftover))
    }
}

private fun lineFillRandom(buffer: StochasticBuffer) {
    buffer.fillRandoms()
    put(buffer)
}

private fun bufferFillRandom(loops: Int) {
    for (i in 0 until loops) {
        val buffer = take()
        out(buffer.nucleotides)
        lineFillRandom(buffer as StochasticBuffer)
    }
}

private fun speciesFillRandom(nChars: Int, name: String, isIUB: Boolean) {
    val bufferSize = LINE_COUNT * LINE_LENGTH
    val bufferCount = nChars / bufferSize
    val bufferLoops = bufferCount - BUFFERS_IN_PLAY
    val charsLeftover = nChars - (bufferCount * bufferSize)

    out(name.encodeToByteArray())
    bufferFillRandom(bufferLoops)
    if (charsLeftover > 0) {
        writeBuffer()
        lineFillRandom(if (isIUB) IubBuffer(LINE_LENGTH, charsLeftover) else SapienBuffer(LINE_LENGTH, charsLeftover))
    }
}

private fun writeBuffer() {
    out(take().nucleotides)
}

abstract class AbstractBuffer(lineLength: Int, nChars: Int) {
    protected val LINE_LENGTH: Int = lineLength
    protected val LINE_COUNT: Int = nChars / lineLength
    val nucleotides: ByteArray
    protected val CHARS_LEFTOVER: Int = nChars % lineLength

    init {
        val outputLineLength = lineLength + 1
        val nucleotidesSize = nChars + LINE_COUNT + (if (CHARS_LEFTOVER == 0) 0 else 1)
        val lastNucleotide = nucleotidesSize - 1

        nucleotides = ByteArray(nucleotidesSize)
        var i = lineLength
        while (i < lastNucleotide) {
            nucleotides[i] = '\n'.code.toByte()
            i += outputLineLength
        }
        nucleotides[nucleotides.size - 1] = '\n'.code.toByte()
    }

    abstract fun selectNucleotides()
}

class AluBuffer(lineLength: Int, private val nChars: Int, offset: Int) : AbstractBuffer(lineLength, nChars) {
    companion object {
        private const val ALU =
            "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGG" +
            "GAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGA" +
            "CCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAAT" +
            "ACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCA" +
            "GCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGG" +
            "AGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCC" +
            "AGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA"
        private val ALU_LENGTH = ALU.length
    }

    private val MAX_ALU_INDEX = ALU_LENGTH - LINE_LENGTH
    private val ALU_ADJUST = LINE_LENGTH - ALU_LENGTH
    private var charIndex: Int = offset % ALU_LENGTH
    private var nucleotideIndex = 0
    private val chars: ByteArray = (ALU + ALU.substring(0, LINE_LENGTH)).encodeToByteArray()

    override fun selectNucleotides() {
        nucleotideIndex = 0
        for (i in 0 until LINE_COUNT) {
            ALUFillLine(LINE_LENGTH)
        }
        if (CHARS_LEFTOVER > 0) {
            ALUFillLine(CHARS_LEFTOVER)
        }
        charIndex += nChars * (BUFFERS_IN_PLAY - 1)
        charIndex %= ALU_LENGTH
    }

    private fun ALUFillLine(charCount: Int) {
        chars.copyInto(nucleotides, nucleotideIndex, charIndex, charIndex + charCount)
        charIndex += if (charIndex < MAX_ALU_INDEX) charCount else ALU_ADJUST
        nucleotideIndex += charCount + 1
    }
}

abstract class StochasticBuffer(lineLength: Int, nChars: Int) : AbstractBuffer(lineLength, nChars) {
    companion object {
        // LCG parameters
        private const val IM = 139968
        private const val IA = 3877
        private const val IC = 29573
        private const val ONE_OVER_IM = 1f / IM

        /** The last LCG seed value. */
        var last = 42
    }

    protected val randoms = FloatArray(nChars)

    fun fillRandoms() {
        for (i in randoms.indices) {
            last = (last * IA + IC) % IM
            randoms[i] = last * ONE_OVER_IM
        }
    }
}

class IubBuffer(lineLength: Int, nChars: Int) : StochasticBuffer(lineLength, nChars) {
    companion object {
        private val chars = byteArrayOf(
            'a'.code.toByte(), 'c'.code.toByte(), 'g'.code.toByte(), 't'.code.toByte(),
            'B'.code.toByte(), 'D'.code.toByte(), 'H'.code.toByte(), 'K'.code.toByte(),
            'M'.code.toByte(), 'N'.code.toByte(), 'R'.code.toByte(), 'S'.code.toByte(),
            'V'.code.toByte(), 'W'.code.toByte(), 'Y'.code.toByte())
        private val probs = FloatArray(15).also { probs ->
            val dblProbs = doubleArrayOf(
                0.27, 0.12, 0.12, 0.27,
                0.02, 0.02, 0.02, 0.02,
                0.02, 0.02, 0.02, 0.02,
                0.02, 0.02, 0.02)

            var cp = 0.0
            for (i in 0 until probs.size - 1) {
                cp += dblProbs[i]
                probs[i] = cp.toFloat()
            }
            probs[probs.size - 1] = 2f
        }

        private fun convert(r: Float): Byte {
            var m = 0
            while (probs[m] < r) m++
            return chars[m]
        }
    }

    private val charsInFullLines = (nChars / lineLength) * lineLength

    override fun selectNucleotides() {
        var i = 0
        var j = 0
        while (i < charsInFullLines) {
            for (k in 0 until LINE_LENGTH) nucleotides[j++] = convert(randoms[i++])
            j++
        }
        for (k in 0 until CHARS_LEFTOVER) nucleotides[j++] = convert(randoms[i++])
    }
}

class SapienBuffer(lineLength: Int, nChars: Int) : StochasticBuffer(lineLength, nChars) {
    companion object {
        private val chars = byteArrayOf('a'.code.toByte(), 'c'.code.toByte(), 'g'.code.toByte(), 't'.code.toByte())
        private val probs = FloatArray(4).also { probs ->
            val dblProbs = doubleArrayOf(
                0.3029549426680,
                0.1979883004921,
                0.1975473066391,
                0.3015094502008)

            var cp = 0.0
            for (i in 0 until probs.size - 1) {
                cp += dblProbs[i]
                probs[i] = cp.toFloat()
            }
            probs[probs.size - 1] = 2f
        }

        private fun convert(r: Float): Byte {
            var m = 0
            while (probs[m] < r) m++
            return chars[m]
        }
    }

    private val charsInFullLines = (nChars / lineLength) * lineLength

    override fun selectNucleotides() {
        var i = 0
        var j = 0
        while (i < charsInFullLines) {
            for (k in 0 until LINE_LENGTH) nucleotides[j++] = convert(randoms[i++])
            j++
        }
        for (k in 0 until CHARS_LEFTOVER) nucleotides[j++] = convert(randoms[i++])
    }
}
// ---- end of the fasta generator

@JsExport
fun bench(n: Int): Int {
    fnvHash = 2166136261.toInt()
    fasta(n)
    return fnvHash
}
