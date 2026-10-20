// DeltaBlue: the canonical incremental constraint solver (V8's deltablue.js,
// Dart's DeltaBlue.dart), written as idiomatic AssemblyScript: classes with
// subclassing and virtual methods, growable arrays, null for absent.
// Worklists are stacks.

const REQUIRED: i32 = 0;
const STRONG_PREFERRED: i32 = 1;
const PREFERRED: i32 = 2;
const STRONG_DEFAULT: i32 = 3;
const NORMAL: i32 = 4;
const WEAK_DEFAULT: i32 = 5;
const WEAKEST: i32 = 6;

function stronger(a: i32, b: i32): bool { return a < b; }
function weaker(a: i32, b: i32): bool { return a > b; }
function weakestOf(a: i32, b: i32): i32 { return weaker(a, b) ? a : b; }

// Canonical (and deliberately inverted) successor table.
function nextWeaker(strength: i32): i32 {
  switch (strength) {
    case REQUIRED: return WEAKEST;
    case STRONG_PREFERRED: return WEAK_DEFAULT;
    case PREFERRED: return NORMAL;
    case STRONG_DEFAULT: return STRONG_DEFAULT;
    case NORMAL: return PREFERRED;
    case WEAK_DEFAULT: return REQUIRED;
    default: throw new Error('no weaker strength');
  }
}

const NONE: i32 = 0;
const FORWARD: i32 = 1;
const BACKWARD: i32 = 2;

class Variable {
  value: i32;
  constraints: Array<Constraint> = [];
  determinedBy: Constraint | null = null;
  mark: i32 = 0;
  walkStrength: i32 = WEAKEST;
  stay: bool = true;

  constructor(value: i32 = 0) {
    this.value = value;
  }

  addConstraint(c: Constraint): void { this.constraints.push(c); }

  // Removes every occurrence of c, in place.
  removeConstraint(c: Constraint): void {
    const constraints = this.constraints;
    let kept = 0;
    for (let i = 0; i < constraints.length; i++) {
      const x = constraints[i];
      if (x !== c) {
        if (kept !== i) constraints[kept] = x;
        kept++;
      }
    }
    constraints.length = kept;
    if (this.determinedBy === c) this.determinedBy = null;
  }
}

abstract class Constraint {
  strength: i32;

  constructor(strength: i32) { this.strength = strength; }

  abstract addToGraph(): void;
  abstract removeFromGraph(): void;
  abstract chooseMethod(mark: i32): void;
  abstract isSatisfied(): bool;
  abstract markInputs(mark: i32): void;
  abstract output(): Variable;
  abstract recalculate(): void;
  abstract markUnsatisfied(): void;
  abstract inputsKnown(mark: i32): bool;
  abstract execute(): void;

  addConstraint(planner: Planner): void {
    this.addToGraph();
    planner.incrementalAdd(this);
  }

  satisfy(mark: i32, planner: Planner): Constraint | null {
    this.chooseMethod(mark);
    if (!this.isSatisfied()) {
      if (this.strength === REQUIRED) throw new Error('Could not satisfy a required constraint!');
      return null;
    }
    this.markInputs(mark);
    const out = this.output();
    const overridden = out.determinedBy;
    if (overridden !== null) overridden.markUnsatisfied();
    out.determinedBy = this;
    if (!planner.addPropagate(this, mark)) throw new Error('Cycle encountered');
    out.mark = mark;
    return overridden;
  }

  destroyConstraint(planner: Planner): void {
    if (this.isSatisfied()) planner.incrementalRemove(this);
    else this.removeFromGraph();
  }

  isInput(): bool { return false; }
}

class UnaryConstraint extends Constraint {
  myOutput: Variable;
  satisfied: bool;

  constructor(v: Variable, strength: i32, planner: Planner) {
    super(strength);
    this.myOutput = v;
    this.satisfied = false;
    this.addConstraint(planner);
  }

  addToGraph(): void {
    this.myOutput.addConstraint(this);
    this.satisfied = false;
  }

  chooseMethod(mark: i32): void {
    this.satisfied = this.myOutput.mark !== mark && stronger(this.strength, this.myOutput.walkStrength);
  }

  isSatisfied(): bool { return this.satisfied; }
  markInputs(mark: i32): void {}
  output(): Variable { return this.myOutput; }

  recalculate(): void {
    this.myOutput.walkStrength = this.strength;
    this.myOutput.stay = !this.isInput();
    if (this.myOutput.stay) this.execute();
  }

  markUnsatisfied(): void { this.satisfied = false; }
  inputsKnown(mark: i32): bool { return true; }

  removeFromGraph(): void {
    this.myOutput.removeConstraint(this);
    this.satisfied = false;
  }

  execute(): void {}
}

class StayConstraint extends UnaryConstraint {}

class EditConstraint extends UnaryConstraint {
  isInput(): bool { return true; }
}

abstract class BinaryConstraint extends Constraint {
  v1: Variable;
  v2: Variable;
  direction: i32;

  constructor(var1: Variable, var2: Variable, strength: i32) {
    super(strength);
    this.v1 = var1;
    this.v2 = var2;
    this.direction = NONE;
    // Subclasses add the constraint once their own fields are set.
  }

  chooseMethod(mark: i32): void {
    let direction = NONE;
    if (this.v1.mark === mark) {
      direction = this.v2.mark !== mark && stronger(this.strength, this.v2.walkStrength) ? FORWARD : NONE;
    }
    if (this.v2.mark === mark) {
      direction = this.v1.mark !== mark && stronger(this.strength, this.v1.walkStrength) ? BACKWARD : NONE;
    }
    if (weaker(this.v1.walkStrength, this.v2.walkStrength)) {
      direction = stronger(this.strength, this.v1.walkStrength) ? BACKWARD : NONE;
    } else {
      direction = stronger(this.strength, this.v2.walkStrength) ? FORWARD : BACKWARD;
    }
    this.direction = direction;
  }

  addToGraph(): void {
    this.v1.addConstraint(this);
    this.v2.addConstraint(this);
    this.direction = NONE;
  }

  isSatisfied(): bool { return this.direction !== NONE; }
  markInputs(mark: i32): void { this.input().mark = mark; }
  input(): Variable { return this.direction === FORWARD ? this.v1 : this.v2; }
  output(): Variable { return this.direction === FORWARD ? this.v2 : this.v1; }

  recalculate(): void {
    const ihn = this.input();
    const out = this.output();
    out.walkStrength = weakestOf(this.strength, ihn.walkStrength);
    out.stay = ihn.stay;
    if (out.stay) this.execute();
  }

  markUnsatisfied(): void { this.direction = NONE; }

  inputsKnown(mark: i32): bool {
    const i = this.input();
    return i.mark === mark || i.stay || i.determinedBy === null;
  }

  removeFromGraph(): void {
    this.v1.removeConstraint(this);
    this.v2.removeConstraint(this);
    this.direction = NONE;
  }
}

class ScaleConstraint extends BinaryConstraint {
  scale: Variable;
  offset: Variable;

  constructor(src: Variable, scale: Variable, offset: Variable, dest: Variable, strength: i32, planner: Planner) {
    super(src, dest, strength);
    this.scale = scale;
    this.offset = offset;
    this.addConstraint(planner);
  }

  addToGraph(): void {
    super.addToGraph();
    this.scale.addConstraint(this);
    this.offset.addConstraint(this);
  }

  removeFromGraph(): void {
    super.removeFromGraph();
    this.scale.removeConstraint(this);
    this.offset.removeConstraint(this);
  }

  markInputs(mark: i32): void {
    super.markInputs(mark);
    this.scale.mark = mark;
    this.offset.mark = mark;
  }

  execute(): void {
    if (this.direction === FORWARD) {
      this.v2.value = this.v1.value * this.scale.value + this.offset.value;
    } else {
      this.v1.value = (this.v2.value - this.offset.value) / this.scale.value;
    }
  }

  recalculate(): void {
    const ihn = this.input();
    const out = this.output();
    out.walkStrength = weakestOf(this.strength, ihn.walkStrength);
    out.stay = ihn.stay && this.scale.stay && this.offset.stay;
    if (out.stay) this.execute();
  }
}

class EqualityConstraint extends BinaryConstraint {
  constructor(var1: Variable, var2: Variable, strength: i32, planner: Planner) {
    super(var1, var2, strength);
    this.addConstraint(planner);
  }

  execute(): void { this.output().value = this.input().value; }
}

class Planner {
  currentMark: i32 = 0;

  newMark(): i32 { return ++this.currentMark; }

  incrementalAdd(c: Constraint): void {
    const mark = this.newMark();
    let overridden = c.satisfy(mark, this);
    while (overridden !== null) overridden = overridden.satisfy(mark, this);
  }

  incrementalRemove(c: Constraint): void {
    const out = c.output();
    c.markUnsatisfied();
    c.removeFromGraph();
    const unsatisfied = this.removePropagateFrom(out);
    let strength = REQUIRED;
    do {
      for (let i = 0; i < unsatisfied.length; i++) {
        const u = unsatisfied[i];
        if (u.strength === strength) this.incrementalAdd(u);
      }
      strength = nextWeaker(strength);
    } while (strength !== WEAKEST);
  }

  makePlan(sources: Array<Constraint>): Array<Constraint> {
    const mark = this.newMark();
    const plan: Array<Constraint> = [];
    const todo = sources;
    while (todo.length > 0) {
      const c = todo.pop();
      const out = c.output();
      if (out.mark !== mark && c.inputsKnown(mark)) {
        plan.push(c);
        out.mark = mark;
        this.addConstraintsConsumingTo(out, todo);
      }
    }
    return plan;
  }

  extractPlanFromConstraints(constraints: Array<Constraint>): Array<Constraint> {
    return this.makePlan(constraints.filter((c: Constraint) => c.isInput() && c.isSatisfied()));
  }

  addPropagate(c: Constraint, mark: i32): bool {
    const todo: Array<Constraint> = [c];
    while (todo.length > 0) {
      const d = todo.pop();
      const out = d.output();
      if (out.mark === mark) {
        this.incrementalRemove(c);
        return false;
      }
      d.recalculate();
      this.addConstraintsConsumingTo(out, todo);
    }
    return true;
  }

  removePropagateFrom(out: Variable): Array<Constraint> {
    out.determinedBy = null;
    out.walkStrength = WEAKEST;
    out.stay = true;
    const unsatisfied: Array<Constraint> = [];
    const todo: Array<Variable> = [out];
    while (todo.length > 0) {
      const v = todo.pop();
      for (let i = 0; i < v.constraints.length; i++) {
        const c = v.constraints[i];
        if (!c.isSatisfied()) unsatisfied.push(c);
      }
      const determining = v.determinedBy;
      for (let i = 0; i < v.constraints.length; i++) {
        const c = v.constraints[i];
        if (c !== determining && c.isSatisfied()) {
          c.recalculate();
          todo.push(c.output());
        }
      }
    }
    return unsatisfied;
  }

  addConstraintsConsumingTo(v: Variable, coll: Array<Constraint>): void {
    const determining = v.determinedBy;
    for (let i = 0; i < v.constraints.length; i++) {
      const c = v.constraints[i];
      if (c !== determining && c.isSatisfied()) coll.push(c);
    }
  }
}

function executePlan(plan: Array<Constraint>): void {
  for (let i = 0; i < plan.length; i++) plan[i].execute();
}

function chainTest(n: i32): i32 {
  const planner = new Planner();
  let failures = 0;
  let prev: Variable | null = null, first: Variable | null = null, last: Variable | null = null;
  for (let i = 0; i <= n; i++) {
    const v = new Variable();
    if (prev !== null) new EqualityConstraint(prev, v, REQUIRED, planner);
    if (i === 0) first = v;
    if (i === n) last = v;
    prev = v;
  }
  new StayConstraint(last!, STRONG_DEFAULT, planner);
  const edit = new EditConstraint(first!, PREFERRED, planner);
  const plan = planner.extractPlanFromConstraints([edit]);
  for (let i = 0; i < 100; i++) {
    first!.value = i;
    executePlan(plan);
    if (last!.value !== i) failures++;
  }
  return failures;
}

function projectionTest(n: i32): i32 {
  const planner = new Planner();
  let failures = 0;
  const scale = new Variable(10);
  const offset = new Variable(1000);
  let src: Variable | null = null, dst: Variable | null = null;
  const dests: Array<Variable> = [];
  for (let i = 0; i < n; i++) {
    src = new Variable(i);
    dst = new Variable(i);
    dests.push(dst);
    new StayConstraint(src, NORMAL, planner);
    new ScaleConstraint(src, scale, offset, dst, REQUIRED, planner);
  }
  change(planner, src!, 17);
  if (dst!.value !== 1170) failures++;
  change(planner, dst!, 1050);
  if (src!.value !== 5) failures++;
  change(planner, scale, 5);
  for (let i = 0; i < n - 1; i++) {
    if (dests[i].value !== i * 5 + 1000) failures++;
  }
  change(planner, offset, 2000);
  for (let i = 0; i < n - 1; i++) {
    if (dests[i].value !== i * 5 + 2000) failures++;
  }
  return failures;
}

function change(planner: Planner, v: Variable, newValue: i32): void {
  const edit = new EditConstraint(v, PREFERRED, planner);
  const plan = planner.extractPlanFromConstraints([edit]);
  for (let i = 0; i < 10; i++) {
    v.value = newValue;
    executePlan(plan);
  }
  edit.destroyConstraint(planner);
}

export function bench_chain(iterations: i32): i64 {
  let failures: i64 = 0;
  for (let i = 0; i < iterations; i++) failures += chainTest(1048);
  return failures;
}

export function bench_projection(iterations: i32): i64 {
  let failures: i64 = 0;
  for (let i = 0; i < iterations; i++) failures += projectionTest(1048);
  return failures;
}
