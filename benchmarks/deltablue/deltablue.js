// DeltaBlue: the canonical incremental constraint solver (V8's deltablue.js,
// Dart's DeltaBlue.dart), written as idiomatic JavaScript: classes with
// subclassing, growable arrays, null for absent. Worklists are stacks.

const REQUIRED = 0;
const STRONG_PREFERRED = 1;
const PREFERRED = 2;
const STRONG_DEFAULT = 3;
const NORMAL = 4;
const WEAK_DEFAULT = 5;
const WEAKEST = 6;

const stronger = (a, b) => a < b;
const weaker = (a, b) => a > b;
const weakestOf = (a, b) => (weaker(a, b) ? a : b);

// Canonical (and deliberately inverted) successor table.
function nextWeaker(strength) {
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

const NONE = 0;
const FORWARD = 1;
const BACKWARD = 2;

class Variable {
  constructor(value = 0) {
    this.value = value;
    this.constraints = [];
    this.determinedBy = null;
    this.mark = 0;
    this.walkStrength = WEAKEST;
    this.stay = true;
  }

  addConstraint(c) { this.constraints.push(c); }

  // Removes every occurrence of c, in place.
  removeConstraint(c) {
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

class Constraint {
  constructor(strength) { this.strength = strength; }

  addConstraint(planner) {
    this.addToGraph();
    planner.incrementalAdd(this);
  }

  satisfy(mark, planner) {
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

  destroyConstraint(planner) {
    if (this.isSatisfied()) planner.incrementalRemove(this);
    else this.removeFromGraph();
  }

  isInput() { return false; }
}

class UnaryConstraint extends Constraint {
  constructor(v, strength, planner) {
    super(strength);
    this.myOutput = v;
    this.satisfied = false;
    this.addConstraint(planner);
  }

  addToGraph() {
    this.myOutput.addConstraint(this);
    this.satisfied = false;
  }

  chooseMethod(mark) {
    this.satisfied = this.myOutput.mark !== mark && stronger(this.strength, this.myOutput.walkStrength);
  }

  isSatisfied() { return this.satisfied; }
  markInputs(mark) {}
  output() { return this.myOutput; }

  recalculate() {
    this.myOutput.walkStrength = this.strength;
    this.myOutput.stay = !this.isInput();
    if (this.myOutput.stay) this.execute();
  }

  markUnsatisfied() { this.satisfied = false; }
  inputsKnown() { return true; }

  removeFromGraph() {
    this.myOutput.removeConstraint(this);
    this.satisfied = false;
  }

  execute() {}
}

class StayConstraint extends UnaryConstraint {}

class EditConstraint extends UnaryConstraint {
  isInput() { return true; }
}

class BinaryConstraint extends Constraint {
  constructor(var1, var2, strength) {
    super(strength);
    this.v1 = var1;
    this.v2 = var2;
    this.direction = NONE;
    // Subclasses add the constraint once their own fields are set.
  }

  chooseMethod(mark) {
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

  addToGraph() {
    this.v1.addConstraint(this);
    this.v2.addConstraint(this);
    this.direction = NONE;
  }

  isSatisfied() { return this.direction !== NONE; }
  markInputs(mark) { this.input().mark = mark; }
  input() { return this.direction === FORWARD ? this.v1 : this.v2; }
  output() { return this.direction === FORWARD ? this.v2 : this.v1; }

  recalculate() {
    const ihn = this.input();
    const out = this.output();
    out.walkStrength = weakestOf(this.strength, ihn.walkStrength);
    out.stay = ihn.stay;
    if (out.stay) this.execute();
  }

  markUnsatisfied() { this.direction = NONE; }

  inputsKnown(mark) {
    const i = this.input();
    return i.mark === mark || i.stay || i.determinedBy === null;
  }

  removeFromGraph() {
    this.v1.removeConstraint(this);
    this.v2.removeConstraint(this);
    this.direction = NONE;
  }
}

class ScaleConstraint extends BinaryConstraint {
  constructor(src, scale, offset, dest, strength, planner) {
    super(src, dest, strength);
    this.scale = scale;
    this.offset = offset;
    this.addConstraint(planner);
  }

  addToGraph() {
    super.addToGraph();
    this.scale.addConstraint(this);
    this.offset.addConstraint(this);
  }

  removeFromGraph() {
    super.removeFromGraph();
    this.scale.removeConstraint(this);
    this.offset.removeConstraint(this);
  }

  markInputs(mark) {
    super.markInputs(mark);
    this.scale.mark = mark;
    this.offset.mark = mark;
  }

  execute() {
    if (this.direction === FORWARD) {
      this.v2.value = this.v1.value * this.scale.value + this.offset.value;
    } else {
      this.v1.value = Math.trunc((this.v2.value - this.offset.value) / this.scale.value);
    }
  }

  recalculate() {
    const ihn = this.input();
    const out = this.output();
    out.walkStrength = weakestOf(this.strength, ihn.walkStrength);
    out.stay = ihn.stay && this.scale.stay && this.offset.stay;
    if (out.stay) this.execute();
  }
}

class EqualityConstraint extends BinaryConstraint {
  constructor(var1, var2, strength, planner) {
    super(var1, var2, strength);
    this.addConstraint(planner);
  }

  execute() { this.output().value = this.input().value; }
}

class Planner {
  constructor() { this.currentMark = 0; }

  newMark() { return ++this.currentMark; }

  incrementalAdd(c) {
    const mark = this.newMark();
    let overridden = c.satisfy(mark, this);
    while (overridden !== null) overridden = overridden.satisfy(mark, this);
  }

  incrementalRemove(c) {
    const out = c.output();
    c.markUnsatisfied();
    c.removeFromGraph();
    const unsatisfied = this.removePropagateFrom(out);
    let strength = REQUIRED;
    do {
      for (const u of unsatisfied) {
        if (u.strength === strength) this.incrementalAdd(u);
      }
      strength = nextWeaker(strength);
    } while (strength !== WEAKEST);
  }

  makePlan(sources) {
    const mark = this.newMark();
    const plan = [];
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

  extractPlanFromConstraints(constraints) {
    return this.makePlan(constraints.filter((c) => c.isInput() && c.isSatisfied()));
  }

  addPropagate(c, mark) {
    const todo = [c];
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

  removePropagateFrom(out) {
    out.determinedBy = null;
    out.walkStrength = WEAKEST;
    out.stay = true;
    const unsatisfied = [];
    const todo = [out];
    while (todo.length > 0) {
      const v = todo.pop();
      for (const c of v.constraints) {
        if (!c.isSatisfied()) unsatisfied.push(c);
      }
      const determining = v.determinedBy;
      for (const c of v.constraints) {
        if (c !== determining && c.isSatisfied()) {
          c.recalculate();
          todo.push(c.output());
        }
      }
    }
    return unsatisfied;
  }

  addConstraintsConsumingTo(v, coll) {
    const determining = v.determinedBy;
    for (const c of v.constraints) {
      if (c !== determining && c.isSatisfied()) coll.push(c);
    }
  }
}

function executePlan(plan) {
  for (const c of plan) c.execute();
}

function chainTest(n) {
  const planner = new Planner();
  let failures = 0;
  let prev = null, first = null, last = null;
  for (let i = 0; i <= n; i++) {
    const v = new Variable();
    if (prev !== null) new EqualityConstraint(prev, v, REQUIRED, planner);
    if (i === 0) first = v;
    if (i === n) last = v;
    prev = v;
  }
  new StayConstraint(last, STRONG_DEFAULT, planner);
  const edit = new EditConstraint(first, PREFERRED, planner);
  const plan = planner.extractPlanFromConstraints([edit]);
  for (let i = 0; i < 100; i++) {
    first.value = i;
    executePlan(plan);
    if (last.value !== i) failures++;
  }
  return failures;
}

function projectionTest(n) {
  const planner = new Planner();
  let failures = 0;
  const scale = new Variable(10);
  const offset = new Variable(1000);
  let src = null, dst = null;
  const dests = [];
  for (let i = 0; i < n; i++) {
    src = new Variable(i);
    dst = new Variable(i);
    dests.push(dst);
    new StayConstraint(src, NORMAL, planner);
    new ScaleConstraint(src, scale, offset, dst, REQUIRED, planner);
  }
  change(planner, src, 17);
  if (dst.value !== 1170) failures++;
  change(planner, dst, 1050);
  if (src.value !== 5) failures++;
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

function change(planner, v, newValue) {
  const edit = new EditConstraint(v, PREFERRED, planner);
  const plan = planner.extractPlanFromConstraints([edit]);
  for (let i = 0; i < 10; i++) {
    v.value = newValue;
    executePlan(plan);
  }
  edit.destroyConstraint(planner);
}

export function benchChain(iterations) {
  let failures = 0;
  for (let i = 0; i < iterations; i++) failures += chainTest(1048);
  return failures;
}

export function benchProjection(iterations) {
  let failures = 0;
  for (let i = 0; i < iterations; i++) failures += projectionTest(1048);
  return failures;
}
