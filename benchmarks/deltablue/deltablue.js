const REQUIRED = 0;
const PREFERRED = 2;
const STRONG_DEFAULT = 3;
const NORMAL = 4;
const WEAKEST = 6;
const NONE = 0;
const FORWARD = 1;
const BACKWARD = -1;

const stronger = (a, b) => a < b;
const weaker = (a, b) => a > b;
const weakestOf = (a, b) => a > b ? a : b;
function nextWeaker(strength) {
  return [WEAKEST, 5, NORMAL, STRONG_DEFAULT, PREFERRED, REQUIRED, WEAKEST][strength] ?? WEAKEST;
}

// Mirror utu/Rust's fixed-capacity list and O(n) pop-front directly.
class FixedList {
  constructor(capacity) { this.items = new Array(capacity).fill(null); this.count = 0; }
  append(value) {
    if (this.count >= this.items.length) throw new Error('DeltaBlue list capacity exceeded');
    this.items[this.count++] = value;
  }
  popFront() {
    const value = this.items[0];
    for (let i = 0; i < this.count - 1; i++) this.items[i] = this.items[i + 1];
    this.count--;
    return value;
  }
  copy(capacity) {
    const result = new FixedList(capacity);
    for (let i = 0; i < this.count; i++) result.append(this.items[i]);
    return result;
  }
}

class Variable {
  constructor(value = 0, constraintCapacity = 1) {
    this.value = value;
    this.constraints = new FixedList(constraintCapacity);
    this.determinedBy = null;
    this.mark = 0;
    this.walkStrength = WEAKEST;
    this.stay = true;
  }
  addConstraint(constraint) { this.constraints.append(constraint); }
  removeConstraint(constraint) {
    let found = -1;
    for (let i = 0; i < this.constraints.count; i++) {
      if (found === -1 && this.constraints.items[i] === constraint) found = i;
    }
    if (found !== -1) {
      for (let i = found; i < this.constraints.count - 1; i++) this.constraints.items[i] = this.constraints.items[i + 1];
      this.constraints.count--;
    }
    if (this.determinedBy === constraint) this.determinedBy = null;
  }
  addConstraintsConsumingTo(collection) {
    for (let i = 0; i < this.constraints.count; i++) {
      const constraint = this.constraints.items[i];
      if (constraint !== this.determinedBy && constraint.isSatisfied()) collection.append(constraint);
    }
  }
}

class Constraint {
  addConstraint(planner) { this.addToGraph(); planner.incrementalAdd(this); return this; }
  satisfy(planner, mark) {
    this.chooseMethod(mark);
    if (!this.isSatisfied()) {
      if (this.strength === REQUIRED) throw new Error('required constraint cannot be satisfied');
      return null;
    }
    this.markInputs(mark);
    const out = this.output();
    const overridden = out.determinedBy;
    if (overridden) overridden.markUnsatisfied();
    out.determinedBy = this;
    if (!planner.addPropagate(this, mark)) throw new Error('cycle encountered');
    out.mark = mark;
    return overridden;
  }
  destroy(planner) {
    if (this.isSatisfied()) planner.incrementalRemove(this);
    else this.removeFromGraph();
  }
}

class UnaryConstraint extends Constraint {
  constructor(output, strength) { super(); this.out = output; this.strength = strength; this.satisfied = false; }
  addToGraph() { this.out.addConstraint(this); this.satisfied = false; }
  removeFromGraph() { this.out.removeConstraint(this); this.satisfied = false; }
  chooseMethod(mark) { this.satisfied = this.out.mark !== mark && stronger(this.strength, this.out.walkStrength); }
  isSatisfied() { return this.satisfied; }
  markInputs() {}
  output() { return this.out; }
  recalculate() { this.out.walkStrength = this.strength; this.out.stay = !this.isInput(); if (this.out.stay) this.execute(); }
  markUnsatisfied() { this.satisfied = false; }
  inputsKnown() { return true; }
  execute() {}
}
class StayConstraint extends UnaryConstraint { isInput() { return false; } }
class EditConstraint extends UnaryConstraint { isInput() { return true; } }

class BinaryConstraint extends Constraint {
  constructor(v1, v2, strength) { super(); this.v1 = v1; this.v2 = v2; this.strength = strength; this.direction = NONE; }
  addToGraph() { this.v1.addConstraint(this); this.v2.addConstraint(this); this.direction = NONE; }
  removeFromGraph() { this.v1.removeConstraint(this); this.v2.removeConstraint(this); this.direction = NONE; }
  chooseMethod(mark) {
    let choice = NONE;
    if (this.v1.mark === mark) {
      if (this.v2.mark !== mark) choice = stronger(this.strength, this.v2.walkStrength) ? FORWARD : BACKWARD;
      else choice = BACKWARD;
    }
    if (this.v2.mark === mark) {
      if (this.v1.mark !== mark) choice = stronger(this.strength, this.v1.walkStrength) ? BACKWARD : NONE;
      else choice = NONE;
    }
    if (weaker(this.v1.walkStrength, this.v2.walkStrength)) {
      choice = stronger(this.strength, this.v1.walkStrength) ? BACKWARD : NONE;
    } else {
      choice = stronger(this.strength, this.v2.walkStrength) ? FORWARD : BACKWARD;
    }
    this.direction = choice;
  }
  isSatisfied() { return this.direction !== NONE; }
  markInputs(mark) { this.input().mark = mark; }
  input() { return this.direction === FORWARD ? this.v1 : this.v2; }
  output() { return this.direction === FORWARD ? this.v2 : this.v1; }
  recalculate() {
    const input = this.input(), output = this.output();
    output.walkStrength = weakestOf(this.strength, input.walkStrength);
    output.stay = input.stay;
    if (output.stay) this.execute();
  }
  markUnsatisfied() { this.direction = NONE; }
  inputsKnown(mark) { const input = this.input(); return input.mark === mark || input.stay || input.determinedBy === null; }
}
class EqualityConstraint extends BinaryConstraint { execute() { this.output().value = this.input().value; } isInput() { return false; } }

class ScaleConstraint extends BinaryConstraint {
  constructor(src, scale, offset, dest, strength) {
    super(src, dest, strength); this.scale = scale; this.offset = offset;
  }
  addToGraph() { super.addToGraph(); this.scale.addConstraint(this); this.offset.addConstraint(this); }
  removeFromGraph() { super.removeFromGraph(); this.scale.removeConstraint(this); this.offset.removeConstraint(this); }
  markInputs(mark) { super.markInputs(mark); this.scale.mark = mark; this.offset.mark = mark; }
  execute() {
    if (this.direction === FORWARD) this.v2.value = this.v1.value * this.scale.value + this.offset.value;
    else this.v1.value = (this.v2.value - this.offset.value) / this.scale.value;
  }
  recalculate() {
    const input = this.input(), output = this.output();
    output.walkStrength = weakestOf(this.strength, input.walkStrength);
    output.stay = input.stay && this.scale.stay && this.offset.stay;
    if (output.stay) this.execute();
  }
}

class Planner {
  constructor(variableCapacity, constraintCapacity) {
    this.currentMark = 0;
    this.variableCapacity = variableCapacity;
    this.constraintCapacity = constraintCapacity;
  }
  newMark() { return ++this.currentMark; }
  incrementalAdd(constraint) {
    const mark = this.newMark();
    let overridden = constraint.satisfy(this, mark);
    while (overridden) overridden = overridden.satisfy(this, mark);
  }
  incrementalRemove(constraint) {
    const out = constraint.output();
    constraint.markUnsatisfied();
    constraint.removeFromGraph();
    const unsatisfied = this.removePropagateFrom(out);
    let strength = REQUIRED;
    do {
      for (let i = 0; i < unsatisfied.count; i++) {
        const current = unsatisfied.items[i];
        if (current.strength === strength) this.incrementalAdd(current);
        strength = nextWeaker(strength);
      }
    } while (strength !== WEAKEST);
  }
  addPropagate(constraint, mark) {
    const todo = new FixedList(this.constraintCapacity);
    todo.append(constraint);
    while (todo.count > 0) {
      const current = todo.popFront();
      if (current.output().mark === mark) { this.incrementalRemove(constraint); return false; }
      current.recalculate();
      current.output().addConstraintsConsumingTo(todo);
    }
    return true;
  }
  removePropagateFrom(out) {
    out.determinedBy = null; out.walkStrength = WEAKEST; out.stay = true;
    const unsatisfied = new FixedList(this.constraintCapacity);
    const todo = new FixedList(this.variableCapacity);
    todo.append(out);
    while (todo.count > 0) {
      const variable = todo.popFront();
      const determining = variable.determinedBy;
      for (let i = 0; i < variable.constraints.count; i++) {
        const constraint = variable.constraints.items[i];
        if (!constraint.isSatisfied()) unsatisfied.append(constraint);
      }
      for (let i = 0; i < variable.constraints.count; i++) {
        const constraint = variable.constraints.items[i];
        if (constraint !== determining && constraint.isSatisfied()) {
          constraint.recalculate(); todo.append(constraint.output());
        }
      }
    }
    return unsatisfied;
  }
  makePlan(sources) {
    const mark = this.newMark();
    const plan = new FixedList(this.constraintCapacity);
    const todo = sources.copy(this.constraintCapacity);
    while (todo.count > 0) {
      const constraint = todo.popFront(), out = constraint.output();
      if (out.mark !== mark && constraint.inputsKnown(mark)) {
        plan.append(constraint); out.mark = mark; out.addConstraintsConsumingTo(todo);
      }
    }
    return plan;
  }
  extractPlanFromConstraints(constraints) {
    const sources = new FixedList(this.constraintCapacity);
    for (let i = 0; i < constraints.count; i++) {
      const constraint = constraints.items[i];
      if (constraint.isInput() && constraint.isSatisfied()) sources.append(constraint);
    }
    return this.makePlan(sources);
  }
}

function planExecute(plan) { for (let i = 0; i < plan.count; i++) plan.items[i].execute(); }
function change(planner, variable, value) {
  const edit = new EditConstraint(variable, PREFERRED).addConstraint(planner);
  const edits = new FixedList(1); edits.append(edit);
  const plan = planner.extractPlanFromConstraints(edits);
  for (let i = 0; i < 10; i++) { variable.value = value; planExecute(plan); }
  edit.destroy(planner);
}

function chainTest(n) {
  const planner = new Planner(n + 4, n + 4);
  let prev = null, first = null, last = null;
  for (let i = 0; i <= n; i++) {
    const variable = new Variable(0, 2);
    if (prev) new EqualityConstraint(prev, variable, REQUIRED).addConstraint(planner);
    if (i === 0) first = variable;
    if (i === n) last = variable;
    prev = variable;
  }
  new StayConstraint(last, STRONG_DEFAULT).addConstraint(planner);
  const edit = new EditConstraint(first, PREFERRED).addConstraint(planner);
  const edits = new FixedList(1); edits.append(edit);
  const plan = planner.extractPlanFromConstraints(edits);
  let failures = 0;
  for (let i = 0; i < 100; i++) { first.value = i; planExecute(plan); if (last.value !== i) failures++; }
  return failures;
}

function projectionTest(n) {
  const planner = new Planner(n * 2 + 8, n * 2 + 8);
  const scale = new Variable(10, n + 1), offset = new Variable(1000, n + 1);
  const dummy = new Variable(0, 1), dests = new Array(n).fill(dummy);
  let src = dummy, dst = dummy;
  for (let i = 0; i < n; i++) {
    src = new Variable(i, 3); dst = new Variable(i, 2); dests[i] = dst;
    new StayConstraint(src, NORMAL).addConstraint(planner);
    new ScaleConstraint(src, scale, offset, dst, REQUIRED).addConstraint(planner);
  }
  let failures = 0;
  change(planner, src, 17); if (dst.value !== 1170) failures++;
  change(planner, dst, 1050); if (src.value !== 5) failures++;
  change(planner, scale, 5); for (let i = 0; i < n - 1; i++) if (dests[i].value !== i * 5 + 1000) failures++;
  change(planner, offset, 2000); for (let i = 0; i < n - 1; i++) if (dests[i].value !== i * 5 + 2000) failures++;
  return failures;
}

export function benchChain(iterations) { let sink = 0; for (let i = 0; i < iterations; i++) sink += chainTest(1048); return sink; }
export function benchProjection(iterations) { let sink = 0; for (let i = 0; i < iterations; i++) sink += projectionTest(1048); return sink; }
