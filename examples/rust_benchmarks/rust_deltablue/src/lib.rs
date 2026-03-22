#![allow(dead_code, unused_assignments)]

use std::cell::RefCell;
use std::rc::Rc;

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

type ConstraintRef = Rc<RefCell<Constraint>>;
type VariableRef = Rc<RefCell<Variable>>;

struct ConstraintList {
    items: Vec<ConstraintRef>,
    count: i32,
}

struct Variable {
    value: i32,
    constraints: ConstraintList,
    determined_by: Option<ConstraintRef>,
    mark: i32,
    walk_strength: i32,
    stay: bool,
}

struct VariableList {
    items: Vec<VariableRef>,
    count: i32,
}

struct Planner {
    current_mark: i32,
    constraint_capacity: i32,
    variable_capacity: i32,
}

#[derive(Clone)]
enum Constraint {
    EmptyConstraint,
    StayConstraint {
        output: VariableRef,
        strength: i32,
        satisfied: bool,
    },
    EditConstraint {
        output: VariableRef,
        strength: i32,
        satisfied: bool,
    },
    EqualityConstraint {
        v1: VariableRef,
        v2: VariableRef,
        strength: i32,
        direction: i32,
    },
    ScaleConstraint {
        src: VariableRef,
        scale: VariableRef,
        offset: VariableRef,
        dest: VariableRef,
        strength: i32,
        direction: i32,
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

fn new_empty_constraint() -> ConstraintRef {
    Rc::new(RefCell::new(Constraint::EmptyConstraint))
}

fn new_constraint_list(capacity: i32) -> ConstraintList {
    let dummy = new_empty_constraint();
    ConstraintList {
        items: vec![dummy; capacity as usize],
        count: 0,
    }
}

fn new_variable(value: i32, constraint_capacity: i32) -> VariableRef {
    Rc::new(RefCell::new(Variable {
        value,
        constraints: new_constraint_list(constraint_capacity),
        determined_by: None,
        mark: 0,
        walk_strength: WEAKEST,
        stay: true,
    }))
}

fn new_variable_placeholder() -> VariableRef {
    new_variable(0, 1)
}

fn new_variable_list(capacity: i32) -> VariableList {
    let dummy = new_variable_placeholder();
    VariableList {
        items: vec![dummy; capacity as usize],
        count: 0,
    }
}

fn new_planner(variable_capacity: i32, constraint_capacity: i32) -> Planner {
    Planner {
        current_mark: 0,
        variable_capacity,
        constraint_capacity,
    }
}

fn constraint_list_append(list: &mut ConstraintList, constraint: ConstraintRef) {
    assert!(
        list.count < list.items.len() as i32,
        "constraint list capacity exceeded"
    );
    list.items[list.count as usize] = constraint;
    list.count += 1;
}

fn constraint_list_pop_front(list: &mut ConstraintList) -> ConstraintRef {
    let constraint = list.items[0].clone();
    let mut i = 0;
    while i + 1 < list.count {
        list.items[i as usize] = list.items[(i + 1) as usize].clone();
        i += 1;
    }
    list.count -= 1;
    constraint
}

fn constraint_list_copy(src: &ConstraintList, capacity: i32) -> ConstraintList {
    let mut out = new_constraint_list(capacity);
    let mut i = 0;
    while i < src.count {
        constraint_list_append(&mut out, src.items[i as usize].clone());
        i += 1;
    }
    out
}

fn variable_list_append(list: &mut VariableList, value: VariableRef) {
    assert!(
        list.count < list.items.len() as i32,
        "variable list capacity exceeded"
    );
    list.items[list.count as usize] = value;
    list.count += 1;
}

fn variable_list_pop_front(list: &mut VariableList) -> VariableRef {
    let value = list.items[0].clone();
    let mut i = 0;
    while i + 1 < list.count {
        list.items[i as usize] = list.items[(i + 1) as usize].clone();
        i += 1;
    }
    list.count -= 1;
    value
}

fn variable_add_constraint(variable: &VariableRef, constraint: &ConstraintRef) {
    constraint_list_append(&mut variable.borrow_mut().constraints, constraint.clone());
}

fn variable_remove_constraint(variable: &VariableRef, constraint: &ConstraintRef) {
    let mut found = -1;
    let count = variable.borrow().constraints.count;
    let mut i = 0;
    while i < count {
        if found == -1
            && Rc::ptr_eq(
                &variable.borrow().constraints.items[i as usize],
                constraint,
            )
        {
            found = i;
        }
        i += 1;
    }

    if found != -1 {
        let mut slot = found;
        while slot + 1 < variable.borrow().constraints.count {
            let next = variable.borrow().constraints.items[(slot + 1) as usize].clone();
            variable.borrow_mut().constraints.items[slot as usize] = next;
            slot += 1;
        }
        variable.borrow_mut().constraints.count -= 1;
    }

    let determining = variable.borrow().determined_by.clone();
    if let Some(existing) = determining {
        if Rc::ptr_eq(&existing, constraint) {
            variable.borrow_mut().determined_by = None;
        }
    }
}

fn constraint_strength(constraint: &ConstraintRef) -> i32 {
    match &*constraint.borrow() {
        Constraint::EmptyConstraint => WEAKEST,
        Constraint::StayConstraint { strength, .. }
        | Constraint::EditConstraint { strength, .. }
        | Constraint::EqualityConstraint { strength, .. }
        | Constraint::ScaleConstraint { strength, .. } => *strength,
    }
}

fn constraint_is_input(constraint: &ConstraintRef) -> bool {
    matches!(&*constraint.borrow(), Constraint::EditConstraint { .. })
}

fn constraint_is_satisfied(constraint: &ConstraintRef) -> bool {
    match &*constraint.borrow() {
        Constraint::EmptyConstraint => false,
        Constraint::StayConstraint { satisfied, .. } | Constraint::EditConstraint { satisfied, .. } => {
            *satisfied
        }
        Constraint::EqualityConstraint { direction, .. } | Constraint::ScaleConstraint { direction, .. } => {
            *direction != DIRECTION_NONE
        }
    }
}

fn constraint_input(constraint: &ConstraintRef) -> VariableRef {
    match &*constraint.borrow() {
        Constraint::EqualityConstraint {
            v1, v2, direction, ..
        } => {
            if *direction == DIRECTION_FORWARD {
                v1.clone()
            } else {
                v2.clone()
            }
        }
        Constraint::ScaleConstraint {
            src,
            dest,
            direction,
            ..
        } => {
            if *direction == DIRECTION_FORWARD {
                src.clone()
            } else {
                dest.clone()
            }
        }
        Constraint::EmptyConstraint
        | Constraint::StayConstraint { .. }
        | Constraint::EditConstraint { .. } => panic!("constraint has no input"),
    }
}

fn constraint_output(constraint: &ConstraintRef) -> VariableRef {
    match &*constraint.borrow() {
        Constraint::StayConstraint { output, .. } | Constraint::EditConstraint { output, .. } => {
            output.clone()
        }
        Constraint::EqualityConstraint {
            v1, v2, direction, ..
        } => {
            if *direction == DIRECTION_FORWARD {
                v2.clone()
            } else {
                v1.clone()
            }
        }
        Constraint::ScaleConstraint {
            src,
            dest,
            direction,
            ..
        } => {
            if *direction == DIRECTION_FORWARD {
                dest.clone()
            } else {
                src.clone()
            }
        }
        Constraint::EmptyConstraint => panic!("empty constraint has no output"),
    }
}

fn constraint_execute(constraint: &ConstraintRef) {
    let current = constraint.borrow().clone();
    match current {
        Constraint::EmptyConstraint => panic!("empty constraint cannot execute"),
        Constraint::StayConstraint { .. } | Constraint::EditConstraint { .. } => {}
        Constraint::EqualityConstraint { .. } => {
            let input = constraint_input(constraint);
            let output = constraint_output(constraint);
            let value = input.borrow().value;
            output.borrow_mut().value = value;
        }
        Constraint::ScaleConstraint {
            src,
            scale,
            offset,
            dest,
            direction,
            ..
        } => {
            if direction == DIRECTION_FORWARD {
                dest.borrow_mut().value =
                    src.borrow().value * scale.borrow().value + offset.borrow().value;
            } else {
                src.borrow_mut().value =
                    (dest.borrow().value - offset.borrow().value) / scale.borrow().value;
            }
        }
    }
}

fn constraint_mark_unsatisfied(constraint: &ConstraintRef) {
    match &mut *constraint.borrow_mut() {
        Constraint::EmptyConstraint => {}
        Constraint::StayConstraint { satisfied, .. } | Constraint::EditConstraint { satisfied, .. } => {
            *satisfied = false;
        }
        Constraint::EqualityConstraint { direction, .. } | Constraint::ScaleConstraint { direction, .. } => {
            *direction = DIRECTION_NONE;
        }
    }
}

fn constraint_add_to_graph(constraint: &ConstraintRef) {
    let current = constraint.borrow().clone();
    match current {
        Constraint::EmptyConstraint => panic!("empty constraint cannot be added"),
        Constraint::StayConstraint { output, .. } => {
            variable_add_constraint(&output, constraint);
            if let Constraint::StayConstraint { satisfied, .. } = &mut *constraint.borrow_mut() {
                *satisfied = false;
            }
        }
        Constraint::EditConstraint { output, .. } => {
            variable_add_constraint(&output, constraint);
            if let Constraint::EditConstraint { satisfied, .. } = &mut *constraint.borrow_mut() {
                *satisfied = false;
            }
        }
        Constraint::EqualityConstraint { v1, v2, .. } => {
            variable_add_constraint(&v1, constraint);
            variable_add_constraint(&v2, constraint);
            if let Constraint::EqualityConstraint { direction, .. } = &mut *constraint.borrow_mut() {
                *direction = DIRECTION_NONE;
            }
        }
        Constraint::ScaleConstraint {
            src,
            scale,
            offset,
            dest,
            ..
        } => {
            variable_add_constraint(&src, constraint);
            variable_add_constraint(&dest, constraint);
            variable_add_constraint(&scale, constraint);
            variable_add_constraint(&offset, constraint);
            if let Constraint::ScaleConstraint { direction, .. } = &mut *constraint.borrow_mut() {
                *direction = DIRECTION_NONE;
            }
        }
    }
}

fn constraint_remove_from_graph(constraint: &ConstraintRef) {
    let current = constraint.borrow().clone();
    match current {
        Constraint::EmptyConstraint => {}
        Constraint::StayConstraint { output, .. } => {
            variable_remove_constraint(&output, constraint);
            if let Constraint::StayConstraint { satisfied, .. } = &mut *constraint.borrow_mut() {
                *satisfied = false;
            }
        }
        Constraint::EditConstraint { output, .. } => {
            variable_remove_constraint(&output, constraint);
            if let Constraint::EditConstraint { satisfied, .. } = &mut *constraint.borrow_mut() {
                *satisfied = false;
            }
        }
        Constraint::EqualityConstraint { v1, v2, .. } => {
            variable_remove_constraint(&v1, constraint);
            variable_remove_constraint(&v2, constraint);
            if let Constraint::EqualityConstraint { direction, .. } = &mut *constraint.borrow_mut() {
                *direction = DIRECTION_NONE;
            }
        }
        Constraint::ScaleConstraint {
            src,
            scale,
            offset,
            dest,
            ..
        } => {
            variable_remove_constraint(&src, constraint);
            variable_remove_constraint(&dest, constraint);
            variable_remove_constraint(&scale, constraint);
            variable_remove_constraint(&offset, constraint);
            if let Constraint::ScaleConstraint { direction, .. } = &mut *constraint.borrow_mut() {
                *direction = DIRECTION_NONE;
            }
        }
    }
}

fn constraint_mark_inputs(constraint: &ConstraintRef, mark: i32) {
    let current = constraint.borrow().clone();
    match current {
        Constraint::EmptyConstraint => panic!("empty constraint cannot mark inputs"),
        Constraint::StayConstraint { .. } | Constraint::EditConstraint { .. } => {}
        Constraint::EqualityConstraint { .. } => {
            constraint_input(constraint).borrow_mut().mark = mark;
        }
        Constraint::ScaleConstraint { scale, offset, .. } => {
            constraint_input(constraint).borrow_mut().mark = mark;
            scale.borrow_mut().mark = mark;
            offset.borrow_mut().mark = mark;
        }
    }
}

fn constraint_choose_method(constraint: &ConstraintRef, mark: i32) {
    let current = constraint.borrow().clone();
    match current {
        Constraint::EmptyConstraint => panic!("empty constraint cannot choose a method"),
        Constraint::StayConstraint {
            output, strength, ..
        } => {
            let satisfied = if output.borrow().mark != mark {
                stronger(strength, output.borrow().walk_strength)
            } else {
                false
            };
            if let Constraint::StayConstraint { satisfied: slot, .. } = &mut *constraint.borrow_mut() {
                *slot = satisfied;
            }
        }
        Constraint::EditConstraint {
            output, strength, ..
        } => {
            let satisfied = if output.borrow().mark != mark {
                stronger(strength, output.borrow().walk_strength)
            } else {
                false
            };
            if let Constraint::EditConstraint { satisfied: slot, .. } = &mut *constraint.borrow_mut() {
                *slot = satisfied;
            }
        }
        Constraint::EqualityConstraint {
            v1, v2, strength, ..
        } => {
            let mut direction = DIRECTION_NONE;

            if v1.borrow().mark == mark {
                if v2.borrow().mark != mark {
                    if stronger(strength, v2.borrow().walk_strength) {
                        direction = DIRECTION_FORWARD;
                    } else {
                        direction = DIRECTION_BACKWARD;
                    }
                } else {
                    direction = DIRECTION_BACKWARD;
                }
            }

            if v2.borrow().mark == mark {
                if v1.borrow().mark != mark {
                    if stronger(strength, v1.borrow().walk_strength) {
                        direction = DIRECTION_BACKWARD;
                    } else {
                        direction = DIRECTION_NONE;
                    }
                } else {
                    direction = DIRECTION_NONE;
                }
            }

            if weaker(v1.borrow().walk_strength, v2.borrow().walk_strength) {
                if stronger(strength, v1.borrow().walk_strength) {
                    direction = DIRECTION_BACKWARD;
                } else {
                    direction = DIRECTION_NONE;
                }
            } else if stronger(strength, v2.borrow().walk_strength) {
                direction = DIRECTION_FORWARD;
            } else {
                direction = DIRECTION_BACKWARD;
            }

            if let Constraint::EqualityConstraint { direction: slot, .. } = &mut *constraint.borrow_mut() {
                *slot = direction;
            }
        }
        Constraint::ScaleConstraint {
            src,
            dest,
            strength,
            ..
        } => {
            let mut direction = DIRECTION_NONE;

            if src.borrow().mark == mark {
                if dest.borrow().mark != mark {
                    if stronger(strength, dest.borrow().walk_strength) {
                        direction = DIRECTION_FORWARD;
                    } else {
                        direction = DIRECTION_BACKWARD;
                    }
                } else {
                    direction = DIRECTION_BACKWARD;
                }
            }

            if dest.borrow().mark == mark {
                if src.borrow().mark != mark {
                    if stronger(strength, src.borrow().walk_strength) {
                        direction = DIRECTION_BACKWARD;
                    } else {
                        direction = DIRECTION_NONE;
                    }
                } else {
                    direction = DIRECTION_NONE;
                }
            }

            if weaker(src.borrow().walk_strength, dest.borrow().walk_strength) {
                if stronger(strength, src.borrow().walk_strength) {
                    direction = DIRECTION_BACKWARD;
                } else {
                    direction = DIRECTION_NONE;
                }
            } else if stronger(strength, dest.borrow().walk_strength) {
                direction = DIRECTION_FORWARD;
            } else {
                direction = DIRECTION_BACKWARD;
            }

            if let Constraint::ScaleConstraint { direction: slot, .. } = &mut *constraint.borrow_mut() {
                *slot = direction;
            }
        }
    }
}

fn constraint_inputs_known(constraint: &ConstraintRef, mark: i32) -> bool {
    let current = constraint.borrow().clone();
    match current {
        Constraint::EmptyConstraint => false,
        Constraint::StayConstraint { .. } | Constraint::EditConstraint { .. } => true,
        Constraint::EqualityConstraint { .. } | Constraint::ScaleConstraint { .. } => {
            let input = constraint_input(constraint);
            let variable = input.borrow();
            if variable.mark == mark {
                true
            } else if variable.stay {
                true
            } else {
                variable.determined_by.is_none()
            }
        }
    }
}

fn constraint_recalculate(constraint: &ConstraintRef) {
    let current = constraint.borrow().clone();
    match current {
        Constraint::EmptyConstraint => panic!("empty constraint cannot recalculate"),
        Constraint::StayConstraint {
            output, strength, ..
        } => {
            output.borrow_mut().walk_strength = strength;
            output.borrow_mut().stay = !constraint_is_input(constraint);
            if output.borrow().stay {
                constraint_execute(constraint);
            }
        }
        Constraint::EditConstraint {
            output, strength, ..
        } => {
            output.borrow_mut().walk_strength = strength;
            output.borrow_mut().stay = !constraint_is_input(constraint);
            if output.borrow().stay {
                constraint_execute(constraint);
            }
        }
        Constraint::EqualityConstraint { strength, .. } => {
            let input = constraint_input(constraint);
            let out = constraint_output(constraint);
            out.borrow_mut().walk_strength = weakest_of(strength, input.borrow().walk_strength);
            out.borrow_mut().stay = input.borrow().stay;
            if out.borrow().stay {
                constraint_execute(constraint);
            }
        }
        Constraint::ScaleConstraint {
            scale,
            offset,
            strength,
            ..
        } => {
            let input = constraint_input(constraint);
            let out = constraint_output(constraint);
            let mut all_stay = false;
            out.borrow_mut().walk_strength = weakest_of(strength, input.borrow().walk_strength);
            if input.borrow().stay {
                if scale.borrow().stay {
                    all_stay = offset.borrow().stay;
                }
            }
            out.borrow_mut().stay = all_stay;
            if out.borrow().stay {
                constraint_execute(constraint);
            }
        }
    }
}

fn planner_new_mark(planner: &mut Planner) -> i32 {
    planner.current_mark += 1;
    planner.current_mark
}

fn planner_add_constraints_consuming_to(variable: &VariableRef, coll: &mut ConstraintList) {
    let determining = variable.borrow().determined_by.clone();
    let count = variable.borrow().constraints.count;
    let mut i = 0;
    while i < count {
        let constraint = variable.borrow().constraints.items[i as usize].clone();
        let same = if let Some(current) = &determining {
            Rc::ptr_eq(&constraint, current)
        } else {
            false
        };
        if !same && constraint_is_satisfied(&constraint) {
            constraint_list_append(coll, constraint);
        }
        i += 1;
    }
}

fn planner_add_propagate(planner: &mut Planner, constraint: &ConstraintRef, mark: i32) -> bool {
    let mut todo = new_constraint_list(planner.constraint_capacity);
    constraint_list_append(&mut todo, constraint.clone());

    while todo.count > 0 {
        let current = constraint_list_pop_front(&mut todo);
        if constraint_output(&current).borrow().mark == mark {
            planner_incremental_remove(planner, constraint);
            return false;
        }

        constraint_recalculate(&current);
        planner_add_constraints_consuming_to(&constraint_output(&current), &mut todo);
    }

    true
}

fn planner_remove_propagate_from(planner: &Planner, out: &VariableRef) -> ConstraintList {
    out.borrow_mut().determined_by = None;
    out.borrow_mut().walk_strength = WEAKEST;
    out.borrow_mut().stay = true;

    let mut unsatisfied = new_constraint_list(planner.constraint_capacity);
    let mut todo = new_variable_list(planner.variable_capacity);
    variable_list_append(&mut todo, out.clone());

    while todo.count > 0 {
        let variable = variable_list_pop_front(&mut todo);
        let determining = variable.borrow().determined_by.clone();
        let count = variable.borrow().constraints.count;

        let mut i = 0;
        while i < count {
            let constraint = variable.borrow().constraints.items[i as usize].clone();
            if !constraint_is_satisfied(&constraint) {
                constraint_list_append(&mut unsatisfied, constraint);
            }
            i += 1;
        }

        i = 0;
        while i < count {
            let constraint = variable.borrow().constraints.items[i as usize].clone();
            let same = if let Some(current) = &determining {
                Rc::ptr_eq(&constraint, current)
            } else {
                false
            };
            if !same && constraint_is_satisfied(&constraint) {
                constraint_recalculate(&constraint);
                variable_list_append(&mut todo, constraint_output(&constraint));
            }
            i += 1;
        }
    }

    unsatisfied
}

fn planner_incremental_add(planner: &mut Planner, constraint: &ConstraintRef) {
    let mark = planner_new_mark(planner);
    let mut overridden = constraint_satisfy(constraint, planner, mark);

    while let Some(current) = overridden {
        overridden = constraint_satisfy(&current, planner, mark);
    }
}

fn planner_incremental_remove(planner: &mut Planner, constraint: &ConstraintRef) {
    let out = constraint_output(constraint);
    constraint_mark_unsatisfied(constraint);
    constraint_remove_from_graph(constraint);

    let unsatisfied = planner_remove_propagate_from(planner, &out);
    let mut strength = REQUIRED;
    let mut repeat = true;

    while repeat {
        let mut i = 0;
        while i < unsatisfied.count {
            let current = unsatisfied.items[i as usize].clone();
            if constraint_strength(&current) == strength {
                planner_incremental_add(planner, &current);
            }
            strength = next_weaker(strength);
            i += 1;
        }
        repeat = strength != WEAKEST;
    }
}

fn planner_make_plan(planner: &mut Planner, sources: &ConstraintList) -> ConstraintList {
    let mark = planner_new_mark(planner);
    let mut plan = new_constraint_list(planner.constraint_capacity);
    let mut todo = constraint_list_copy(sources, planner.constraint_capacity);

    while todo.count > 0 {
        let constraint = constraint_list_pop_front(&mut todo);
        let out = constraint_output(&constraint);
        if out.borrow().mark != mark && constraint_inputs_known(&constraint, mark) {
            constraint_list_append(&mut plan, constraint.clone());
            out.borrow_mut().mark = mark;
            planner_add_constraints_consuming_to(&out, &mut todo);
        }
    }

    plan
}

fn planner_extract_plan_from_constraints(
    planner: &mut Planner,
    constraints: &ConstraintList,
) -> ConstraintList {
    let mut sources = new_constraint_list(planner.constraint_capacity);
    let mut i = 0;

    while i < constraints.count {
        let constraint = constraints.items[i as usize].clone();
        if constraint_is_input(&constraint) && constraint_is_satisfied(&constraint) {
            constraint_list_append(&mut sources, constraint);
        }
        i += 1;
    }

    planner_make_plan(planner, &sources)
}

fn constraint_add_constraint(constraint: &ConstraintRef, planner: &mut Planner) {
    constraint_add_to_graph(constraint);
    planner_incremental_add(planner, constraint);
}

fn constraint_satisfy(
    constraint: &ConstraintRef,
    planner: &mut Planner,
    mark: i32,
) -> Option<ConstraintRef> {
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
        let overridden = out.borrow().determined_by.clone();

        if let Some(current) = &overridden {
            constraint_mark_unsatisfied(current);
        }

        out.borrow_mut().determined_by = Some(constraint.clone());

        assert!(
            planner_add_propagate(planner, constraint, mark),
            "cycle encountered"
        );

        out.borrow_mut().mark = mark;
        overridden
    }
}

fn constraint_destroy(constraint: &ConstraintRef, planner: &mut Planner) {
    if constraint_is_satisfied(constraint) {
        planner_incremental_remove(planner, constraint);
    } else {
        constraint_remove_from_graph(constraint);
    }
}

fn plan_execute(plan: &ConstraintList) {
    let mut i = 0;
    while i < plan.count {
        constraint_execute(&plan.items[i as usize]);
        i += 1;
    }
}

fn new_stay_constraint(variable: &VariableRef, strength: i32, planner: &mut Planner) -> ConstraintRef {
    let constraint = Rc::new(RefCell::new(Constraint::StayConstraint {
        output: variable.clone(),
        strength,
        satisfied: false,
    }));
    constraint_add_constraint(&constraint, planner);
    constraint
}

fn new_edit_constraint(variable: &VariableRef, strength: i32, planner: &mut Planner) -> ConstraintRef {
    let constraint = Rc::new(RefCell::new(Constraint::EditConstraint {
        output: variable.clone(),
        strength,
        satisfied: false,
    }));
    constraint_add_constraint(&constraint, planner);
    constraint
}

fn new_equality_constraint(
    v1: &VariableRef,
    v2: &VariableRef,
    strength: i32,
    planner: &mut Planner,
) -> ConstraintRef {
    let constraint = Rc::new(RefCell::new(Constraint::EqualityConstraint {
        v1: v1.clone(),
        v2: v2.clone(),
        strength,
        direction: DIRECTION_NONE,
    }));
    constraint_add_constraint(&constraint, planner);
    constraint
}

fn new_scale_constraint(
    src: &VariableRef,
    scale: &VariableRef,
    offset: &VariableRef,
    dest: &VariableRef,
    strength: i32,
    planner: &mut Planner,
) -> ConstraintRef {
    let constraint = Rc::new(RefCell::new(Constraint::ScaleConstraint {
        src: src.clone(),
        scale: scale.clone(),
        offset: offset.clone(),
        dest: dest.clone(),
        strength,
        direction: DIRECTION_NONE,
    }));
    constraint_add_constraint(&constraint, planner);
    constraint
}

fn change(planner: &mut Planner, variable: &VariableRef, new_value: i32) {
    let edit = new_edit_constraint(variable, PREFERRED, planner);
    let mut edits = new_constraint_list(1);
    constraint_list_append(&mut edits, edit.clone());

    let plan = planner_extract_plan_from_constraints(planner, &edits);
    let mut i = 0;
    while i < 10 {
        variable.borrow_mut().value = new_value;
        plan_execute(&plan);
        i += 1;
    }

    constraint_destroy(&edit, planner);
}

fn chain_test(n: i32) -> i64 {
    let mut planner = new_planner(n + 4, n + 4);
    let mut prev: Option<VariableRef> = None;
    let mut first: Option<VariableRef> = None;
    let mut last: Option<VariableRef> = None;
    let mut i = 0;

    while i < n + 1 {
        let variable = new_variable(0, 2);

        if let Some(current_prev) = &prev {
            new_equality_constraint(current_prev, &variable, REQUIRED, &mut planner);
        }

        if i == 0 {
            first = Some(variable.clone());
        }

        if i == n {
            last = Some(variable.clone());
        }

        prev = Some(variable);
        i += 1;
    }

    let first_variable = first.expect("missing first variable");
    let last_variable = last.expect("missing last variable");
    new_stay_constraint(&last_variable, STRONG_DEFAULT, &mut planner);

    let edit = new_edit_constraint(&first_variable, PREFERRED, &mut planner);
    let mut edits = new_constraint_list(1);
    constraint_list_append(&mut edits, edit);
    let plan = planner_extract_plan_from_constraints(&mut planner, &edits);

    let mut failures = 0i64;
    i = 0;
    while i < 100 {
        first_variable.borrow_mut().value = i;
        plan_execute(&plan);
        if last_variable.borrow().value != i {
            failures += 1;
        }
        i += 1;
    }

    failures
}

fn projection_test(n: i32) -> i64 {
    let mut planner = new_planner(n * 2 + 8, n * 2 + 8);
    let scale = new_variable(10, n + 1);
    let offset = new_variable(1000, n + 1);
    let dummy = new_variable_placeholder();
    let mut src = dummy.clone();
    let mut dst = dummy.clone();
    let mut dests = vec![dummy; n as usize];
    let mut i = 0;

    while i < n {
        src = new_variable(i, 3);
        dst = new_variable(i, 2);
        dests[i as usize] = dst.clone();
        new_stay_constraint(&src, NORMAL, &mut planner);
        new_scale_constraint(&src, &scale, &offset, &dst, REQUIRED, &mut planner);
        i += 1;
    }

    let mut failures = 0i64;

    change(&mut planner, &src, 17);
    if dst.borrow().value != 1170 {
        failures += 1;
    }

    change(&mut planner, &dst, 1050);
    if src.borrow().value != 5 {
        failures += 1;
    }

    change(&mut planner, &scale, 5);
    i = 0;
    while i < n - 1 {
        if dests[i as usize].borrow().value != i * 5 + 1000 {
            failures += 1;
        }
        i += 1;
    }

    change(&mut planner, &offset, 2000);
    i = 0;
    while i < n - 1 {
        if dests[i as usize].borrow().value != i * 5 + 2000 {
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
