//! DeltaBlue, the "fastest Rust" port: an arena of raw pointers.
//!
//! This computes exactly the canonical DeltaBlue (V8's `deltablue.js`). Each
//! test run owns its variables and constraints in two typed arenas inside the
//! `Planner`, and the constraint graph links them with `*mut` edges (null where
//! the original has null). That avoids Rc/RefCell bookkeeping; collections are
//! plain `Vec`s and every worklist is a stack.
//!
//! Safety invariant, relied on by every `unsafe` block below: a `Var` or `Con`
//! always points into the arenas of the planner that made it, which free
//! nothing until the planner is dropped at the end of its test. References made
//! from these pointers last for one expression or one short block that does not
//! reach the same node through another path; fields that another node may write
//! meanwhile are accessed by place (`(*p).field`), never through a reference.

use std::ptr;

type Var = *mut Variable;
type Con = *mut Constraint;

/// Strengths from strongest (0) to weakest (6); the benchmark never uses StrongPreferred.
#[derive(Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
enum Strength {
    Required,
    StrongPreferred,
    Preferred,
    StrongDefault,
    Normal,
    WeakDefault,
    Weakest,
}

impl Strength {
    fn stronger(self, other: Strength) -> bool {
        (self as u8) < (other as u8)
    }

    fn weaker(self, other: Strength) -> bool {
        (self as u8) > (other as u8)
    }

    fn weakest_of(self, other: Strength) -> Strength {
        if self.weaker(other) {
            self
        } else {
            other
        }
    }

    /// The original's mapping, inverted on purpose.
    fn next_weaker(self) -> Strength {
        match self {
            Strength::Required => Strength::Weakest,
            Strength::StrongPreferred => Strength::WeakDefault,
            Strength::Preferred => Strength::Normal,
            Strength::StrongDefault => Strength::StrongDefault,
            Strength::Normal => Strength::Preferred,
            Strength::WeakDefault => Strength::Required,
            Strength::Weakest => unreachable!("WEAKEST has no weaker strength"),
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Direction {
    None,
    Forward,
    Backward,
}

/// Owns boxed values for one test run and hands out stable raw pointers.
struct Arena<T> {
    items: Vec<*mut T>,
}

impl<T> Arena<T> {
    fn new() -> Self {
        Arena { items: Vec::new() }
    }

    fn alloc(&mut self, value: T) -> *mut T {
        let item = Box::into_raw(Box::new(value));
        self.items.push(item);
        item
    }
}

impl<T> Drop for Arena<T> {
    fn drop(&mut self) {
        for &item in &self.items {
            // SAFETY: each item came from `Box::into_raw` in `alloc` and is freed once, here.
            drop(unsafe { Box::from_raw(item) });
        }
    }
}

struct Variable {
    value: i32,
    constraints: Vec<Con>,
    determined_by: Con,
    mark: i32,
    walk_strength: Strength,
    stay: bool,
}

impl Variable {
    fn new(value: i32) -> Self {
        Variable {
            value,
            constraints: Vec::new(),
            determined_by: ptr::null_mut(),
            mark: 0,
            walk_strength: Strength::Weakest,
            stay: true,
        }
    }

    fn add_constraint(&mut self, c: Con) {
        self.constraints.push(c);
    }

    fn remove_constraint(&mut self, c: Con) {
        self.constraints.retain(|&other| other != c);
        if self.determined_by == c {
            self.determined_by = ptr::null_mut();
        }
    }
}

/// The two variables of an Equality or Scale constraint; for Scale, v1 is
/// the source and v2 the destination.
struct Binary {
    v1: Var,
    v2: Var,
    direction: Direction,
}

impl Binary {
    fn new(v1: Var, v2: Var) -> Self {
        Binary { v1, v2, direction: Direction::None }
    }

    fn input(&self) -> Var {
        if self.direction == Direction::Forward {
            self.v1
        } else {
            self.v2
        }
    }

    fn output(&self) -> Var {
        if self.direction == Direction::Forward {
            self.v2
        } else {
            self.v1
        }
    }

    #[allow(unused_assignments)] // the original's first two choices are overwritten
    fn choose_method(&mut self, strength: Strength, mark: i32) {
        // SAFETY: shared reads of live arena nodes; nothing writes them here.
        let (v1, v2) = unsafe { (&*self.v1, &*self.v2) };
        // The first two ifs are always overwritten by the third, as in the original.
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
        self.direction = chosen;
    }

    fn add_to_graph(&mut self, this: Con) {
        // SAFETY: each `&mut Variable` lives for one call.
        unsafe {
            (*self.v1).add_constraint(this);
            (*self.v2).add_constraint(this);
        }
        self.direction = Direction::None;
    }

    fn remove_from_graph(&mut self, this: Con) {
        // SAFETY: as in `add_to_graph`.
        unsafe {
            (*self.v1).remove_constraint(this);
            (*self.v2).remove_constraint(this);
        }
        self.direction = Direction::None;
    }
}

enum Kind {
    Stay { output: Var, satisfied: bool },
    Edit { output: Var, satisfied: bool },
    Equality(Binary),
    Scale { vars: Binary, scale: Var, offset: Var },
}

struct Constraint {
    strength: Strength,
    kind: Kind,
}

impl Constraint {
    fn is_input(&self) -> bool {
        matches!(self.kind, Kind::Edit { .. })
    }

    fn is_satisfied(&self) -> bool {
        match &self.kind {
            Kind::Stay { satisfied, .. } | Kind::Edit { satisfied, .. } => *satisfied,
            Kind::Equality(vars) | Kind::Scale { vars, .. } => vars.direction != Direction::None,
        }
    }

    fn mark_unsatisfied(&mut self) {
        match &mut self.kind {
            Kind::Stay { satisfied, .. } | Kind::Edit { satisfied, .. } => *satisfied = false,
            Kind::Equality(vars) | Kind::Scale { vars, .. } => vars.direction = Direction::None,
        }
    }

    fn output(&self) -> Var {
        match &self.kind {
            Kind::Stay { output, .. } | Kind::Edit { output, .. } => *output,
            Kind::Equality(vars) | Kind::Scale { vars, .. } => vars.output(),
        }
    }

    /// `this` is the arena pointer to `self`, the identity stored in the graph.
    fn add_to_graph(&mut self, this: Con) {
        match &mut self.kind {
            Kind::Stay { output, satisfied } | Kind::Edit { output, satisfied } => {
                // SAFETY: the `&mut Variable` lives for this one call.
                unsafe { (**output).add_constraint(this) };
                *satisfied = false;
            }
            Kind::Equality(vars) => vars.add_to_graph(this),
            Kind::Scale { vars, scale, offset } => {
                vars.add_to_graph(this);
                // SAFETY: as above.
                unsafe {
                    (**scale).add_constraint(this);
                    (**offset).add_constraint(this);
                }
            }
        }
    }

    fn remove_from_graph(&mut self, this: Con) {
        match &mut self.kind {
            Kind::Stay { output, satisfied } | Kind::Edit { output, satisfied } => {
                // SAFETY: the `&mut Variable` lives for this one call.
                unsafe { (**output).remove_constraint(this) };
                *satisfied = false;
            }
            Kind::Equality(vars) => vars.remove_from_graph(this),
            Kind::Scale { vars, scale, offset } => {
                vars.remove_from_graph(this);
                // SAFETY: as above.
                unsafe {
                    (**scale).remove_constraint(this);
                    (**offset).remove_constraint(this);
                }
            }
        }
    }

    fn choose_method(&mut self, mark: i32) {
        let strength = self.strength;
        match &mut self.kind {
            Kind::Stay { output, satisfied } | Kind::Edit { output, satisfied } => {
                // SAFETY: reads of a live arena node.
                let out = unsafe { &**output };
                *satisfied = out.mark != mark && strength.stronger(out.walk_strength);
            }
            Kind::Equality(vars) | Kind::Scale { vars, .. } => vars.choose_method(strength, mark),
        }
    }

    fn mark_inputs(&self, mark: i32) {
        // SAFETY: writes by place to live arena nodes.
        unsafe {
            match &self.kind {
                Kind::Stay { .. } | Kind::Edit { .. } => {}
                Kind::Equality(vars) => (*vars.input()).mark = mark,
                Kind::Scale { vars, scale, offset } => {
                    (*vars.input()).mark = mark;
                    (**scale).mark = mark;
                    (**offset).mark = mark;
                }
            }
        }
    }

    fn inputs_known(&self, mark: i32) -> bool {
        match &self.kind {
            Kind::Stay { .. } | Kind::Edit { .. } => true,
            Kind::Equality(vars) | Kind::Scale { vars, .. } => {
                // SAFETY: reads of a live arena node.
                let input = unsafe { &*vars.input() };
                input.mark == mark || input.stay || input.determined_by.is_null()
            }
        }
    }

    fn recalculate(&self) {
        // SAFETY: by-place accesses to live arena nodes. No references are
        // made, because the caller may be borrowing the output's constraint list.
        let stay = unsafe {
            match &self.kind {
                Kind::Stay { output, .. } | Kind::Edit { output, .. } => {
                    (**output).walk_strength = self.strength;
                    (**output).stay = !self.is_input();
                    (**output).stay
                }
                Kind::Equality(vars) => {
                    let (input, output) = (vars.input(), vars.output());
                    (*output).walk_strength = self.strength.weakest_of((*input).walk_strength);
                    (*output).stay = (*input).stay;
                    (*output).stay
                }
                Kind::Scale { vars, scale, offset } => {
                    let (input, output) = (vars.input(), vars.output());
                    (*output).walk_strength = self.strength.weakest_of((*input).walk_strength);
                    (*output).stay = (*input).stay && (**scale).stay && (**offset).stay;
                    (*output).stay
                }
            }
        };
        if stay {
            self.execute();
        }
    }

    fn execute(&self) {
        // SAFETY: by-place accesses to live arena nodes.
        unsafe {
            match &self.kind {
                Kind::Stay { .. } | Kind::Edit { .. } => {}
                Kind::Equality(vars) => (*vars.output()).value = (*vars.input()).value,
                Kind::Scale { vars, scale, offset } => {
                    if vars.direction == Direction::Forward {
                        (*vars.v2).value = (*vars.v1).value * (**scale).value + (**offset).value;
                    } else {
                        (*vars.v1).value = ((*vars.v2).value - (**offset).value) / (**scale).value;
                    }
                }
            }
        }
    }
}

/// Pushes every satisfied constraint on `v`, other than the one determining it.
fn add_constraints_consuming_to(v: Var, coll: &mut Vec<Con>) {
    // SAFETY: shared reads of live arena nodes; nothing writes them here.
    unsafe {
        let v = &*v;
        let determining = v.determined_by;
        for &c in &v.constraints {
            if c != determining && (*c).is_satisfied() {
                coll.push(c);
            }
        }
    }
}

struct Plan(Vec<Con>);

impl Plan {
    fn execute(&self) {
        for &c in &self.0 {
            // SAFETY: plan entries are live arena nodes.
            unsafe { (*c).execute() };
        }
    }
}

struct Planner {
    current_mark: i32,
    variables: Arena<Variable>,
    constraints: Arena<Constraint>,
}

impl Planner {
    fn new() -> Self {
        Planner {
            current_mark: 0,
            variables: Arena::new(),
            constraints: Arena::new(),
        }
    }

    fn variable(&mut self, value: i32) -> Var {
        self.variables.alloc(Variable::new(value))
    }

    /// Allocates a constraint and adds it to the graph and the plan.
    fn constraint(&mut self, strength: Strength, kind: Kind) -> Con {
        let c = self.constraints.alloc(Constraint { strength, kind });
        // SAFETY: `c` was just allocated; the reference ends with the call.
        unsafe { (*c).add_to_graph(c) };
        self.incremental_add(c);
        c
    }

    fn stay(&mut self, output: Var, strength: Strength) -> Con {
        self.constraint(strength, Kind::Stay { output, satisfied: false })
    }

    fn edit(&mut self, output: Var, strength: Strength) -> Con {
        self.constraint(strength, Kind::Edit { output, satisfied: false })
    }

    fn equality(&mut self, v1: Var, v2: Var, strength: Strength) -> Con {
        self.constraint(strength, Kind::Equality(Binary::new(v1, v2)))
    }

    fn scale(&mut self, src: Var, scale: Var, offset: Var, dst: Var, strength: Strength) -> Con {
        let vars = Binary::new(src, dst);
        self.constraint(strength, Kind::Scale { vars, scale, offset })
    }

    fn new_mark(&mut self) -> i32 {
        self.current_mark += 1;
        self.current_mark
    }

    fn incremental_add(&mut self, c: Con) {
        let mark = self.new_mark();
        let mut overridden = self.satisfy(c, mark);
        while !overridden.is_null() {
            overridden = self.satisfy(overridden, mark);
        }
    }

    /// Satisfies `c` if it can; returns the constraint it overrode, or null.
    fn satisfy(&mut self, c: Con, mark: i32) -> Con {
        // SAFETY: the `&mut Constraint` ends with this block, before
        // `add_propagate` can reach `c` again.
        let out = unsafe {
            let con = &mut *c;
            con.choose_method(mark);
            if !con.is_satisfied() {
                assert!(con.strength != Strength::Required, "could not satisfy a required constraint");
                return ptr::null_mut();
            }
            con.mark_inputs(mark);
            con.output()
        };
        // SAFETY: by-place accesses to live arena nodes.
        let overridden = unsafe { (*out).determined_by };
        if !overridden.is_null() {
            // SAFETY: as above; the reference lives for one call.
            unsafe { (*overridden).mark_unsatisfied() };
        }
        // SAFETY: as above.
        unsafe { (*out).determined_by = c };
        let acyclic = self.add_propagate(c, mark);
        assert!(acyclic, "cycle encountered");
        // SAFETY: as above.
        unsafe { (*out).mark = mark };
        overridden
    }

    fn destroy(&mut self, c: Con) {
        // SAFETY: each reference lives for one call.
        if unsafe { (*c).is_satisfied() } {
            self.incremental_remove(c);
        } else {
            unsafe { (*c).remove_from_graph(c) };
        }
    }

    fn incremental_remove(&mut self, c: Con) {
        // SAFETY: the `&mut Constraint` ends with this block.
        let out = unsafe {
            let con = &mut *c;
            let out = con.output();
            con.mark_unsatisfied();
            con.remove_from_graph(c);
            out
        };
        let unsatisfied = self.remove_propagate_from(out);
        let mut strength = Strength::Required;
        loop {
            for &u in &unsatisfied {
                // SAFETY: reads of a live arena node.
                if unsafe { (*u).strength } == strength {
                    self.incremental_add(u);
                }
            }
            strength = strength.next_weaker();
            if strength == Strength::Weakest {
                break;
            }
        }
    }

    /// Recomputes walk strengths and values downstream of `c`; false (after
    /// undoing `c`) if that reaches a variable already marked, a cycle.
    fn add_propagate(&mut self, c: Con, mark: i32) -> bool {
        let mut todo = vec![c];
        while let Some(d) = todo.pop() {
            // SAFETY: reads and one-call references to live arena nodes.
            let out = unsafe { (*d).output() };
            if unsafe { (*out).mark } == mark {
                self.incremental_remove(c);
                return false;
            }
            unsafe { (*d).recalculate() };
            add_constraints_consuming_to(out, &mut todo);
        }
        true
    }

    /// Detaches `out` from its determining constraint, recomputes everything
    /// downstream, and returns the unsatisfied constraints it met.
    fn remove_propagate_from(&mut self, out: Var) -> Vec<Con> {
        // SAFETY: by-place writes to a live arena node.
        unsafe {
            (*out).determined_by = ptr::null_mut();
            (*out).walk_strength = Strength::Weakest;
            (*out).stay = true;
        }
        let mut unsatisfied = Vec::new();
        let mut todo = vec![out];
        while let Some(v) = todo.pop() {
            // SAFETY: `constraints` is only read while borrowed; `recalculate`
            // writes variables' other fields by place and never a constraint list.
            unsafe {
                let constraints = &(*v).constraints;
                for &c in constraints {
                    if !(*c).is_satisfied() {
                        unsatisfied.push(c);
                    }
                }
                let determining = (*v).determined_by;
                for &c in constraints {
                    if c != determining && (*c).is_satisfied() {
                        (*c).recalculate();
                        todo.push((*c).output());
                    }
                }
            }
        }
        unsatisfied
    }

    fn make_plan(&mut self, mut todo: Vec<Con>) -> Plan {
        let mark = self.new_mark();
        let mut plan = Vec::new();
        while let Some(c) = todo.pop() {
            // SAFETY: reads and by-place writes to live arena nodes.
            unsafe {
                let out = (*c).output();
                if (*out).mark != mark && (*c).inputs_known(mark) {
                    plan.push(c);
                    (*out).mark = mark;
                    add_constraints_consuming_to(out, &mut todo);
                }
            }
        }
        Plan(plan)
    }

    fn extract_plan_from_constraints(&mut self, constraints: &[Con]) -> Plan {
        let sources = constraints
            .iter()
            .copied()
            // SAFETY: reads of live arena nodes.
            .filter(|&c| unsafe { (*c).is_input() && (*c).is_satisfied() })
            .collect();
        self.make_plan(sources)
    }
}

// The tests read and write variable values directly; each access is a
// by-place access to a node of the test's own live planner.

fn chain_test(n: i32) -> i64 {
    let mut planner = Planner::new();
    let mut prev: Var = ptr::null_mut();
    let mut first: Var = ptr::null_mut();
    let mut last: Var = ptr::null_mut();
    for i in 0..=n {
        let v = planner.variable(0);
        if !prev.is_null() {
            planner.equality(prev, v, Strength::Required);
        }
        if i == 0 {
            first = v;
        }
        if i == n {
            last = v;
        }
        prev = v;
    }
    planner.stay(last, Strength::StrongDefault);
    let edit = planner.edit(first, Strength::Preferred);
    let edits = vec![edit];
    let plan = planner.extract_plan_from_constraints(&edits);
    let mut failures = 0;
    for i in 0..100 {
        unsafe { (*first).value = i };
        plan.execute();
        if unsafe { (*last).value } != i {
            failures += 1;
        }
    }
    failures
}

fn projection_test(n: i32) -> i64 {
    let mut planner = Planner::new();
    let scale = planner.variable(10);
    let offset = planner.variable(1000);
    let mut src: Var = ptr::null_mut();
    let mut dst: Var = ptr::null_mut();
    let mut dests = Vec::new();
    for i in 0..n {
        src = planner.variable(i);
        dst = planner.variable(i);
        dests.push(dst);
        planner.stay(src, Strength::Normal);
        planner.scale(src, scale, offset, dst, Strength::Required);
    }

    let mut failures = 0;
    change(&mut planner, src, 17);
    if unsafe { (*dst).value } != 1170 {
        failures += 1;
    }
    change(&mut planner, dst, 1050);
    if unsafe { (*src).value } != 5 {
        failures += 1;
    }
    change(&mut planner, scale, 5);
    for (i, &d) in (0..).zip(&dests[..dests.len() - 1]) {
        if unsafe { (*d).value } != i * 5 + 1000 {
            failures += 1;
        }
    }
    change(&mut planner, offset, 2000);
    for (i, &d) in (0..).zip(&dests[..dests.len() - 1]) {
        if unsafe { (*d).value } != i * 5 + 2000 {
            failures += 1;
        }
    }
    failures
}

fn change(planner: &mut Planner, v: Var, new_value: i32) {
    let edit = planner.edit(v, Strength::Preferred);
    let edits = vec![edit];
    let plan = planner.extract_plan_from_constraints(&edits);
    for _ in 0..10 {
        unsafe { (*v).value = new_value };
        plan.execute();
    }
    planner.destroy(edit);
}

fn delta_blue_impl(n: i32) -> i64 {
    chain_test(n) + projection_test(n)
}

#[no_mangle]
pub extern "C" fn delta_blue(n: i32) -> i64 {
    delta_blue_impl(n)
}

#[no_mangle]
pub extern "C" fn run_check() -> i64 {
    delta_blue_impl(200)
}

#[no_mangle]
pub extern "C" fn bench_chain(iterations: i32) -> i64 {
    (0..iterations).map(|_| chain_test(1048)).sum()
}

#[no_mangle]
pub extern "C" fn bench_projection(iterations: i32) -> i64 {
    (0..iterations).map(|_| projection_test(1048)).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chain_small_is_consistent() {
        assert_eq!(chain_test(20), 0);
    }

    #[test]
    fn projection_small_is_consistent() {
        assert_eq!(projection_test(20), 0);
    }

    #[test]
    #[cfg_attr(miri, ignore)] // n = 1048 is too slow under Miri
    fn entry_points_report_no_failures() {
        assert_eq!(bench_chain(2), 0);
        assert_eq!(bench_projection(2), 0);
        assert_eq!(run_check(), 0);
    }
}
