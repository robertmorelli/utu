//! DeltaBlue, the incremental constraint solver (V8's `deltablue.js` / Dart's
//! `DeltaBlue.dart`), in idiomatic safe Rust.
//!
//! Variables and constraints form a shared object graph of `Rc<RefCell<_>>`
//! nodes: a variable lists the constraints on it, and a constraint holds the
//! variables it relates. The four constraint kinds are one enum. Worklists are
//! `Vec` stacks. The graph is reference-counted in both directions, so each
//! test's graph is a cycle that is never freed (as in the previous version).
//!
//! There is no `unsafe` code. The crate denies `unsafe_code` rather than
//! forbidding it only because that lint also flags `#[no_mangle]`, so the four
//! exports at the bottom opt out of it one by one.
#![deny(unsafe_code)]

use std::cell::RefCell;
use std::rc::Rc;

// ---------------------------------------------------------------------------
// Strength

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Strength {
    Required,
    #[allow(dead_code)] // in the strength table, but no test uses it
    StrongPreferred,
    Preferred,
    StrongDefault,
    Normal,
    WeakDefault,
    Weakest,
}

impl Strength {
    fn stronger(self, other: Strength) -> bool {
        self < other
    }

    fn weaker(self, other: Strength) -> bool {
        self > other
    }

    fn weakest_of(self, other: Strength) -> Strength {
        if self.weaker(other) {
            self
        } else {
            other
        }
    }

    /// The original's table, inverted on purpose: Required is followed by
    /// Weakest, so `incremental_remove` only ever re-adds required constraints.
    fn next_weaker(self) -> Strength {
        match self {
            Strength::Required => Strength::Weakest,
            Strength::StrongPreferred => Strength::WeakDefault,
            Strength::Preferred => Strength::Normal,
            Strength::StrongDefault => Strength::StrongDefault,
            Strength::Normal => Strength::Preferred,
            Strength::WeakDefault => Strength::Required,
            Strength::Weakest => unreachable!("Weakest has no weaker strength"),
        }
    }
}

// ---------------------------------------------------------------------------
// Variable

type Var = Rc<RefCell<Variable>>;

struct Variable {
    value: i32,
    constraints: Vec<Constraint>,
    determined_by: Option<Constraint>,
    mark: i32,
    walk_strength: Strength,
    stay: bool,
}

impl Variable {
    fn new(value: i32) -> Var {
        Rc::new(RefCell::new(Variable {
            value,
            constraints: Vec::new(),
            determined_by: None,
            mark: 0,
            walk_strength: Strength::Weakest,
            stay: true,
        }))
    }

    fn add_constraint(&mut self, c: &Constraint) {
        self.constraints.push(c.clone());
    }

    fn remove_constraint(&mut self, c: &Constraint) {
        self.constraints.retain(|other| other != c);
        if self.determined_by.as_ref() == Some(c) {
            self.determined_by = None;
        }
    }

    /// Pushes the satisfied constraints that consume this variable, i.e. all
    /// satisfied ones except the one that determines it.
    fn push_consumers(&self, into: &mut Vec<Constraint>) {
        let determining = self.determined_by.as_ref();
        into.extend(
            self.constraints
                .iter()
                .filter(|c| Some(*c) != determining && c.is_satisfied())
                .cloned(),
        );
    }
}

// ---------------------------------------------------------------------------
// Constraint

#[derive(Clone, Copy, PartialEq, Eq)]
enum Direction {
    None,
    Forward,
    Backward,
}

enum UnaryRole {
    Stay,
    Edit,
}

enum BinaryOp {
    Equality,
    /// `v2 = v1 * scale + offset`
    Scale { scale: Var, offset: Var },
}

enum Kind {
    Unary {
        output: Var,
        satisfied: bool,
        role: UnaryRole,
    },
    Binary {
        v1: Var,
        v2: Var,
        direction: Direction,
        op: BinaryOp,
    },
}

struct ConstraintData {
    strength: Strength,
    kind: Kind,
}

/// A shared handle to a constraint; equality is identity.
#[derive(Clone)]
struct Constraint(Rc<RefCell<ConstraintData>>);

impl PartialEq for Constraint {
    fn eq(&self, other: &Constraint) -> bool {
        Rc::ptr_eq(&self.0, &other.0)
    }
}

impl Constraint {
    /// Creates a constraint and adds it to the graph and the plan.
    fn new(strength: Strength, kind: Kind, planner: &mut Planner) -> Constraint {
        let c = Constraint(Rc::new(RefCell::new(ConstraintData { strength, kind })));
        c.add_to_graph();
        planner.incremental_add(&c);
        c
    }

    fn stay(v: &Var, strength: Strength, planner: &mut Planner) -> Constraint {
        Self::unary(v, strength, UnaryRole::Stay, planner)
    }

    fn edit(v: &Var, strength: Strength, planner: &mut Planner) -> Constraint {
        Self::unary(v, strength, UnaryRole::Edit, planner)
    }

    fn unary(v: &Var, strength: Strength, role: UnaryRole, planner: &mut Planner) -> Constraint {
        let kind = Kind::Unary { output: v.clone(), satisfied: false, role };
        Self::new(strength, kind, planner)
    }

    fn equality(v1: &Var, v2: &Var, strength: Strength, planner: &mut Planner) -> Constraint {
        Self::binary(v1, v2, BinaryOp::Equality, strength, planner)
    }

    fn scale(
        src: &Var,
        scale: &Var,
        offset: &Var,
        dst: &Var,
        strength: Strength,
        planner: &mut Planner,
    ) -> Constraint {
        let op = BinaryOp::Scale { scale: scale.clone(), offset: offset.clone() };
        Self::binary(src, dst, op, strength, planner)
    }

    fn binary(v1: &Var, v2: &Var, op: BinaryOp, strength: Strength, planner: &mut Planner) -> Constraint {
        let kind = Kind::Binary { v1: v1.clone(), v2: v2.clone(), direction: Direction::None, op };
        Self::new(strength, kind, planner)
    }

    fn strength(&self) -> Strength {
        self.0.borrow().strength
    }

    fn add_to_graph(&self) {
        let mut data = self.0.borrow_mut();
        match &mut data.kind {
            Kind::Unary { output, satisfied, .. } => {
                output.borrow_mut().add_constraint(self);
                *satisfied = false;
            }
            Kind::Binary { v1, v2, direction, op } => {
                v1.borrow_mut().add_constraint(self);
                v2.borrow_mut().add_constraint(self);
                *direction = Direction::None;
                if let BinaryOp::Scale { scale, offset } = op {
                    scale.borrow_mut().add_constraint(self);
                    offset.borrow_mut().add_constraint(self);
                }
            }
        }
    }

    fn remove_from_graph(&self) {
        let mut data = self.0.borrow_mut();
        match &mut data.kind {
            Kind::Unary { output, satisfied, .. } => {
                output.borrow_mut().remove_constraint(self);
                *satisfied = false;
            }
            Kind::Binary { v1, v2, direction, op } => {
                v1.borrow_mut().remove_constraint(self);
                v2.borrow_mut().remove_constraint(self);
                *direction = Direction::None;
                if let BinaryOp::Scale { scale, offset } = op {
                    scale.borrow_mut().remove_constraint(self);
                    offset.borrow_mut().remove_constraint(self);
                }
            }
        }
    }

    /// Decides whether (unary) or in which direction (binary) to satisfy this
    /// constraint, given the variables already marked in this pass.
    #[allow(unused_assignments)] // the original's first two choices are overwritten
    fn choose_method(&self, mark: i32) {
        let mut data = self.0.borrow_mut();
        let strength = data.strength;
        match &mut data.kind {
            Kind::Unary { output, satisfied, .. } => {
                let output = output.borrow();
                *satisfied = output.mark != mark && strength.stronger(output.walk_strength);
            }
            Kind::Binary { v1, v2, direction, .. } => {
                let (v1, v2) = (v1.borrow(), v2.borrow());
                // The first two decisions are always overwritten by the third;
                // the original does this too.
                let mut chosen = Direction::None;
                if v1.mark == mark {
                    chosen = if v2.mark != mark && strength.stronger(v2.walk_strength) {
                        Direction::Forward
                    } else {
                        Direction::None
                    };
                }
                if v2.mark == mark {
                    chosen = if v1.mark != mark && strength.stronger(v1.walk_strength) {
                        Direction::Backward
                    } else {
                        Direction::None
                    };
                }
                chosen = if v1.walk_strength.weaker(v2.walk_strength) {
                    if strength.stronger(v1.walk_strength) {
                        Direction::Backward
                    } else {
                        Direction::None
                    }
                } else if strength.stronger(v2.walk_strength) {
                    Direction::Forward
                } else {
                    Direction::Backward
                };
                *direction = chosen;
            }
        }
    }

    fn is_satisfied(&self) -> bool {
        match &self.0.borrow().kind {
            Kind::Unary { satisfied, .. } => *satisfied,
            Kind::Binary { direction, .. } => *direction != Direction::None,
        }
    }

    fn mark_unsatisfied(&self) {
        match &mut self.0.borrow_mut().kind {
            Kind::Unary { satisfied, .. } => *satisfied = false,
            Kind::Binary { direction, .. } => *direction = Direction::None,
        }
    }

    fn is_input(&self) -> bool {
        matches!(self.0.borrow().kind, Kind::Unary { role: UnaryRole::Edit, .. })
    }

    fn input(&self) -> Var {
        match &self.0.borrow().kind {
            Kind::Unary { output, .. } => output.clone(),
            Kind::Binary { v1, v2, direction, .. } => {
                if *direction == Direction::Forward { v1.clone() } else { v2.clone() }
            }
        }
    }

    fn output(&self) -> Var {
        match &self.0.borrow().kind {
            Kind::Unary { output, .. } => output.clone(),
            Kind::Binary { v1, v2, direction, .. } => {
                if *direction == Direction::Forward { v2.clone() } else { v1.clone() }
            }
        }
    }

    fn mark_inputs(&self, mark: i32) {
        if let Kind::Binary { op, .. } = &self.0.borrow().kind {
            self.input().borrow_mut().mark = mark;
            if let BinaryOp::Scale { scale, offset } = op {
                scale.borrow_mut().mark = mark;
                offset.borrow_mut().mark = mark;
            }
        }
    }

    fn inputs_known(&self, mark: i32) -> bool {
        match &self.0.borrow().kind {
            Kind::Unary { .. } => true,
            Kind::Binary { .. } => {
                let input = self.input();
                let input = input.borrow();
                input.mark == mark || input.stay || input.determined_by.is_none()
            }
        }
    }

    /// Recomputes the output's walk strength and stay flag, and its value if
    /// it is constant.
    fn recalculate(&self) {
        let data = self.0.borrow();
        let stay = match &data.kind {
            Kind::Unary { output, role, .. } => {
                let mut output = output.borrow_mut();
                output.walk_strength = data.strength;
                output.stay = !matches!(role, UnaryRole::Edit);
                output.stay
            }
            Kind::Binary { op, .. } => {
                let (input, output) = (self.input(), self.output());
                let input = input.borrow();
                let mut output = output.borrow_mut();
                output.walk_strength = data.strength.weakest_of(input.walk_strength);
                output.stay = match op {
                    BinaryOp::Equality => input.stay,
                    BinaryOp::Scale { scale, offset } => {
                        input.stay && scale.borrow().stay && offset.borrow().stay
                    }
                };
                output.stay
            }
        };
        if stay {
            self.execute();
        }
    }

    fn execute(&self) {
        let data = self.0.borrow();
        match &data.kind {
            Kind::Unary { .. } => {}
            Kind::Binary { op: BinaryOp::Equality, .. } => {
                let value = self.input().borrow().value;
                self.output().borrow_mut().value = value;
            }
            Kind::Binary { v1, v2, direction, op: BinaryOp::Scale { scale, offset } } => {
                let (scale, offset) = (scale.borrow().value, offset.borrow().value);
                if *direction == Direction::Forward {
                    let value = v1.borrow().value * scale + offset;
                    v2.borrow_mut().value = value;
                } else {
                    let value = (v2.borrow().value - offset) / scale;
                    v1.borrow_mut().value = value;
                }
            }
        }
    }

    /// Satisfies this constraint if it can, returning the constraint it
    /// overrode, if any.
    fn satisfy(&self, mark: i32, planner: &mut Planner) -> Option<Constraint> {
        self.choose_method(mark);
        if !self.is_satisfied() {
            if self.strength() == Strength::Required {
                panic!("could not satisfy a required constraint");
            }
            return None;
        }
        self.mark_inputs(mark);
        let output = self.output();
        let overridden = output.borrow().determined_by.clone();
        if let Some(overridden) = &overridden {
            overridden.mark_unsatisfied();
        }
        output.borrow_mut().determined_by = Some(self.clone());
        if !planner.add_propagate(self, mark) {
            panic!("cycle encountered");
        }
        output.borrow_mut().mark = mark;
        overridden
    }

    fn destroy(&self, planner: &mut Planner) {
        if self.is_satisfied() {
            planner.incremental_remove(self);
        } else {
            self.remove_from_graph();
        }
    }
}

// ---------------------------------------------------------------------------
// Planner and plans

struct Plan(Vec<Constraint>);

impl Plan {
    fn execute(&self) {
        for c in &self.0 {
            c.execute();
        }
    }
}

#[derive(Default)]
struct Planner {
    current_mark: i32,
}

impl Planner {
    fn new_mark(&mut self) -> i32 {
        self.current_mark += 1;
        self.current_mark
    }

    fn incremental_add(&mut self, c: &Constraint) {
        let mark = self.new_mark();
        let mut overridden = c.satisfy(mark, self);
        while let Some(o) = overridden {
            overridden = o.satisfy(mark, self);
        }
    }

    fn incremental_remove(&mut self, c: &Constraint) {
        let output = c.output();
        c.mark_unsatisfied();
        c.remove_from_graph();
        let unsatisfied = self.remove_propagate_from(&output);
        let mut strength = Strength::Required;
        loop {
            for u in &unsatisfied {
                if u.strength() == strength {
                    self.incremental_add(u);
                }
            }
            strength = strength.next_weaker();
            if strength == Strength::Weakest {
                break;
            }
        }
    }

    /// Recomputes everything downstream of `c`; false if that reaches a
    /// variable already marked in this pass (a cycle).
    fn add_propagate(&mut self, c: &Constraint, mark: i32) -> bool {
        let mut todo = vec![c.clone()];
        while let Some(d) = todo.pop() {
            let output = d.output();
            if output.borrow().mark == mark {
                self.incremental_remove(c);
                return false;
            }
            d.recalculate();
            output.borrow().push_consumers(&mut todo);
        }
        true
    }

    /// Resets everything downstream of `output`, returning the unsatisfied
    /// constraints it finds.
    fn remove_propagate_from(&mut self, output: &Var) -> Vec<Constraint> {
        {
            let mut output = output.borrow_mut();
            output.determined_by = None;
            output.walk_strength = Strength::Weakest;
            output.stay = true;
        }
        let mut unsatisfied = Vec::new();
        let mut todo = vec![output.clone()];
        while let Some(v) = todo.pop() {
            let count = v.borrow().constraints.len();
            for i in 0..count {
                let c = v.borrow().constraints[i].clone();
                if !c.is_satisfied() {
                    unsatisfied.push(c);
                }
            }
            // Each constraint is borrowed out of v's list only while it is read:
            // recalculating a Stay on v itself writes v.
            let determining = v.borrow().determined_by.clone();
            for i in 0..count {
                let c = v.borrow().constraints[i].clone();
                if Some(&c) != determining.as_ref() && c.is_satisfied() {
                    c.recalculate();
                    todo.push(c.output());
                }
            }
        }
        unsatisfied
    }

    fn make_plan(&mut self, sources: Vec<Constraint>) -> Plan {
        let mark = self.new_mark();
        let mut plan = Vec::new();
        let mut todo = sources;
        while let Some(c) = todo.pop() {
            let output = c.output();
            if output.borrow().mark != mark && c.inputs_known(mark) {
                plan.push(c);
                output.borrow_mut().mark = mark;
                output.borrow().push_consumers(&mut todo);
            }
        }
        Plan(plan)
    }

    fn extract_plan_from_constraints(&mut self, constraints: &[Constraint]) -> Plan {
        let sources = constraints
            .iter()
            .filter(|c| c.is_input() && c.is_satisfied())
            .cloned()
            .collect();
        self.make_plan(sources)
    }
}

// ---------------------------------------------------------------------------
// Tests

/// A chain of n equality constraints, edited from the first variable.
fn chain_test(n: i32) -> i64 {
    let mut planner = Planner::default();
    let mut prev: Option<Var> = None;
    let mut first: Option<Var> = None;
    let mut last: Option<Var> = None;
    for i in 0..=n {
        let v = Variable::new(0);
        if let Some(p) = &prev {
            Constraint::equality(p, &v, Strength::Required, &mut planner);
        }
        if i == 0 {
            first = Some(v.clone());
        }
        if i == n {
            last = Some(v.clone());
        }
        prev = Some(v);
    }
    let (first, last) = (first.expect("n >= 0"), last.expect("n >= 0"));

    Constraint::stay(&last, Strength::StrongDefault, &mut planner);
    let edit = Constraint::edit(&first, Strength::Preferred, &mut planner);
    let edits = vec![edit];
    let plan = planner.extract_plan_from_constraints(&edits);

    let mut failures = 0;
    for i in 0..100 {
        first.borrow_mut().value = i;
        plan.execute();
        if last.borrow().value != i {
            failures += 1;
        }
    }
    failures
}

/// n scale constraints sharing one scale and offset, edited from either end.
fn projection_test(n: i32) -> i64 {
    let mut planner = Planner::default();
    let scale = Variable::new(10);
    let offset = Variable::new(1000);
    let mut src = None;
    let mut dst = None;
    let mut dests = Vec::new();
    for i in 0..n {
        let s = Variable::new(i);
        let d = Variable::new(i);
        dests.push(d.clone());
        Constraint::stay(&s, Strength::Normal, &mut planner);
        Constraint::scale(&s, &scale, &offset, &d, Strength::Required, &mut planner);
        src = Some(s);
        dst = Some(d);
    }
    let (src, dst) = (src.expect("n > 0"), dst.expect("n > 0"));

    let mut failures = 0;
    change(&mut planner, &src, 17);
    if dst.borrow().value != 1170 {
        failures += 1;
    }
    change(&mut planner, &dst, 1050);
    if src.borrow().value != 5 {
        failures += 1;
    }
    change(&mut planner, &scale, 5);
    for (i, d) in (0..n - 1).zip(&dests) {
        if d.borrow().value != i * 5 + 1000 {
            failures += 1;
        }
    }
    change(&mut planner, &offset, 2000);
    for (i, d) in (0..n - 1).zip(&dests) {
        if d.borrow().value != i * 5 + 2000 {
            failures += 1;
        }
    }
    failures
}

fn change(planner: &mut Planner, v: &Var, new_value: i32) {
    let edit = Constraint::edit(v, Strength::Preferred, planner);
    let edits = vec![edit.clone()];
    let plan = planner.extract_plan_from_constraints(&edits);
    for _ in 0..10 {
        v.borrow_mut().value = new_value;
        plan.execute();
    }
    edit.destroy(planner);
}

// ---------------------------------------------------------------------------
// Exports

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn delta_blue(n: i32) -> i64 {
    chain_test(n) + projection_test(n)
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn run_check() -> i64 {
    delta_blue(200)
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn bench_chain(iterations: i32) -> i64 {
    (0..iterations).map(|_| chain_test(1048)).sum()
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn bench_projection(iterations: i32) -> i64 {
    (0..iterations).map(|_| projection_test(1048)).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_graphs_have_no_failures() {
        assert_eq!(chain_test(20), 0);
        assert_eq!(projection_test(20), 0);
    }

    #[test]
    fn benchmarks_have_no_failures() {
        assert_eq!(bench_chain(2), 0);
        assert_eq!(bench_projection(2), 0);
        assert_eq!(run_check(), 0);
    }
}
