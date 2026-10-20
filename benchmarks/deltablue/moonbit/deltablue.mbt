// DeltaBlue, the incremental constraint solver (V8's `deltablue.js` / Dart's
// `DeltaBlue.dart`), in idiomatic MoonBit.
//
// Variables and constraints are GC structs with mutable fields that form a
// shared object graph: a variable lists the constraints on it in an `Array`,
// and a constraint holds the variables it relates. MoonBit has no subclassing,
// so the four constraint kinds are one enum (as in the Rust and utu ports);
// constraint equality is identity (`physical_equal`). Worklists are `Array`
// stacks. Absent values are `T?`.

// ---------------------------------------------------------------------------
// Strength

///|
/// StrongPreferred is in the strength table, but no test uses it.
#warnings("-unused_constructor")
priv enum Strength {
  Required
  StrongPreferred
  Preferred
  StrongDefault
  Normal
  WeakDefault
  Weakest
} derive(Eq, Compare)

///|
fn Strength::stronger(self : Strength, other : Strength) -> Bool {
  self < other
}

///|
fn Strength::weaker(self : Strength, other : Strength) -> Bool {
  self > other
}

///|
fn Strength::weakest_of(self : Strength, other : Strength) -> Strength {
  if self.weaker(other) {
    self
  } else {
    other
  }
}

///|
/// The original's table, inverted on purpose: Required is followed by
/// Weakest, so `incremental_remove` only ever re-adds required constraints.
fn Strength::next_weaker(self : Strength) -> Strength {
  match self {
    Required => Weakest
    StrongPreferred => WeakDefault
    Preferred => Normal
    StrongDefault => StrongDefault
    Normal => Preferred
    WeakDefault => Required
    Weakest => abort("Weakest has no weaker strength")
  }
}

// ---------------------------------------------------------------------------
// Variable

///|
priv struct Variable {
  mut value : Int
  constraints : Array[Constraint]
  mut determined_by : Constraint?
  mut mark : Int
  mut walk_strength : Strength
  mut stay : Bool
}

///|
fn Variable::new(value : Int) -> Variable {
  {
    value,
    constraints: [],
    determined_by: None,
    mark: 0,
    walk_strength: Weakest,
    stay: true,
  }
}

///|
fn Variable::add_constraint(self : Variable, c : Constraint) -> Unit {
  self.constraints.push(c)
}

///|
/// Removes every occurrence of c, in place.
fn Variable::remove_constraint(self : Variable, c : Constraint) -> Unit {
  self.constraints.retain(x => !physical_equal(x, c))
  if self.determined_by is Some(d) && physical_equal(d, c) {
    self.determined_by = None
  }
}

///|
/// Pushes the satisfied constraints that consume this variable, i.e. all
/// satisfied ones except the one that determines it.
fn Variable::push_consumers(self : Variable, into : Array[Constraint]) -> Unit {
  let determining = self.determined_by
  for c in self.constraints {
    if !is_constraint(determining, c) && c.is_satisfied() {
      into.push(c)
    }
  }
}

///|
/// Whether `maybe` is the constraint `c` (by identity).
fn is_constraint(maybe : Constraint?, c : Constraint) -> Bool {
  match maybe {
    Some(d) => physical_equal(d, c)
    None => false
  }
}

// ---------------------------------------------------------------------------
// Constraint

///|
priv enum Direction {
  NoDirection
  Forward
  Backward
} derive(Eq)

///|
priv enum UnaryRole {
  Stay
  Edit
} derive(Eq)

///|
priv enum BinaryOp {
  Equality
  /// `v2 = v1 * scale + offset`
  Scale(scale~ : Variable, offset~ : Variable)
}

///|
priv struct Unary {
  output : Variable
  mut satisfied : Bool
  role : UnaryRole
}

///|
priv struct Binary {
  v1 : Variable
  v2 : Variable
  mut direction : Direction
  op : BinaryOp
}

///|
priv enum Kind {
  Unary(Unary)
  Binary(Binary)
}

///|
priv struct Constraint {
  strength : Strength
  kind : Kind
}

///|
/// Creates a constraint and adds it to the graph and the plan.
fn Constraint::new(
  strength : Strength,
  kind : Kind,
  planner : Planner,
) -> Constraint {
  let c = { strength, kind }
  c.add_to_graph()
  planner.incremental_add(c)
  c
}

///|
fn Constraint::stay(
  v : Variable,
  strength : Strength,
  planner : Planner,
) -> Constraint {
  Constraint::unary(v, strength, Stay, planner)
}

///|
fn Constraint::edit(
  v : Variable,
  strength : Strength,
  planner : Planner,
) -> Constraint {
  Constraint::unary(v, strength, Edit, planner)
}

///|
fn Constraint::unary(
  v : Variable,
  strength : Strength,
  role : UnaryRole,
  planner : Planner,
) -> Constraint {
  Constraint::new(strength, Unary({ output: v, satisfied: false, role }), planner)
}

///|
fn Constraint::equality(
  v1 : Variable,
  v2 : Variable,
  strength : Strength,
  planner : Planner,
) -> Constraint {
  Constraint::binary(v1, v2, Equality, strength, planner)
}

///|
fn Constraint::scale(
  src : Variable,
  scale : Variable,
  offset : Variable,
  dst : Variable,
  strength : Strength,
  planner : Planner,
) -> Constraint {
  Constraint::binary(src, dst, Scale(scale~, offset~), strength, planner)
}

///|
fn Constraint::binary(
  v1 : Variable,
  v2 : Variable,
  op : BinaryOp,
  strength : Strength,
  planner : Planner,
) -> Constraint {
  Constraint::new(
    strength,
    Binary({ v1, v2, direction: NoDirection, op }),
    planner,
  )
}

///|
fn Constraint::add_to_graph(self : Constraint) -> Unit {
  match self.kind {
    Unary(u) => {
      u.output.add_constraint(self)
      u.satisfied = false
    }
    Binary(b) => {
      b.v1.add_constraint(self)
      b.v2.add_constraint(self)
      b.direction = NoDirection
      if b.op is Scale(scale~, offset~) {
        scale.add_constraint(self)
        offset.add_constraint(self)
      }
    }
  }
}

///|
fn Constraint::remove_from_graph(self : Constraint) -> Unit {
  match self.kind {
    Unary(u) => {
      u.output.remove_constraint(self)
      u.satisfied = false
    }
    Binary(b) => {
      b.v1.remove_constraint(self)
      b.v2.remove_constraint(self)
      b.direction = NoDirection
      if b.op is Scale(scale~, offset~) {
        scale.remove_constraint(self)
        offset.remove_constraint(self)
      }
    }
  }
}

///|
/// Decides whether (unary) or in which direction (binary) to satisfy this
/// constraint, given the variables already marked in this pass.
fn Constraint::choose_method(self : Constraint, mark : Int) -> Unit {
  let strength = self.strength
  match self.kind {
    Unary(u) =>
      u.satisfied = u.output.mark != mark &&
        strength.stronger(u.output.walk_strength)
    Binary(b) => {
      let v1 = b.v1
      let v2 = b.v2
      // The first two decisions are always overwritten by the third; the
      // original does this too.
      let mut chosen = NoDirection
      if v1.mark == mark {
        chosen = if v2.mark != mark && strength.stronger(v2.walk_strength) {
          Forward
        } else {
          NoDirection
        }
      }
      if v2.mark == mark {
        chosen = if v1.mark != mark && strength.stronger(v1.walk_strength) {
          Backward
        } else {
          NoDirection
        }
      }
      chosen = if v1.walk_strength.weaker(v2.walk_strength) {
        if strength.stronger(v1.walk_strength) {
          Backward
        } else {
          NoDirection
        }
      } else if strength.stronger(v2.walk_strength) {
        Forward
      } else {
        Backward
      }
      b.direction = chosen
    }
  }
}

///|
fn Constraint::is_satisfied(self : Constraint) -> Bool {
  match self.kind {
    Unary(u) => u.satisfied
    Binary(b) => b.direction != NoDirection
  }
}

///|
fn Constraint::mark_unsatisfied(self : Constraint) -> Unit {
  match self.kind {
    Unary(u) => u.satisfied = false
    Binary(b) => b.direction = NoDirection
  }
}

///|
fn Constraint::is_input(self : Constraint) -> Bool {
  self.kind is Unary({ role: Edit, .. })
}

///|
fn Constraint::input(self : Constraint) -> Variable {
  match self.kind {
    Unary(u) => u.output
    Binary(b) => if b.direction == Forward { b.v1 } else { b.v2 }
  }
}

///|
fn Constraint::output(self : Constraint) -> Variable {
  match self.kind {
    Unary(u) => u.output
    Binary(b) => if b.direction == Forward { b.v2 } else { b.v1 }
  }
}

///|
fn Constraint::mark_inputs(self : Constraint, mark : Int) -> Unit {
  if self.kind is Binary(b) {
    self.input().mark = mark
    if b.op is Scale(scale~, offset~) {
      scale.mark = mark
      offset.mark = mark
    }
  }
}

///|
fn Constraint::inputs_known(self : Constraint, mark : Int) -> Bool {
  match self.kind {
    Unary(_) => true
    Binary(_) => {
      let input = self.input()
      input.mark == mark || input.stay || input.determined_by is None
    }
  }
}

///|
/// Recomputes the output's walk strength and stay flag, and its value if it
/// is constant.
fn Constraint::recalculate(self : Constraint) -> Unit {
  let stay = match self.kind {
    Unary(u) => {
      let output = u.output
      output.walk_strength = self.strength
      output.stay = u.role != Edit
      output.stay
    }
    Binary(b) => {
      let input = self.input()
      let output = self.output()
      output.walk_strength = self.strength.weakest_of(input.walk_strength)
      output.stay = match b.op {
        Equality => input.stay
        Scale(scale~, offset~) => input.stay && scale.stay && offset.stay
      }
      output.stay
    }
  }
  if stay {
    self.execute()
  }
}

///|
fn Constraint::execute(self : Constraint) -> Unit {
  match self.kind {
    Unary(_) => ()
    Binary({ op: Equality, .. }) => self.output().value = self.input().value
    Binary({ v1, v2, direction, op: Scale(scale~, offset~) }) =>
      if direction == Forward {
        v2.value = v1.value * scale.value + offset.value
      } else {
        v1.value = (v2.value - offset.value) / scale.value
      }
  }
}

///|
/// Satisfies this constraint if it can, returning the constraint it
/// overrode, if any.
fn Constraint::satisfy(
  self : Constraint,
  mark : Int,
  planner : Planner,
) -> Constraint? {
  self.choose_method(mark)
  if !self.is_satisfied() {
    if self.strength == Required {
      abort("could not satisfy a required constraint")
    }
    return None
  }
  self.mark_inputs(mark)
  let output = self.output()
  let overridden = output.determined_by
  if overridden is Some(o) {
    o.mark_unsatisfied()
  }
  output.determined_by = Some(self)
  if !planner.add_propagate(self, mark) {
    abort("cycle encountered")
  }
  output.mark = mark
  overridden
}

///|
fn Constraint::destroy(self : Constraint, planner : Planner) -> Unit {
  if self.is_satisfied() {
    planner.incremental_remove(self)
  } else {
    self.remove_from_graph()
  }
}

// ---------------------------------------------------------------------------
// Planner and plans

///|
fn execute_plan(plan : Array[Constraint]) -> Unit {
  for c in plan {
    c.execute()
  }
}

///|
priv struct Planner {
  mut current_mark : Int
}

///|
fn Planner::new() -> Planner {
  { current_mark: 0 }
}

///|
fn Planner::new_mark(self : Planner) -> Int {
  self.current_mark += 1
  self.current_mark
}

///|
fn Planner::incremental_add(self : Planner, c : Constraint) -> Unit {
  let mark = self.new_mark()
  let mut overridden = c.satisfy(mark, self)
  while overridden is Some(o) {
    overridden = o.satisfy(mark, self)
  }
}

///|
fn Planner::incremental_remove(self : Planner, c : Constraint) -> Unit {
  let output = c.output()
  c.mark_unsatisfied()
  c.remove_from_graph()
  let unsatisfied = self.remove_propagate_from(output)
  let mut strength = Required
  while true {
    for u in unsatisfied {
      if u.strength == strength {
        self.incremental_add(u)
      }
    }
    strength = strength.next_weaker()
    if strength == Weakest {
      break
    }
  }
}

///|
/// Recomputes everything downstream of `c`; false if that reaches a variable
/// already marked in this pass (a cycle).
fn Planner::add_propagate(self : Planner, c : Constraint, mark : Int) -> Bool {
  let todo = [c]
  while todo.pop() is Some(d) {
    let output = d.output()
    if output.mark == mark {
      self.incremental_remove(c)
      return false
    }
    d.recalculate()
    output.push_consumers(todo)
  }
  true
}

///|
/// Resets everything downstream of `output`, returning the unsatisfied
/// constraints it finds. (A method like the others, though it needs no
/// planner state.)
#warnings("-unused_value")
fn Planner::remove_propagate_from(
  self : Planner,
  output : Variable,
) -> Array[Constraint] {
  output.determined_by = None
  output.walk_strength = Weakest
  output.stay = true
  let unsatisfied = []
  let todo = [output]
  while todo.pop() is Some(v) {
    for c in v.constraints {
      if !c.is_satisfied() {
        unsatisfied.push(c)
      }
    }
    let determining = v.determined_by
    for c in v.constraints {
      if !is_constraint(determining, c) && c.is_satisfied() {
        c.recalculate()
        todo.push(c.output())
      }
    }
  }
  unsatisfied
}

///|
fn Planner::make_plan(
  self : Planner,
  sources : Array[Constraint],
) -> Array[Constraint] {
  let mark = self.new_mark()
  let plan = []
  let todo = sources
  while todo.pop() is Some(c) {
    let output = c.output()
    if output.mark != mark && c.inputs_known(mark) {
      plan.push(c)
      output.mark = mark
      output.push_consumers(todo)
    }
  }
  plan
}

///|
fn Planner::extract_plan_from_constraints(
  self : Planner,
  constraints : Array[Constraint],
) -> Array[Constraint] {
  self.make_plan(constraints.filter(c => c.is_input() && c.is_satisfied()))
}

// ---------------------------------------------------------------------------
// Tests

///|
/// A chain of n equality constraints, edited from the first variable.
fn chain_test(n : Int) -> Int64 {
  let planner = Planner::new()
  let mut prev : Variable? = None
  let mut first : Variable? = None
  let mut last : Variable? = None
  for i in 0..=n {
    let v = Variable::new(0)
    if prev is Some(p) {
      Constraint::equality(p, v, Required, planner) |> ignore
    }
    if i == 0 {
      first = Some(v)
    }
    if i == n {
      last = Some(v)
    }
    prev = Some(v)
  }
  let first = first.unwrap()
  let last = last.unwrap()
  Constraint::stay(last, StrongDefault, planner) |> ignore
  let edit = Constraint::edit(first, Preferred, planner)
  let plan = planner.extract_plan_from_constraints([edit])
  let mut failures = 0L
  for i in 0..<100 {
    first.value = i
    execute_plan(plan)
    if last.value != i {
      failures += 1
    }
  }
  failures
}

///|
/// n scale constraints sharing one scale and offset, edited from either end.
fn projection_test(n : Int) -> Int64 {
  let planner = Planner::new()
  let scale = Variable::new(10)
  let offset = Variable::new(1000)
  let mut src : Variable? = None
  let mut dst : Variable? = None
  let dests = []
  for i in 0..<n {
    let s = Variable::new(i)
    let d = Variable::new(i)
    dests.push(d)
    Constraint::stay(s, Normal, planner) |> ignore
    Constraint::scale(s, scale, offset, d, Required, planner) |> ignore
    src = Some(s)
    dst = Some(d)
  }
  let src = src.unwrap()
  let dst = dst.unwrap()
  let mut failures = 0L
  change(planner, src, 17)
  if dst.value != 1170 {
    failures += 1
  }
  change(planner, dst, 1050)
  if src.value != 5 {
    failures += 1
  }
  change(planner, scale, 5)
  for i in 0..<(n - 1) {
    if dests[i].value != i * 5 + 1000 {
      failures += 1
    }
  }
  change(planner, offset, 2000)
  for i in 0..<(n - 1) {
    if dests[i].value != i * 5 + 2000 {
      failures += 1
    }
  }
  failures
}

///|
fn change(planner : Planner, v : Variable, new_value : Int) -> Unit {
  let edit = Constraint::edit(v, Preferred, planner)
  let plan = planner.extract_plan_from_constraints([edit])
  for _ in 0..<10 {
    v.value = new_value
    execute_plan(plan)
  }
  edit.destroy(planner)
}

// ---------------------------------------------------------------------------
// Exports

///|
pub fn bench_chain(iterations : Int) -> Int64 {
  let mut failures = 0L
  for _ in 0..<iterations {
    failures += chain_test(1048)
  }
  failures
}

///|
pub fn bench_projection(iterations : Int) -> Int64 {
  let mut failures = 0L
  for _ in 0..<iterations {
    failures += projection_test(1048)
  }
  failures
}
