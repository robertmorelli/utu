#![allow(dead_code, unused_assignments)]

use std::cell::{Cell, UnsafeCell};

const REQUIRED: i32 = 0;
const STRONG_PREFERRED: i32 = 1;
const PREFERRED: i32 = 2;
const STRONG_DEFAULT: i32 = 3;
const NORMAL: i32 = 4;
const WEAK_DEFAULT: i32 = 5;
const WEAKEST: i32 = 6;

const DIRECTION_NONE: i32 = 0;
const DIRECTION_FORWARD: i32 = 1;
const DIRECTION_BACKWARD: i32 = -1;

type ConstraintRef<'a> = &'a Constraint<'a>;
type VariableRef<'a> = &'a Variable<'a>;

struct Arena<T> {
    items: UnsafeCell<Vec<Box<T>>>,
}

impl<T> Arena<T> {
    fn new() -> Self {
        Self {
            items: UnsafeCell::new(Vec::new()),
        }
    }

    fn alloc<'a>(&'a self, value: T) -> &'a T {
        unsafe {
            let items = &mut *self.items.get();
            items.push(Box::new(value));
            let ptr: *const T = &**items.last().expect("arena allocation failed");
            &*ptr
        }
    }
}

struct ConstraintList<'a> {
    items: Vec<ConstraintRef<'a>>,
    count: i32,
}

struct Variable<'a> {
    value: Cell<i32>,
    constraints: UnsafeCell<ConstraintList<'a>>,
    determined_by: Cell<Option<ConstraintRef<'a>>>,
    mark: Cell<i32>,
    walk_strength: Cell<i32>,
    stay: Cell<bool>,
}

struct VariableList<'a> {
    items: Vec<VariableRef<'a>>,
    count: i32,
}

struct Planner<'a> {
    current_mark: i32,
    constraint_capacity: i32,
    variable_capacity: i32,
    constraint_arena: &'a Arena<Constraint<'a>>,
    variable_arena: &'a Arena<Variable<'a>>,
}

enum Constraint<'a> {
    EmptyConstraint,
    StayConstraint {
        output: VariableRef<'a>,
        strength: i32,
        satisfied: Cell<bool>,
    },
    EditConstraint {
        output: VariableRef<'a>,
        strength: i32,
        satisfied: Cell<bool>,
    },
    EqualityConstraint {
        v1: VariableRef<'a>,
        v2: VariableRef<'a>,
        strength: i32,
        direction: Cell<i32>,
    },
    ScaleConstraint {
        src: VariableRef<'a>,
        scale: VariableRef<'a>,
        offset: VariableRef<'a>,
        dest: VariableRef<'a>,
        strength: i32,
        direction: Cell<i32>,
    },
}

fn stronger(s1: i32, s2: i32) -> bool {
    s1 < s2
}

fn weaker(s1: i32, s2: i32) -> bool {
    s1 > s2
}

fn weakest_of(s1: i32, s2: i32) -> i32 {
    if s1 > s2 { s1 } else { s2 }
}

fn next_weaker(strength: i32) -> i32 {
    match strength {
        0 => WEAKEST,
        1 => WEAK_DEFAULT,
        2 => NORMAL,
        3 => STRONG_DEFAULT,
        4 => PREFERRED,
        5 => REQUIRED,
        _ => WEAKEST,
    }
}

fn new_empty_constraint<'a>(planner: &Planner<'a>) -> ConstraintRef<'a> {
    planner.constraint_arena.alloc(Constraint::EmptyConstraint)
}

fn new_constraint_list<'a>(capacity: i32, planner: &Planner<'a>) -> ConstraintList<'a> {
    let mut items = Vec::with_capacity(capacity.max(0) as usize);
    let dummy = new_empty_constraint(planner);
    let mut i = 0;
    while i < capacity {
        items.push(dummy);
        i += 1;
    }
    ConstraintList { items, count: 0 }
}

fn new_variable<'a>(value: i32, constraint_capacity: i32, planner: &Planner<'a>) -> VariableRef<'a> {
    planner.variable_arena.alloc(Variable {
        value: Cell::new(value),
        constraints: UnsafeCell::new(new_constraint_list(constraint_capacity, planner)),
        determined_by: Cell::new(None),
        mark: Cell::new(0),
        walk_strength: Cell::new(WEAKEST),
        stay: Cell::new(true),
    })
}

fn new_variable_placeholder<'a>(planner: &Planner<'a>) -> VariableRef<'a> {
    new_variable(0, 1, planner)
}

fn new_variable_list<'a>(capacity: i32, planner: &Planner<'a>) -> VariableList<'a> {
    let mut items = Vec::with_capacity(capacity.max(0) as usize);
    let dummy = new_variable_placeholder(planner);
    let mut i = 0;
    while i < capacity {
        items.push(dummy);
        i += 1;
    }
    VariableList { items, count: 0 }
}

fn constraint_list_append<'a>(list: &mut ConstraintList<'a>, constraint: ConstraintRef<'a>) {
    assert!(
        list.count < list.items.len() as i32,
        "constraint list capacity exceeded"
    );
    list.items[list.count as usize] = constraint;
    list.count += 1;
}

fn constraint_list_pop_front<'a>(list: &mut ConstraintList<'a>) -> ConstraintRef<'a> {
    let constraint = list.items[0];
    let mut i = 0;
    while i + 1 < list.count {
        list.items[i as usize] = list.items[(i + 1) as usize];
        i += 1;
    }
    list.count -= 1;
    constraint
}

fn constraint_list_copy<'a>(src: &ConstraintList<'a>, capacity: i32, planner: &Planner<'a>) -> ConstraintList<'a> {
    let mut out = new_constraint_list(capacity, planner);
    let mut i = 0;
    while i < src.count {
        constraint_list_append(&mut out, src.items[i as usize]);
        i += 1;
    }
    out
}

fn variable_list_append<'a>(list: &mut VariableList<'a>, value: VariableRef<'a>) {
    assert!(
        list.count < list.items.len() as i32,
        "variable list capacity exceeded"
    );
    list.items[list.count as usize] = value;
    list.count += 1;
}

fn variable_list_pop_front<'a>(list: &mut VariableList<'a>) -> VariableRef<'a> {
    let value = list.items[0];
    let mut i = 0;
    while i + 1 < list.count {
        list.items[i as usize] = list.items[(i + 1) as usize];
        i += 1;
    }
    list.count -= 1;
    value
}

fn variable_constraints<'a>(variable: VariableRef<'a>) -> &'a ConstraintList<'a> {
    unsafe { &*variable.constraints.get() }
}

fn variable_constraints_mut<'a>(variable: VariableRef<'a>) -> &'a mut ConstraintList<'a> {
    unsafe { &mut *variable.constraints.get() }
}

fn variable_add_constraint<'a>(variable: VariableRef<'a>, constraint: ConstraintRef<'a>) {
    constraint_list_append(variable_constraints_mut(variable), constraint);
}

fn variable_remove_constraint<'a>(variable: VariableRef<'a>, constraint: ConstraintRef<'a>) {
    let mut found = -1;
    let count = variable_constraints(variable).count;
    let mut i = 0;
    while i < count {
        if found == -1 && std::ptr::eq(variable_constraints(variable).items[i as usize], constraint) {
            found = i;
        }
        i += 1;
    }

    if found != -1 {
        let mut slot = found;
        while slot + 1 < variable_constraints(variable).count {
            let next = variable_constraints(variable).items[(slot + 1) as usize];
            variable_constraints_mut(variable).items[slot as usize] = next;
            slot += 1;
        }
        variable_constraints_mut(variable).count -= 1;
    }

    if let Some(existing) = variable.determined_by.get() {
        if std::ptr::eq(existing, constraint) {
            variable.determined_by.set(None);
        }
    }
}

fn constraint_strength<'a>(constraint: ConstraintRef<'a>) -> i32 {
    match constraint {
        Constraint::EmptyConstraint => WEAKEST,
        Constraint::StayConstraint { strength, .. }
        | Constraint::EditConstraint { strength, .. }
        | Constraint::EqualityConstraint { strength, .. }
        | Constraint::ScaleConstraint { strength, .. } => *strength,
    }
}

fn constraint_is_input<'a>(constraint: ConstraintRef<'a>) -> bool {
    matches!(constraint, Constraint::EditConstraint { .. })
}

fn constraint_is_satisfied<'a>(constraint: ConstraintRef<'a>) -> bool {
    match constraint {
        Constraint::EmptyConstraint => false,
        Constraint::StayConstraint { satisfied, .. } | Constraint::EditConstraint { satisfied, .. } => {
            satisfied.get()
        }
        Constraint::EqualityConstraint { direction, .. } | Constraint::ScaleConstraint { direction, .. } => {
            direction.get() != DIRECTION_NONE
        }
    }
}

fn constraint_input<'a>(constraint: ConstraintRef<'a>) -> VariableRef<'a> {
    match constraint {
        Constraint::EqualityConstraint { v1, v2, direction, .. } => {
            if direction.get() == DIRECTION_FORWARD { *v1 } else { *v2 }
        }
        Constraint::ScaleConstraint { src, dest, direction, .. } => {
            if direction.get() == DIRECTION_FORWARD { *src } else { *dest }
        }
        Constraint::EmptyConstraint
        | Constraint::StayConstraint { .. }
        | Constraint::EditConstraint { .. } => panic!("constraint has no input"),
    }
}

fn constraint_output<'a>(constraint: ConstraintRef<'a>) -> VariableRef<'a> {
    match constraint {
        Constraint::StayConstraint { output, .. } | Constraint::EditConstraint { output, .. } => {
            *output
        }
        Constraint::EqualityConstraint { v1, v2, direction, .. } => {
            if direction.get() == DIRECTION_FORWARD { *v2 } else { *v1 }
        }
        Constraint::ScaleConstraint { src, dest, direction, .. } => {
            if direction.get() == DIRECTION_FORWARD { *dest } else { *src }
        }
        Constraint::EmptyConstraint => panic!("empty constraint has no output"),
    }
}

fn constraint_execute<'a>(constraint: ConstraintRef<'a>) {
    match constraint {
        Constraint::EmptyConstraint => panic!("empty constraint cannot execute"),
        Constraint::StayConstraint { .. } | Constraint::EditConstraint { .. } => {}
        Constraint::EqualityConstraint { .. } => {
            let input = constraint_input(constraint);
            let output = constraint_output(constraint);
            output.value.set(input.value.get());
        }
        Constraint::ScaleConstraint { src, scale, offset, dest, direction, .. } => {
            if direction.get() == DIRECTION_FORWARD {
                dest.value.set(src.value.get() * scale.value.get() + offset.value.get());
            } else {
                src.value.set((dest.value.get() - offset.value.get()) / scale.value.get());
            }
        }
    }
}

fn constraint_mark_unsatisfied<'a>(constraint: ConstraintRef<'a>) {
    match constraint {
        Constraint::EmptyConstraint => {}
        Constraint::StayConstraint { satisfied, .. } | Constraint::EditConstraint { satisfied, .. } => {
            satisfied.set(false);
        }
        Constraint::EqualityConstraint { direction, .. } | Constraint::ScaleConstraint { direction, .. } => {
            direction.set(DIRECTION_NONE);
        }
    }
}

fn constraint_add_to_graph<'a>(constraint: ConstraintRef<'a>) {
    match constraint {
        Constraint::EmptyConstraint => panic!("empty constraint cannot be added"),
        Constraint::StayConstraint { output, satisfied, .. } => {
            variable_add_constraint(*output, constraint);
            satisfied.set(false);
        }
        Constraint::EditConstraint { output, satisfied, .. } => {
            variable_add_constraint(*output, constraint);
            satisfied.set(false);
        }
        Constraint::EqualityConstraint { v1, v2, direction, .. } => {
            variable_add_constraint(*v1, constraint);
            variable_add_constraint(*v2, constraint);
            direction.set(DIRECTION_NONE);
        }
        Constraint::ScaleConstraint { src, scale, offset, dest, direction, .. } => {
            variable_add_constraint(*src, constraint);
            variable_add_constraint(*dest, constraint);
            variable_add_constraint(*scale, constraint);
            variable_add_constraint(*offset, constraint);
            direction.set(DIRECTION_NONE);
        }
    }
}

fn constraint_remove_from_graph<'a>(constraint: ConstraintRef<'a>) {
    match constraint {
        Constraint::EmptyConstraint => {}
        Constraint::StayConstraint { output, satisfied, .. } => {
            variable_remove_constraint(*output, constraint);
            satisfied.set(false);
        }
        Constraint::EditConstraint { output, satisfied, .. } => {
            variable_remove_constraint(*output, constraint);
            satisfied.set(false);
        }
        Constraint::EqualityConstraint { v1, v2, direction, .. } => {
            variable_remove_constraint(*v1, constraint);
            variable_remove_constraint(*v2, constraint);
            direction.set(DIRECTION_NONE);
        }
        Constraint::ScaleConstraint { src, scale, offset, dest, direction, .. } => {
            variable_remove_constraint(*src, constraint);
            variable_remove_constraint(*dest, constraint);
            variable_remove_constraint(*scale, constraint);
            variable_remove_constraint(*offset, constraint);
            direction.set(DIRECTION_NONE);
        }
    }
}

fn constraint_mark_inputs<'a>(constraint: ConstraintRef<'a>, mark: i32) {
    match constraint {
        Constraint::EmptyConstraint => panic!("empty constraint cannot mark inputs"),
        Constraint::StayConstraint { .. } | Constraint::EditConstraint { .. } => {}
        Constraint::EqualityConstraint { .. } => {
            constraint_input(constraint).mark.set(mark);
        }
        Constraint::ScaleConstraint { scale, offset, .. } => {
            constraint_input(constraint).mark.set(mark);
            scale.mark.set(mark);
            offset.mark.set(mark);
        }
    }
}

fn constraint_choose_method<'a>(constraint: ConstraintRef<'a>, mark: i32) {
    match constraint {
        Constraint::EmptyConstraint => panic!("empty constraint cannot choose a method"),
        Constraint::StayConstraint { output, strength, satisfied } => {
            let ok = if output.mark.get() != mark {
                stronger(*strength, output.walk_strength.get())
            } else {
                false
            };
            satisfied.set(ok);
        }
        Constraint::EditConstraint { output, strength, satisfied } => {
            let ok = if output.mark.get() != mark {
                stronger(*strength, output.walk_strength.get())
            } else {
                false
            };
            satisfied.set(ok);
        }
        Constraint::EqualityConstraint { v1, v2, strength, direction } => {
            let mut choice = DIRECTION_NONE;

            if v1.mark.get() == mark {
                if v2.mark.get() != mark {
                    if stronger(*strength, v2.walk_strength.get()) {
                        choice = DIRECTION_FORWARD;
                    } else {
                        choice = DIRECTION_BACKWARD;
                    }
                } else {
                    choice = DIRECTION_BACKWARD;
                }
            }

            if v2.mark.get() == mark {
                if v1.mark.get() != mark {
                    if stronger(*strength, v1.walk_strength.get()) {
                        choice = DIRECTION_BACKWARD;
                    } else {
                        choice = DIRECTION_NONE;
                    }
                } else {
                    choice = DIRECTION_NONE;
                }
            }

            if weaker(v1.walk_strength.get(), v2.walk_strength.get()) {
                if stronger(*strength, v1.walk_strength.get()) {
                    choice = DIRECTION_BACKWARD;
                } else {
                    choice = DIRECTION_NONE;
                }
            } else if stronger(*strength, v2.walk_strength.get()) {
                choice = DIRECTION_FORWARD;
            } else {
                choice = DIRECTION_BACKWARD;
            }

            direction.set(choice);
        }
        Constraint::ScaleConstraint { src, dest, strength, direction, .. } => {
            let mut choice = DIRECTION_NONE;

            if src.mark.get() == mark {
                if dest.mark.get() != mark {
                    if stronger(*strength, dest.walk_strength.get()) {
                        choice = DIRECTION_FORWARD;
                    } else {
                        choice = DIRECTION_BACKWARD;
                    }
                } else {
                    choice = DIRECTION_BACKWARD;
                }
            }

            if dest.mark.get() == mark {
                if src.mark.get() != mark {
                    if stronger(*strength, src.walk_strength.get()) {
                        choice = DIRECTION_BACKWARD;
                    } else {
                        choice = DIRECTION_NONE;
                    }
                } else {
                    choice = DIRECTION_NONE;
                }
            }

            if weaker(src.walk_strength.get(), dest.walk_strength.get()) {
                if stronger(*strength, src.walk_strength.get()) {
                    choice = DIRECTION_BACKWARD;
                } else {
                    choice = DIRECTION_NONE;
                }
            } else if stronger(*strength, dest.walk_strength.get()) {
                choice = DIRECTION_FORWARD;
            } else {
                choice = DIRECTION_BACKWARD;
            }

            direction.set(choice);
        }
    }
}

fn constraint_inputs_known<'a>(constraint: ConstraintRef<'a>, mark: i32) -> bool {
    match constraint {
        Constraint::EmptyConstraint => false,
        Constraint::StayConstraint { .. } | Constraint::EditConstraint { .. } => true,
        Constraint::EqualityConstraint { .. } | Constraint::ScaleConstraint { .. } => {
            let variable = constraint_input(constraint);
            if variable.mark.get() == mark {
                true
            } else if variable.stay.get() {
                true
            } else {
                variable.determined_by.get().is_none()
            }
        }
    }
}

fn constraint_recalculate<'a>(constraint: ConstraintRef<'a>) {
    match constraint {
        Constraint::EmptyConstraint => panic!("empty constraint cannot recalculate"),
        Constraint::StayConstraint { output, strength, .. } => {
            output.walk_strength.set(*strength);
            output.stay.set(!constraint_is_input(constraint));
            if output.stay.get() {
                constraint_execute(constraint);
            }
        }
        Constraint::EditConstraint { output, strength, .. } => {
            output.walk_strength.set(*strength);
            output.stay.set(!constraint_is_input(constraint));
            if output.stay.get() {
                constraint_execute(constraint);
            }
        }
        Constraint::EqualityConstraint { strength, .. } => {
            let input = constraint_input(constraint);
            let out = constraint_output(constraint);
            out.walk_strength.set(weakest_of(*strength, input.walk_strength.get()));
            out.stay.set(input.stay.get());
            if out.stay.get() {
                constraint_execute(constraint);
            }
        }
        Constraint::ScaleConstraint { scale, offset, strength, .. } => {
            let input = constraint_input(constraint);
            let out = constraint_output(constraint);
            let mut all_stay = false;
            out.walk_strength.set(weakest_of(*strength, input.walk_strength.get()));
            if input.stay.get() {
                if scale.stay.get() {
                    all_stay = offset.stay.get();
                }
            }
            out.stay.set(all_stay);
            if out.stay.get() {
                constraint_execute(constraint);
            }
        }
    }
}

fn planner_new_mark<'a>(planner: &mut Planner<'a>) -> i32 {
    planner.current_mark += 1;
    planner.current_mark
}

fn planner_add_constraints_consuming_to<'a>(variable: VariableRef<'a>, coll: &mut ConstraintList<'a>) {
    let determining = variable.determined_by.get();
    let count = variable_constraints(variable).count;
    let mut i = 0;
    while i < count {
        let constraint = variable_constraints(variable).items[i as usize];
        let same = if let Some(current) = determining {
            std::ptr::eq(constraint, current)
        } else {
            false
        };
        if !same && constraint_is_satisfied(constraint) {
            constraint_list_append(coll, constraint);
        }
        i += 1;
    }
}

fn planner_add_propagate<'a>(planner: &mut Planner<'a>, constraint: ConstraintRef<'a>, mark: i32) -> bool {
    let mut todo = new_constraint_list(planner.constraint_capacity, planner);
    constraint_list_append(&mut todo, constraint);

    while todo.count > 0 {
        let current = constraint_list_pop_front(&mut todo);
        if constraint_output(current).mark.get() == mark {
            planner_incremental_remove(planner, constraint);
            return false;
        }

        constraint_recalculate(current);
        planner_add_constraints_consuming_to(constraint_output(current), &mut todo);
    }

    true
}

fn planner_remove_propagate_from<'a>(planner: &Planner<'a>, out: VariableRef<'a>) -> ConstraintList<'a> {
    out.determined_by.set(None);
    out.walk_strength.set(WEAKEST);
    out.stay.set(true);

    let mut unsatisfied = new_constraint_list(planner.constraint_capacity, planner);
    let mut todo = new_variable_list(planner.variable_capacity, planner);
    variable_list_append(&mut todo, out);

    while todo.count > 0 {
        let variable = variable_list_pop_front(&mut todo);
        let determining = variable.determined_by.get();
        let count = variable_constraints(variable).count;

        let mut i = 0;
        while i < count {
            let constraint = variable_constraints(variable).items[i as usize];
            if !constraint_is_satisfied(constraint) {
                constraint_list_append(&mut unsatisfied, constraint);
            }
            i += 1;
        }

        i = 0;
        while i < count {
            let constraint = variable_constraints(variable).items[i as usize];
            let same = if let Some(current) = determining {
                std::ptr::eq(constraint, current)
            } else {
                false
            };
            if !same && constraint_is_satisfied(constraint) {
                constraint_recalculate(constraint);
                variable_list_append(&mut todo, constraint_output(constraint));
            }
            i += 1;
        }
    }

    unsatisfied
}

fn planner_incremental_add<'a>(planner: &mut Planner<'a>, constraint: ConstraintRef<'a>) {
    let mark = planner_new_mark(planner);
    let mut overridden = constraint_satisfy(constraint, planner, mark);

    while let Some(current) = overridden {
        overridden = constraint_satisfy(current, planner, mark);
    }
}

fn planner_incremental_remove<'a>(planner: &mut Planner<'a>, constraint: ConstraintRef<'a>) {
    let out = constraint_output(constraint);
    constraint_mark_unsatisfied(constraint);
    constraint_remove_from_graph(constraint);

    let unsatisfied = planner_remove_propagate_from(planner, out);
    let mut strength = REQUIRED;
    let mut repeat = true;

    while repeat {
        let mut i = 0;
        while i < unsatisfied.count {
            let current = unsatisfied.items[i as usize];
            if constraint_strength(current) == strength {
                planner_incremental_add(planner, current);
            }
            strength = next_weaker(strength);
            i += 1;
        }
        repeat = strength != WEAKEST;
    }
}

fn planner_make_plan<'a>(planner: &mut Planner<'a>, sources: &ConstraintList<'a>) -> ConstraintList<'a> {
    let mark = planner_new_mark(planner);
    let mut plan = new_constraint_list(planner.constraint_capacity, planner);
    let mut todo = constraint_list_copy(sources, planner.constraint_capacity, planner);

    while todo.count > 0 {
        let constraint = constraint_list_pop_front(&mut todo);
        let out = constraint_output(constraint);
        if out.mark.get() != mark && constraint_inputs_known(constraint, mark) {
            constraint_list_append(&mut plan, constraint);
            out.mark.set(mark);
            planner_add_constraints_consuming_to(out, &mut todo);
        }
    }

    plan
}

fn planner_extract_plan_from_constraints<'a>(
    planner: &mut Planner<'a>,
    constraints: &ConstraintList<'a>,
) -> ConstraintList<'a> {
    let mut sources = new_constraint_list(planner.constraint_capacity, planner);
    let mut i = 0;

    while i < constraints.count {
        let constraint = constraints.items[i as usize];
        if constraint_is_input(constraint) && constraint_is_satisfied(constraint) {
            constraint_list_append(&mut sources, constraint);
        }
        i += 1;
    }

    planner_make_plan(planner, &sources)
}

fn constraint_add_constraint<'a>(constraint: ConstraintRef<'a>, planner: &mut Planner<'a>) {
    constraint_add_to_graph(constraint);
    planner_incremental_add(planner, constraint);
}

fn constraint_satisfy<'a>(
    constraint: ConstraintRef<'a>,
    planner: &mut Planner<'a>,
    mark: i32,
) -> Option<ConstraintRef<'a>> {
    constraint_choose_method(constraint, mark);

    if !constraint_is_satisfied(constraint) {
        assert!(
            constraint_strength(constraint) != REQUIRED,
            "could not satisfy a required constraint"
        );
        None
    } else {
        constraint_mark_inputs(constraint, mark);
        let out = constraint_output(constraint);
        let overridden = out.determined_by.get();

        if let Some(current) = overridden {
            constraint_mark_unsatisfied(current);
        }

        out.determined_by.set(Some(constraint));

        assert!(
            planner_add_propagate(planner, constraint, mark),
            "cycle encountered"
        );

        out.mark.set(mark);
        overridden
    }
}

fn constraint_destroy<'a>(constraint: ConstraintRef<'a>, planner: &mut Planner<'a>) {
    if constraint_is_satisfied(constraint) {
        planner_incremental_remove(planner, constraint);
    } else {
        constraint_remove_from_graph(constraint);
    }
}

fn plan_execute<'a>(plan: &ConstraintList<'a>) {
    let mut i = 0;
    while i < plan.count {
        constraint_execute(plan.items[i as usize]);
        i += 1;
    }
}

fn new_stay_constraint<'a>(variable: VariableRef<'a>, strength: i32, planner: &mut Planner<'a>) -> ConstraintRef<'a> {
    let constraint = planner.constraint_arena.alloc(Constraint::StayConstraint {
        output: variable,
        strength,
        satisfied: Cell::new(false),
    });
    constraint_add_constraint(constraint, planner);
    constraint
}

fn new_edit_constraint<'a>(variable: VariableRef<'a>, strength: i32, planner: &mut Planner<'a>) -> ConstraintRef<'a> {
    let constraint = planner.constraint_arena.alloc(Constraint::EditConstraint {
        output: variable,
        strength,
        satisfied: Cell::new(false),
    });
    constraint_add_constraint(constraint, planner);
    constraint
}

fn new_equality_constraint<'a>(
    v1: VariableRef<'a>,
    v2: VariableRef<'a>,
    strength: i32,
    planner: &mut Planner<'a>,
) -> ConstraintRef<'a> {
    let constraint = planner.constraint_arena.alloc(Constraint::EqualityConstraint {
        v1,
        v2,
        strength,
        direction: Cell::new(DIRECTION_NONE),
    });
    constraint_add_constraint(constraint, planner);
    constraint
}

fn new_scale_constraint<'a>(
    src: VariableRef<'a>,
    scale: VariableRef<'a>,
    offset: VariableRef<'a>,
    dest: VariableRef<'a>,
    strength: i32,
    planner: &mut Planner<'a>,
) -> ConstraintRef<'a> {
    let constraint = planner.constraint_arena.alloc(Constraint::ScaleConstraint {
        src,
        scale,
        offset,
        dest,
        strength,
        direction: Cell::new(DIRECTION_NONE),
    });
    constraint_add_constraint(constraint, planner);
    constraint
}

fn change<'a>(planner: &mut Planner<'a>, variable: VariableRef<'a>, new_value: i32) {
    let edit = new_edit_constraint(variable, PREFERRED, planner);
    let mut edits = new_constraint_list(1, planner);
    constraint_list_append(&mut edits, edit);

    let plan = planner_extract_plan_from_constraints(planner, &edits);
    let mut i = 0;
    while i < 10 {
        variable.value.set(new_value);
        plan_execute(&plan);
        i += 1;
    }

    constraint_destroy(edit, planner);
}

fn chain_test(n: i32) -> i64 {
    let variable_arena = Arena::new();
    let constraint_arena = Arena::new();
    let mut planner = new_planner(n + 4, n + 4, &variable_arena, &constraint_arena);
    let mut prev: Option<VariableRef<'_>> = None;
    let mut first: Option<VariableRef<'_>> = None;
    let mut last: Option<VariableRef<'_>> = None;
    let mut i = 0;

    while i < n + 1 {
        let variable = new_variable(0, 2, &planner);

        if let Some(current_prev) = prev {
            new_equality_constraint(current_prev, variable, REQUIRED, &mut planner);
        }

        if i == 0 {
            first = Some(variable);
        }

        if i == n {
            last = Some(variable);
        }

        prev = Some(variable);
        i += 1;
    }

    let first_variable = first.expect("missing first variable");
    let last_variable = last.expect("missing last variable");
    new_stay_constraint(last_variable, STRONG_DEFAULT, &mut planner);

    let edit = new_edit_constraint(first_variable, PREFERRED, &mut planner);
    let mut edits = new_constraint_list(1, &planner);
    constraint_list_append(&mut edits, edit);
    let plan = planner_extract_plan_from_constraints(&mut planner, &edits);

    let mut failures = 0i64;
    i = 0;
    while i < 100 {
        first_variable.value.set(i);
        plan_execute(&plan);
        if last_variable.value.get() != i {
            failures += 1;
        }
        i += 1;
    }

    failures
}

fn projection_test(n: i32) -> i64 {
    let variable_arena = Arena::new();
    let constraint_arena = Arena::new();
    let mut planner = new_planner(n * 2 + 8, n * 2 + 8, &variable_arena, &constraint_arena);
    let scale = new_variable(10, n + 1, &planner);
    let offset = new_variable(1000, n + 1, &planner);
    let dummy = new_variable_placeholder(&planner);
    let mut src = dummy;
    let mut dst = dummy;
    let mut dests = vec![dummy; n as usize];
    let mut i = 0;

    while i < n {
        src = new_variable(i, 3, &planner);
        dst = new_variable(i, 2, &planner);
        dests[i as usize] = dst;
        new_stay_constraint(src, NORMAL, &mut planner);
        new_scale_constraint(src, scale, offset, dst, REQUIRED, &mut planner);
        i += 1;
    }

    let mut failures = 0i64;

    change(&mut planner, src, 17);
    if dst.value.get() != 1170 {
        failures += 1;
    }

    change(&mut planner, dst, 1050);
    if src.value.get() != 5 {
        failures += 1;
    }

    change(&mut planner, scale, 5);
    i = 0;
    while i < n - 1 {
        if dests[i as usize].value.get() != i * 5 + 1000 {
            failures += 1;
        }
        i += 1;
    }

    change(&mut planner, offset, 2000);
    i = 0;
    while i < n - 1 {
        if dests[i as usize].value.get() != i * 5 + 2000 {
            failures += 1;
        }
        i += 1;
    }

    failures
}

fn delta_blue_impl(n: i32) -> i64 {
    chain_test(n) + projection_test(n)
}

fn bench_chain_impl(iterations: i32) -> i64 {
    if iterations <= 0 {
        return 0;
    }

    let mut sink = 0i64;
    let mut i = 0;
    while i < iterations {
        sink += chain_test(1048);
        i += 1;
    }
    sink
}

fn bench_projection_impl(iterations: i32) -> i64 {
    if iterations <= 0 {
        return 0;
    }

    let mut sink = 0i64;
    let mut i = 0;
    while i < iterations {
        sink += projection_test(1048);
        i += 1;
    }
    sink
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
    bench_chain_impl(iterations)
}

#[no_mangle]
pub extern "C" fn bench_projection(iterations: i32) -> i64 {
    bench_projection_impl(iterations)
}

fn new_planner<'a>(
    variable_capacity: i32,
    constraint_capacity: i32,
    variable_arena: &'a Arena<Variable<'a>>,
    constraint_arena: &'a Arena<Constraint<'a>>,
) -> Planner<'a> {
    Planner {
        current_mark: 0,
        variable_capacity,
        constraint_capacity,
        constraint_arena,
        variable_arena,
    }
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
}
