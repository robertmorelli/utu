// DeltaBlue: the canonical incremental constraint solver (V8's deltablue.js,
// Dart's DeltaBlue.dart), written as idiomatic Dart: an enum of strengths,
// abstract classes with subclassing, growable lists, nullable types for
// absent. Worklists are stacks. Compiled to WasmGC with dart2wasm; main()
// publishes bench_chain / bench_projection on globalThis.

import 'dart:js_interop';

enum Strength {
  required,
  strongPreferred,
  preferred,
  strongDefault,
  normal,
  weakDefault,
  weakest;

  bool stronger(Strength other) => index < other.index;
  bool weaker(Strength other) => index > other.index;
  Strength weakestOf(Strength other) => weaker(other) ? this : other;

  // Canonical (and deliberately inverted) successor table.
  Strength get nextWeaker => switch (this) {
        required => weakest,
        strongPreferred => weakDefault,
        preferred => normal,
        strongDefault => strongDefault,
        normal => preferred,
        weakDefault => required,
        weakest => throw StateError('no weaker strength'),
      };
}

enum Direction { none, forward, backward }

class Variable {
  int value;
  final List<Constraint> constraints = [];
  Constraint? determinedBy;
  int mark = 0;
  Strength walkStrength = Strength.weakest;
  bool stay = true;

  Variable([this.value = 0]);

  void addConstraint(Constraint c) => constraints.add(c);

  // Removes every occurrence of c, in place.
  void removeConstraint(Constraint c) {
    final constraints = this.constraints;
    var kept = 0;
    for (var i = 0; i < constraints.length; i++) {
      final x = constraints[i];
      if (!identical(x, c)) {
        if (kept != i) constraints[kept] = x;
        kept++;
      }
    }
    constraints.length = kept;
    if (identical(determinedBy, c)) determinedBy = null;
  }
}

abstract class Constraint {
  final Strength strength;

  Constraint(this.strength);

  bool isSatisfied();
  void markUnsatisfied();
  void addToGraph();
  void removeFromGraph();
  void chooseMethod(int mark);
  void markInputs(int mark);
  bool inputsKnown(int mark);
  Variable output();
  void execute();
  void recalculate();

  void addConstraint(Planner planner) {
    addToGraph();
    planner.incrementalAdd(this);
  }

  Constraint? satisfy(int mark, Planner planner) {
    chooseMethod(mark);
    if (!isSatisfied()) {
      if (strength == Strength.required) {
        throw StateError('Could not satisfy a required constraint!');
      }
      return null;
    }
    markInputs(mark);
    final out = output();
    final overridden = out.determinedBy;
    overridden?.markUnsatisfied();
    out.determinedBy = this;
    if (!planner.addPropagate(this, mark)) throw StateError('Cycle encountered');
    out.mark = mark;
    return overridden;
  }

  void destroyConstraint(Planner planner) {
    if (isSatisfied()) {
      planner.incrementalRemove(this);
    } else {
      removeFromGraph();
    }
  }

  bool isInput() => false;
}

abstract class UnaryConstraint extends Constraint {
  final Variable myOutput;
  bool satisfied = false;

  UnaryConstraint(this.myOutput, super.strength, Planner planner) {
    addConstraint(planner);
  }

  @override
  void addToGraph() {
    myOutput.addConstraint(this);
    satisfied = false;
  }

  @override
  void chooseMethod(int mark) {
    satisfied = myOutput.mark != mark && strength.stronger(myOutput.walkStrength);
  }

  @override
  bool isSatisfied() => satisfied;

  @override
  void markInputs(int mark) {}

  @override
  Variable output() => myOutput;

  @override
  void recalculate() {
    myOutput.walkStrength = strength;
    myOutput.stay = !isInput();
    if (myOutput.stay) execute();
  }

  @override
  void markUnsatisfied() {
    satisfied = false;
  }

  @override
  bool inputsKnown(int mark) => true;

  @override
  void removeFromGraph() {
    myOutput.removeConstraint(this);
    satisfied = false;
  }

  @override
  void execute() {}
}

class StayConstraint extends UnaryConstraint {
  StayConstraint(super.v, super.strength, super.planner);
}

class EditConstraint extends UnaryConstraint {
  EditConstraint(super.v, super.strength, super.planner);

  @override
  bool isInput() => true;
}

abstract class BinaryConstraint extends Constraint {
  final Variable v1;
  final Variable v2;
  Direction direction = Direction.none;

  // Subclasses add the constraint once their own fields are set.
  BinaryConstraint(this.v1, this.v2, super.strength);

  @override
  void chooseMethod(int mark) {
    var direction = Direction.none;
    if (v1.mark == mark) {
      direction = v2.mark != mark && strength.stronger(v2.walkStrength)
          ? Direction.forward
          : Direction.none;
    }
    if (v2.mark == mark) {
      direction = v1.mark != mark && strength.stronger(v1.walkStrength)
          ? Direction.backward
          : Direction.none;
    }
    if (v1.walkStrength.weaker(v2.walkStrength)) {
      direction = strength.stronger(v1.walkStrength) ? Direction.backward : Direction.none;
    } else {
      direction = strength.stronger(v2.walkStrength) ? Direction.forward : Direction.backward;
    }
    this.direction = direction;
  }

  @override
  void addToGraph() {
    v1.addConstraint(this);
    v2.addConstraint(this);
    direction = Direction.none;
  }

  @override
  bool isSatisfied() => direction != Direction.none;

  @override
  void markInputs(int mark) {
    input().mark = mark;
  }

  Variable input() => direction == Direction.forward ? v1 : v2;

  @override
  Variable output() => direction == Direction.forward ? v2 : v1;

  @override
  void recalculate() {
    final ihn = input();
    final out = output();
    out.walkStrength = strength.weakestOf(ihn.walkStrength);
    out.stay = ihn.stay;
    if (out.stay) execute();
  }

  @override
  void markUnsatisfied() {
    direction = Direction.none;
  }

  @override
  bool inputsKnown(int mark) {
    final i = input();
    return i.mark == mark || i.stay || i.determinedBy == null;
  }

  @override
  void removeFromGraph() {
    v1.removeConstraint(this);
    v2.removeConstraint(this);
    direction = Direction.none;
  }
}

class ScaleConstraint extends BinaryConstraint {
  final Variable scale;
  final Variable offset;

  ScaleConstraint(Variable src, this.scale, this.offset, Variable dest, Strength strength,
      Planner planner)
      : super(src, dest, strength) {
    addConstraint(planner);
  }

  @override
  void addToGraph() {
    super.addToGraph();
    scale.addConstraint(this);
    offset.addConstraint(this);
  }

  @override
  void removeFromGraph() {
    super.removeFromGraph();
    scale.removeConstraint(this);
    offset.removeConstraint(this);
  }

  @override
  void markInputs(int mark) {
    super.markInputs(mark);
    scale.mark = mark;
    offset.mark = mark;
  }

  @override
  void execute() {
    if (direction == Direction.forward) {
      v2.value = v1.value * scale.value + offset.value;
    } else {
      v1.value = (v2.value - offset.value) ~/ scale.value;
    }
  }

  @override
  void recalculate() {
    final ihn = input();
    final out = output();
    out.walkStrength = strength.weakestOf(ihn.walkStrength);
    out.stay = ihn.stay && scale.stay && offset.stay;
    if (out.stay) execute();
  }
}

class EqualityConstraint extends BinaryConstraint {
  EqualityConstraint(super.var1, super.var2, super.strength, Planner planner) {
    addConstraint(planner);
  }

  @override
  void execute() {
    output().value = input().value;
  }
}

class Planner {
  int currentMark = 0;

  int newMark() => ++currentMark;

  void incrementalAdd(Constraint c) {
    final mark = newMark();
    var overridden = c.satisfy(mark, this);
    while (overridden != null) {
      overridden = overridden.satisfy(mark, this);
    }
  }

  void incrementalRemove(Constraint c) {
    final out = c.output();
    c.markUnsatisfied();
    c.removeFromGraph();
    final unsatisfied = removePropagateFrom(out);
    var strength = Strength.required;
    do {
      for (final u in unsatisfied) {
        if (u.strength == strength) incrementalAdd(u);
      }
      strength = strength.nextWeaker;
    } while (strength != Strength.weakest);
  }

  List<Constraint> makePlan(List<Constraint> sources) {
    final mark = newMark();
    final plan = <Constraint>[];
    final todo = sources;
    while (todo.isNotEmpty) {
      final c = todo.removeLast();
      final out = c.output();
      if (out.mark != mark && c.inputsKnown(mark)) {
        plan.add(c);
        out.mark = mark;
        addConstraintsConsumingTo(out, todo);
      }
    }
    return plan;
  }

  List<Constraint> extractPlanFromConstraints(List<Constraint> constraints) =>
      makePlan(constraints.where((c) => c.isInput() && c.isSatisfied()).toList());

  bool addPropagate(Constraint c, int mark) {
    final todo = [c];
    while (todo.isNotEmpty) {
      final d = todo.removeLast();
      final out = d.output();
      if (out.mark == mark) {
        incrementalRemove(c);
        return false;
      }
      d.recalculate();
      addConstraintsConsumingTo(out, todo);
    }
    return true;
  }

  List<Constraint> removePropagateFrom(Variable out) {
    out.determinedBy = null;
    out.walkStrength = Strength.weakest;
    out.stay = true;
    final unsatisfied = <Constraint>[];
    final todo = [out];
    while (todo.isNotEmpty) {
      final v = todo.removeLast();
      for (final c in v.constraints) {
        if (!c.isSatisfied()) unsatisfied.add(c);
      }
      final determining = v.determinedBy;
      for (final c in v.constraints) {
        if (!identical(c, determining) && c.isSatisfied()) {
          c.recalculate();
          todo.add(c.output());
        }
      }
    }
    return unsatisfied;
  }

  void addConstraintsConsumingTo(Variable v, List<Constraint> coll) {
    final determining = v.determinedBy;
    for (final c in v.constraints) {
      if (!identical(c, determining) && c.isSatisfied()) coll.add(c);
    }
  }
}

void executePlan(List<Constraint> plan) {
  for (final c in plan) {
    c.execute();
  }
}

int chainTest(int n) {
  final planner = Planner();
  var failures = 0;
  Variable? prev, first, last;
  for (var i = 0; i <= n; i++) {
    final v = Variable();
    if (prev != null) EqualityConstraint(prev, v, Strength.required, planner);
    if (i == 0) first = v;
    if (i == n) last = v;
    prev = v;
  }
  StayConstraint(last!, Strength.strongDefault, planner);
  final edit = EditConstraint(first!, Strength.preferred, planner);
  final plan = planner.extractPlanFromConstraints([edit]);
  for (var i = 0; i < 100; i++) {
    first.value = i;
    executePlan(plan);
    if (last.value != i) failures++;
  }
  return failures;
}

int projectionTest(int n) {
  final planner = Planner();
  var failures = 0;
  final scale = Variable(10);
  final offset = Variable(1000);
  Variable? src, dst;
  final dests = <Variable>[];
  for (var i = 0; i < n; i++) {
    src = Variable(i);
    dst = Variable(i);
    dests.add(dst);
    StayConstraint(src, Strength.normal, planner);
    ScaleConstraint(src, scale, offset, dst, Strength.required, planner);
  }
  change(planner, src!, 17);
  if (dst!.value != 1170) failures++;
  change(planner, dst, 1050);
  if (src.value != 5) failures++;
  change(planner, scale, 5);
  for (var i = 0; i < n - 1; i++) {
    if (dests[i].value != i * 5 + 1000) failures++;
  }
  change(planner, offset, 2000);
  for (var i = 0; i < n - 1; i++) {
    if (dests[i].value != i * 5 + 2000) failures++;
  }
  return failures;
}

void change(Planner planner, Variable v, int newValue) {
  final edit = EditConstraint(v, Strength.preferred, planner);
  final plan = planner.extractPlanFromConstraints([edit]);
  for (var i = 0; i < 10; i++) {
    v.value = newValue;
    executePlan(plan);
  }
  edit.destroyConstraint(planner);
}

int benchChain(int iterations) {
  var failures = 0;
  for (var i = 0; i < iterations; i++) {
    failures += chainTest(1048);
  }
  return failures;
}

int benchProjection(int iterations) {
  var failures = 0;
  for (var i = 0; i < iterations; i++) {
    failures += projectionTest(1048);
  }
  return failures;
}

@JS('bench_chain')
external set _benchChain(JSFunction f);

@JS('bench_projection')
external set _benchProjection(JSFunction f);

void main() {
  _benchChain = benchChain.toJS;
  _benchProjection = benchProjection.toJS;
}
