// DeltaBlue: the canonical incremental constraint solver (V8's deltablue.js,
// Dart's DeltaBlue.dart), written as idiomatic Kotlin: an enum class of
// strengths, abstract classes with subclassing, ArrayLists, nullable types for
// absent. Worklists are stacks. Compiled to WasmGC by Kotlin/Wasm; benchChain
// and benchProjection are exported to JavaScript.

@file:OptIn(ExperimentalJsExport::class)

enum class Strength {
    REQUIRED,
    STRONG_PREFERRED,
    PREFERRED,
    STRONG_DEFAULT,
    NORMAL,
    WEAK_DEFAULT,
    WEAKEST;

    fun stronger(other: Strength): Boolean = ordinal < other.ordinal
    fun weaker(other: Strength): Boolean = ordinal > other.ordinal
    fun weakestOf(other: Strength): Strength = if (weaker(other)) this else other

    // Canonical (and deliberately inverted) successor table.
    val nextWeaker: Strength
        get() = when (this) {
            REQUIRED -> WEAKEST
            STRONG_PREFERRED -> WEAK_DEFAULT
            PREFERRED -> NORMAL
            STRONG_DEFAULT -> STRONG_DEFAULT
            NORMAL -> PREFERRED
            WEAK_DEFAULT -> REQUIRED
            WEAKEST -> throw IllegalStateException("no weaker strength")
        }
}

enum class Direction { NONE, FORWARD, BACKWARD }

class Variable(var value: Int = 0) {
    val constraints = ArrayList<Constraint>()
    var determinedBy: Constraint? = null
    var mark = 0
    var walkStrength = Strength.WEAKEST
    var stay = true

    fun addConstraint(c: Constraint) {
        constraints.add(c)
    }

    // Removes every occurrence of c, in place.
    fun removeConstraint(c: Constraint) {
        val constraints = this.constraints
        var kept = 0
        for (i in 0 until constraints.size) {
            val x = constraints[i]
            if (x !== c) {
                if (kept != i) constraints[kept] = x
                kept++
            }
        }
        constraints.subList(kept, constraints.size).clear()
        if (determinedBy === c) determinedBy = null
    }
}

abstract class Constraint(val strength: Strength) {
    abstract fun isSatisfied(): Boolean
    abstract fun markUnsatisfied()
    abstract fun addToGraph()
    abstract fun removeFromGraph()
    abstract fun chooseMethod(mark: Int)
    abstract fun markInputs(mark: Int)
    abstract fun inputsKnown(mark: Int): Boolean
    abstract fun output(): Variable
    abstract fun execute()
    abstract fun recalculate()

    fun addConstraint(planner: Planner) {
        addToGraph()
        planner.incrementalAdd(this)
    }

    fun satisfy(mark: Int, planner: Planner): Constraint? {
        chooseMethod(mark)
        if (!isSatisfied()) {
            if (strength == Strength.REQUIRED) {
                throw IllegalStateException("Could not satisfy a required constraint!")
            }
            return null
        }
        markInputs(mark)
        val out = output()
        val overridden = out.determinedBy
        overridden?.markUnsatisfied()
        out.determinedBy = this
        if (!planner.addPropagate(this, mark)) throw IllegalStateException("Cycle encountered")
        out.mark = mark
        return overridden
    }

    fun destroyConstraint(planner: Planner) {
        if (isSatisfied()) {
            planner.incrementalRemove(this)
        } else {
            removeFromGraph()
        }
    }

    open fun isInput(): Boolean = false
}

abstract class UnaryConstraint(val myOutput: Variable, strength: Strength, planner: Planner) :
    Constraint(strength) {
    var satisfied = false

    init {
        addConstraint(planner)
    }

    override fun addToGraph() {
        myOutput.addConstraint(this)
        satisfied = false
    }

    override fun chooseMethod(mark: Int) {
        satisfied = myOutput.mark != mark && strength.stronger(myOutput.walkStrength)
    }

    override fun isSatisfied(): Boolean = satisfied

    override fun markInputs(mark: Int) {}

    override fun output(): Variable = myOutput

    override fun recalculate() {
        myOutput.walkStrength = strength
        myOutput.stay = !isInput()
        if (myOutput.stay) execute()
    }

    override fun markUnsatisfied() {
        satisfied = false
    }

    override fun inputsKnown(mark: Int): Boolean = true

    override fun removeFromGraph() {
        myOutput.removeConstraint(this)
        satisfied = false
    }

    override fun execute() {}
}

class StayConstraint(v: Variable, strength: Strength, planner: Planner) :
    UnaryConstraint(v, strength, planner)

class EditConstraint(v: Variable, strength: Strength, planner: Planner) :
    UnaryConstraint(v, strength, planner) {
    override fun isInput(): Boolean = true
}

// Subclasses add the constraint once their own fields are set.
abstract class BinaryConstraint(val v1: Variable, val v2: Variable, strength: Strength) :
    Constraint(strength) {
    var direction = Direction.NONE

    override fun chooseMethod(mark: Int) {
        var direction = Direction.NONE
        if (v1.mark == mark) {
            direction = if (v2.mark != mark && strength.stronger(v2.walkStrength)) {
                Direction.FORWARD
            } else {
                Direction.NONE
            }
        }
        if (v2.mark == mark) {
            direction = if (v1.mark != mark && strength.stronger(v1.walkStrength)) {
                Direction.BACKWARD
            } else {
                Direction.NONE
            }
        }
        if (v1.walkStrength.weaker(v2.walkStrength)) {
            direction = if (strength.stronger(v1.walkStrength)) Direction.BACKWARD else Direction.NONE
        } else {
            direction = if (strength.stronger(v2.walkStrength)) Direction.FORWARD else Direction.BACKWARD
        }
        this.direction = direction
    }

    override fun addToGraph() {
        v1.addConstraint(this)
        v2.addConstraint(this)
        direction = Direction.NONE
    }

    override fun isSatisfied(): Boolean = direction != Direction.NONE

    override fun markInputs(mark: Int) {
        input().mark = mark
    }

    fun input(): Variable = if (direction == Direction.FORWARD) v1 else v2

    override fun output(): Variable = if (direction == Direction.FORWARD) v2 else v1

    override fun recalculate() {
        val ihn = input()
        val out = output()
        out.walkStrength = strength.weakestOf(ihn.walkStrength)
        out.stay = ihn.stay
        if (out.stay) execute()
    }

    override fun markUnsatisfied() {
        direction = Direction.NONE
    }

    override fun inputsKnown(mark: Int): Boolean {
        val i = input()
        return i.mark == mark || i.stay || i.determinedBy == null
    }

    override fun removeFromGraph() {
        v1.removeConstraint(this)
        v2.removeConstraint(this)
        direction = Direction.NONE
    }
}

class ScaleConstraint(
    src: Variable,
    val scale: Variable,
    val offset: Variable,
    dest: Variable,
    strength: Strength,
    planner: Planner,
) : BinaryConstraint(src, dest, strength) {
    init {
        addConstraint(planner)
    }

    override fun addToGraph() {
        super.addToGraph()
        scale.addConstraint(this)
        offset.addConstraint(this)
    }

    override fun removeFromGraph() {
        super.removeFromGraph()
        scale.removeConstraint(this)
        offset.removeConstraint(this)
    }

    override fun markInputs(mark: Int) {
        super.markInputs(mark)
        scale.mark = mark
        offset.mark = mark
    }

    override fun execute() {
        if (direction == Direction.FORWARD) {
            v2.value = v1.value * scale.value + offset.value
        } else {
            v1.value = (v2.value - offset.value) / scale.value
        }
    }

    override fun recalculate() {
        val ihn = input()
        val out = output()
        out.walkStrength = strength.weakestOf(ihn.walkStrength)
        out.stay = ihn.stay && scale.stay && offset.stay
        if (out.stay) execute()
    }
}

class EqualityConstraint(var1: Variable, var2: Variable, strength: Strength, planner: Planner) :
    BinaryConstraint(var1, var2, strength) {
    init {
        addConstraint(planner)
    }

    override fun execute() {
        output().value = input().value
    }
}

class Planner {
    var currentMark = 0

    fun newMark(): Int = ++currentMark

    fun incrementalAdd(c: Constraint) {
        val mark = newMark()
        var overridden = c.satisfy(mark, this)
        while (overridden != null) {
            overridden = overridden.satisfy(mark, this)
        }
    }

    fun incrementalRemove(c: Constraint) {
        val out = c.output()
        c.markUnsatisfied()
        c.removeFromGraph()
        val unsatisfied = removePropagateFrom(out)
        var strength = Strength.REQUIRED
        do {
            for (u in unsatisfied) {
                if (u.strength == strength) incrementalAdd(u)
            }
            strength = strength.nextWeaker
        } while (strength != Strength.WEAKEST)
    }

    fun makePlan(sources: ArrayList<Constraint>): ArrayList<Constraint> {
        val mark = newMark()
        val plan = ArrayList<Constraint>()
        val todo = sources
        while (todo.isNotEmpty()) {
            val c = todo.removeLast()
            val out = c.output()
            if (out.mark != mark && c.inputsKnown(mark)) {
                plan.add(c)
                out.mark = mark
                addConstraintsConsumingTo(out, todo)
            }
        }
        return plan
    }

    fun extractPlanFromConstraints(constraints: List<Constraint>): ArrayList<Constraint> =
        makePlan(constraints.filterTo(ArrayList()) { it.isInput() && it.isSatisfied() })

    fun addPropagate(c: Constraint, mark: Int): Boolean {
        val todo = arrayListOf(c)
        while (todo.isNotEmpty()) {
            val d = todo.removeLast()
            val out = d.output()
            if (out.mark == mark) {
                incrementalRemove(c)
                return false
            }
            d.recalculate()
            addConstraintsConsumingTo(out, todo)
        }
        return true
    }

    fun removePropagateFrom(out: Variable): ArrayList<Constraint> {
        out.determinedBy = null
        out.walkStrength = Strength.WEAKEST
        out.stay = true
        val unsatisfied = ArrayList<Constraint>()
        val todo = arrayListOf(out)
        while (todo.isNotEmpty()) {
            val v = todo.removeLast()
            for (c in v.constraints) {
                if (!c.isSatisfied()) unsatisfied.add(c)
            }
            val determining = v.determinedBy
            for (c in v.constraints) {
                if (c !== determining && c.isSatisfied()) {
                    c.recalculate()
                    todo.add(c.output())
                }
            }
        }
        return unsatisfied
    }

    fun addConstraintsConsumingTo(v: Variable, coll: ArrayList<Constraint>) {
        val determining = v.determinedBy
        for (c in v.constraints) {
            if (c !== determining && c.isSatisfied()) coll.add(c)
        }
    }
}

fun executePlan(plan: List<Constraint>) {
    for (c in plan) c.execute()
}

fun chainTest(n: Int): Int {
    val planner = Planner()
    var failures = 0
    var prev: Variable? = null
    var first: Variable? = null
    var last: Variable? = null
    for (i in 0..n) {
        val v = Variable()
        if (prev != null) EqualityConstraint(prev, v, Strength.REQUIRED, planner)
        if (i == 0) first = v
        if (i == n) last = v
        prev = v
    }
    StayConstraint(last!!, Strength.STRONG_DEFAULT, planner)
    val edit = EditConstraint(first!!, Strength.PREFERRED, planner)
    val plan = planner.extractPlanFromConstraints(listOf(edit))
    for (i in 0 until 100) {
        first.value = i
        executePlan(plan)
        if (last.value != i) failures++
    }
    return failures
}

fun projectionTest(n: Int): Int {
    val planner = Planner()
    var failures = 0
    val scale = Variable(10)
    val offset = Variable(1000)
    var src: Variable? = null
    var dst: Variable? = null
    val dests = ArrayList<Variable>()
    for (i in 0 until n) {
        src = Variable(i)
        dst = Variable(i)
        dests.add(dst)
        StayConstraint(src, Strength.NORMAL, planner)
        ScaleConstraint(src, scale, offset, dst, Strength.REQUIRED, planner)
    }
    change(planner, src!!, 17)
    if (dst!!.value != 1170) failures++
    change(planner, dst, 1050)
    if (src.value != 5) failures++
    change(planner, scale, 5)
    for (i in 0 until n - 1) {
        if (dests[i].value != i * 5 + 1000) failures++
    }
    change(planner, offset, 2000)
    for (i in 0 until n - 1) {
        if (dests[i].value != i * 5 + 2000) failures++
    }
    return failures
}

fun change(planner: Planner, v: Variable, newValue: Int) {
    val edit = EditConstraint(v, Strength.PREFERRED, planner)
    val plan = planner.extractPlanFromConstraints(listOf(edit))
    for (i in 0 until 10) {
        v.value = newValue
        executePlan(plan)
    }
    edit.destroyConstraint(planner)
}

@JsExport
fun benchChain(iterations: Int): Int {
    var failures = 0
    for (i in 0 until iterations) failures += chainTest(1048)
    return failures
}

@JsExport
fun benchProjection(iterations: Int): Int {
    var failures = 0
    for (i in 0 until iterations) failures += projectionTest(1048)
    return failures
}
