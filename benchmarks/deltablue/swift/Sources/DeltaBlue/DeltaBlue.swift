// DeltaBlue, the incremental constraint solver (V8's deltablue.js, Dart's
// DeltaBlue.dart), in idiomatic Swift: a class hierarchy of constraints with
// final leaf classes, Arrays, and optionals for absent. Worklists are stacks.
//
// Variables and constraints reference each other strongly, so each test's
// graph is a reference cycle that ARC never frees (as in the Rc<RefCell<_>>
// Rust port).

// MARK: - Strength

enum Strength: Int, Comparable {
    case required, strongPreferred, preferred, strongDefault, normal, weakDefault, weakest

    static func < (a: Strength, b: Strength) -> Bool { a.rawValue < b.rawValue }

    func stronger(_ other: Strength) -> Bool { self < other }
    func weaker(_ other: Strength) -> Bool { self > other }
    func weakestOf(_ other: Strength) -> Strength { weaker(other) ? self : other }

    /// The original's table, inverted on purpose: required is followed by
    /// weakest, so incrementalRemove only ever re-adds required constraints.
    var nextWeaker: Strength {
        switch self {
        case .required: return .weakest
        case .strongPreferred: return .weakDefault
        case .preferred: return .normal
        case .strongDefault: return .strongDefault
        case .normal: return .preferred
        case .weakDefault: return .required
        case .weakest: fatalError("no weaker strength")
        }
    }
}

enum Direction {
    case none, forward, backward
}

// MARK: - Variable

final class Variable {
    var value: Int
    var constraints: [Constraint] = []
    var determinedBy: Constraint? = nil
    var mark = 0
    var walkStrength = Strength.weakest
    var stay = true

    init(_ value: Int = 0) { self.value = value }

    func addConstraint(_ c: Constraint) { constraints.append(c) }

    /// Removes every occurrence of c, in place.
    func removeConstraint(_ c: Constraint) {
        constraints.removeAll { $0 === c }
        if determinedBy === c { determinedBy = nil }
    }
}

// MARK: - Constraints

class Constraint {
    let strength: Strength

    init(_ strength: Strength) { self.strength = strength }

    func addConstraint(_ planner: Planner) {
        addToGraph()
        planner.incrementalAdd(self)
    }

    /// Satisfies this constraint if it can, returning the constraint it
    /// overrode, if any.
    func satisfy(_ mark: Int, _ planner: Planner) -> Constraint? {
        chooseMethod(mark)
        if !isSatisfied() {
            if strength == .required { fatalError("Could not satisfy a required constraint!") }
            return nil
        }
        markInputs(mark)
        let out = output()
        let overridden = out.determinedBy
        overridden?.markUnsatisfied()
        out.determinedBy = self
        if !planner.addPropagate(self, mark) { fatalError("Cycle encountered") }
        out.mark = mark
        return overridden
    }

    func destroyConstraint(_ planner: Planner) {
        if isSatisfied() { planner.incrementalRemove(self) } else { removeFromGraph() }
    }

    func isInput() -> Bool { false }

    // Abstract.
    func addToGraph() { fatalError("abstract") }
    func removeFromGraph() { fatalError("abstract") }
    func chooseMethod(_ mark: Int) { fatalError("abstract") }
    func isSatisfied() -> Bool { fatalError("abstract") }
    func markInputs(_ mark: Int) { fatalError("abstract") }
    func output() -> Variable { fatalError("abstract") }
    func recalculate() { fatalError("abstract") }
    func markUnsatisfied() { fatalError("abstract") }
    func inputsKnown(_ mark: Int) -> Bool { fatalError("abstract") }
    func execute() { fatalError("abstract") }
}

class UnaryConstraint: Constraint {
    let myOutput: Variable
    var satisfied = false

    init(_ v: Variable, _ strength: Strength, _ planner: Planner) {
        myOutput = v
        super.init(strength)
        addConstraint(planner)
    }

    override func addToGraph() {
        myOutput.addConstraint(self)
        satisfied = false
    }

    override func chooseMethod(_ mark: Int) {
        satisfied = myOutput.mark != mark && strength.stronger(myOutput.walkStrength)
    }

    override func isSatisfied() -> Bool { satisfied }
    override func markInputs(_ mark: Int) {}
    override func output() -> Variable { myOutput }

    override func recalculate() {
        myOutput.walkStrength = strength
        myOutput.stay = !isInput()
        if myOutput.stay { execute() }
    }

    override func markUnsatisfied() { satisfied = false }
    override func inputsKnown(_ mark: Int) -> Bool { true }

    override func removeFromGraph() {
        myOutput.removeConstraint(self)
        satisfied = false
    }

    override func execute() {}
}

final class StayConstraint: UnaryConstraint {}

final class EditConstraint: UnaryConstraint {
    override func isInput() -> Bool { true }
}

class BinaryConstraint: Constraint {
    let v1: Variable
    let v2: Variable
    var direction = Direction.none

    // Subclasses add the constraint once their own fields are set.
    init(_ var1: Variable, _ var2: Variable, _ strength: Strength) {
        v1 = var1
        v2 = var2
        super.init(strength)
    }

    override func chooseMethod(_ mark: Int) {
        // The first two decisions are always overwritten by the third; the
        // original does this too.
        var direction = Direction.none
        if v1.mark == mark {
            direction = v2.mark != mark && strength.stronger(v2.walkStrength) ? .forward : .none
        }
        if v2.mark == mark {
            direction = v1.mark != mark && strength.stronger(v1.walkStrength) ? .backward : .none
        }
        if v1.walkStrength.weaker(v2.walkStrength) {
            direction = strength.stronger(v1.walkStrength) ? .backward : .none
        } else {
            direction = strength.stronger(v2.walkStrength) ? .forward : .backward
        }
        self.direction = direction
    }

    override func addToGraph() {
        v1.addConstraint(self)
        v2.addConstraint(self)
        direction = .none
    }

    override func isSatisfied() -> Bool { direction != .none }
    override func markInputs(_ mark: Int) { input().mark = mark }
    func input() -> Variable { direction == .forward ? v1 : v2 }
    override func output() -> Variable { direction == .forward ? v2 : v1 }

    override func recalculate() {
        let ihn = input()
        let out = output()
        out.walkStrength = strength.weakestOf(ihn.walkStrength)
        out.stay = ihn.stay
        if out.stay { execute() }
    }

    override func markUnsatisfied() { direction = .none }

    override func inputsKnown(_ mark: Int) -> Bool {
        let i = input()
        return i.mark == mark || i.stay || i.determinedBy == nil
    }

    override func removeFromGraph() {
        v1.removeConstraint(self)
        v2.removeConstraint(self)
        direction = .none
    }
}

final class ScaleConstraint: BinaryConstraint {
    let scale: Variable
    let offset: Variable

    init(_ src: Variable, _ scale: Variable, _ offset: Variable, _ dest: Variable,
         _ strength: Strength, _ planner: Planner) {
        self.scale = scale
        self.offset = offset
        super.init(src, dest, strength)
        addConstraint(planner)
    }

    override func addToGraph() {
        super.addToGraph()
        scale.addConstraint(self)
        offset.addConstraint(self)
    }

    override func removeFromGraph() {
        super.removeFromGraph()
        scale.removeConstraint(self)
        offset.removeConstraint(self)
    }

    override func markInputs(_ mark: Int) {
        super.markInputs(mark)
        scale.mark = mark
        offset.mark = mark
    }

    override func execute() {
        if direction == .forward {
            v2.value = v1.value * scale.value + offset.value
        } else {
            v1.value = (v2.value - offset.value) / scale.value
        }
    }

    override func recalculate() {
        let ihn = input()
        let out = output()
        out.walkStrength = strength.weakestOf(ihn.walkStrength)
        out.stay = ihn.stay && scale.stay && offset.stay
        if out.stay { execute() }
    }
}

final class EqualityConstraint: BinaryConstraint {
    init(_ var1: Variable, _ var2: Variable, _ strength: Strength, _ planner: Planner) {
        super.init(var1, var2, strength)
        addConstraint(planner)
    }

    override func execute() { output().value = input().value }
}

// MARK: - Planner

final class Planner {
    var currentMark = 0

    func newMark() -> Int {
        currentMark += 1
        return currentMark
    }

    func incrementalAdd(_ c: Constraint) {
        let mark = newMark()
        var overridden = c.satisfy(mark, self)
        while let o = overridden { overridden = o.satisfy(mark, self) }
    }

    func incrementalRemove(_ c: Constraint) {
        let out = c.output()
        c.markUnsatisfied()
        c.removeFromGraph()
        let unsatisfied = removePropagateFrom(out)
        var strength = Strength.required
        repeat {
            for u in unsatisfied where u.strength == strength {
                incrementalAdd(u)
            }
            strength = strength.nextWeaker
        } while strength != .weakest
    }

    func makePlan(_ sources: [Constraint]) -> [Constraint] {
        let mark = newMark()
        var plan: [Constraint] = []
        var todo = sources
        while let c = todo.popLast() {
            let out = c.output()
            if out.mark != mark && c.inputsKnown(mark) {
                plan.append(c)
                out.mark = mark
                addConstraintsConsumingTo(out, &todo)
            }
        }
        return plan
    }

    func extractPlanFromConstraints(_ constraints: [Constraint]) -> [Constraint] {
        makePlan(constraints.filter { $0.isInput() && $0.isSatisfied() })
    }

    /// Recomputes everything downstream of c; false if that reaches a variable
    /// already marked in this pass (a cycle).
    func addPropagate(_ c: Constraint, _ mark: Int) -> Bool {
        var todo = [c]
        while let d = todo.popLast() {
            let out = d.output()
            if out.mark == mark {
                incrementalRemove(c)
                return false
            }
            d.recalculate()
            addConstraintsConsumingTo(out, &todo)
        }
        return true
    }

    /// Resets everything downstream of out, returning the unsatisfied
    /// constraints it finds.
    func removePropagateFrom(_ out: Variable) -> [Constraint] {
        out.determinedBy = nil
        out.walkStrength = .weakest
        out.stay = true
        var unsatisfied: [Constraint] = []
        var todo = [out]
        while let v = todo.popLast() {
            for c in v.constraints where !c.isSatisfied() {
                unsatisfied.append(c)
            }
            let determining = v.determinedBy
            for c in v.constraints where c !== determining && c.isSatisfied() {
                c.recalculate()
                todo.append(c.output())
            }
        }
        return unsatisfied
    }

    func addConstraintsConsumingTo(_ v: Variable, _ coll: inout [Constraint]) {
        let determining = v.determinedBy
        for c in v.constraints where c !== determining && c.isSatisfied() {
            coll.append(c)
        }
    }
}

func executePlan(_ plan: [Constraint]) {
    for c in plan { c.execute() }
}

// MARK: - Tests

/// A chain of n equality constraints, edited from the first variable.
func chainTest(_ n: Int) -> Int {
    let planner = Planner()
    var failures = 0
    var prev: Variable? = nil, first: Variable? = nil, last: Variable? = nil
    for i in 0...n {
        let v = Variable()
        if let prev { _ = EqualityConstraint(prev, v, .required, planner) }
        if i == 0 { first = v }
        if i == n { last = v }
        prev = v
    }
    guard let first, let last else { fatalError("n >= 0") }
    _ = StayConstraint(last, .strongDefault, planner)
    let edit = EditConstraint(first, .preferred, planner)
    let plan = planner.extractPlanFromConstraints([edit])
    for i in 0..<100 {
        first.value = i
        executePlan(plan)
        if last.value != i { failures += 1 }
    }
    return failures
}

/// n scale constraints sharing one scale and offset, edited from either end.
func projectionTest(_ n: Int) -> Int {
    let planner = Planner()
    var failures = 0
    let scale = Variable(10)
    let offset = Variable(1000)
    var src: Variable? = nil, dst: Variable? = nil
    var dests: [Variable] = []
    for i in 0..<n {
        src = Variable(i)
        dst = Variable(i)
        dests.append(dst!)
        _ = StayConstraint(src!, .normal, planner)
        _ = ScaleConstraint(src!, scale, offset, dst!, .required, planner)
    }
    guard let src, let dst else { fatalError("n > 0") }
    change(planner, src, 17)
    if dst.value != 1170 { failures += 1 }
    change(planner, dst, 1050)
    if src.value != 5 { failures += 1 }
    change(planner, scale, 5)
    for i in 0..<(n - 1) where dests[i].value != i * 5 + 1000 {
        failures += 1
    }
    change(planner, offset, 2000)
    for i in 0..<(n - 1) where dests[i].value != i * 5 + 2000 {
        failures += 1
    }
    return failures
}

func change(_ planner: Planner, _ v: Variable, _ newValue: Int) {
    let edit = EditConstraint(v, .preferred, planner)
    let plan = planner.extractPlanFromConstraints([edit])
    for _ in 0..<10 {
        v.value = newValue
        executePlan(plan)
    }
    edit.destroyConstraint(planner)
}

// MARK: - Exports

@_expose(wasm, "bench_chain")
@_cdecl("bench_chain")
public func benchChain(_ iterations: Int32) -> Int32 {
    var failures = 0
    for _ in 0..<Int(iterations) { failures += chainTest(1048) }
    return Int32(failures)
}

@_expose(wasm, "bench_projection")
@_cdecl("bench_projection")
public func benchProjection(_ iterations: Int32) -> Int32 {
    var failures = 0
    for _ in 0..<Int(iterations) { failures += projectionTest(1048) }
    return Int32(failures)
}
