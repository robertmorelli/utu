// DeltaBlue, the incremental constraint solver (V8's deltablue.js / Dart's
// DeltaBlue.dart), in idiomatic Go: pointers to structs, one Constraint
// interface implemented by concrete constraint types that embed shared
// unary/binary structs, slices for lists, nil for absent. Worklists are
// slice stacks.
package main

// ---------------------------------------------------------------------------
// Strength

type Strength int

const (
	Required Strength = iota
	StrongPreferred
	Preferred
	StrongDefault
	Normal
	WeakDefault
	Weakest
)

func (s Strength) stronger(other Strength) bool { return s < other }
func (s Strength) weaker(other Strength) bool   { return s > other }

func (s Strength) weakestOf(other Strength) Strength {
	if s.weaker(other) {
		return s
	}
	return other
}

// nextWeaker is the canonical (and deliberately inverted) successor table.
func (s Strength) nextWeaker() Strength {
	switch s {
	case Required:
		return Weakest
	case StrongPreferred:
		return WeakDefault
	case Preferred:
		return Normal
	case StrongDefault:
		return StrongDefault
	case Normal:
		return Preferred
	case WeakDefault:
		return Required
	default:
		panic("no weaker strength")
	}
}

type Direction int

const (
	None Direction = iota
	Forward
	Backward
)

// ---------------------------------------------------------------------------
// Variable

type Variable struct {
	value        int
	constraints  []Constraint
	determinedBy Constraint
	mark         int
	walkStrength Strength
	stay         bool
}

func NewVariable(value int) *Variable {
	return &Variable{value: value, walkStrength: Weakest, stay: true}
}

func (v *Variable) addConstraint(c Constraint) { v.constraints = append(v.constraints, c) }

// removeConstraint removes every occurrence of c, in place.
func (v *Variable) removeConstraint(c Constraint) {
	constraints := v.constraints
	kept := 0
	for i, x := range constraints {
		if x != c {
			if kept != i {
				constraints[kept] = x
			}
			kept++
		}
	}
	clear(constraints[kept:])
	v.constraints = constraints[:kept]
	if v.determinedBy == c {
		v.determinedBy = nil
	}
}

// ---------------------------------------------------------------------------
// Constraint

type Constraint interface {
	strength() Strength
	addToGraph()
	removeFromGraph()
	chooseMethod(mark int)
	isSatisfied() bool
	markInputs(mark int)
	output() *Variable
	recalculate()
	markUnsatisfied()
	inputsKnown(mark int) bool
	execute()
	isInput() bool
}

// addConstraint adds c to the graph and satisfies it if it can.
func addConstraint(c Constraint, planner *Planner) {
	c.addToGraph()
	planner.incrementalAdd(c)
}

// satisfy satisfies c if it can, returning the constraint it overrode, if any.
func satisfy(c Constraint, mark int, planner *Planner) Constraint {
	c.chooseMethod(mark)
	if !c.isSatisfied() {
		if c.strength() == Required {
			panic("Could not satisfy a required constraint!")
		}
		return nil
	}
	c.markInputs(mark)
	out := c.output()
	overridden := out.determinedBy
	if overridden != nil {
		overridden.markUnsatisfied()
	}
	out.determinedBy = c
	if !planner.addPropagate(c, mark) {
		panic("Cycle encountered")
	}
	out.mark = mark
	return overridden
}

func destroyConstraint(c Constraint, planner *Planner) {
	if c.isSatisfied() {
		planner.incrementalRemove(c)
	} else {
		c.removeFromGraph()
	}
}

// ---------------------------------------------------------------------------
// Unary constraints: Stay and Edit

type UnaryConstraint struct {
	str       Strength
	myOutput  *Variable
	satisfied bool
	edit      bool // an EditConstraint is an input; a StayConstraint is not
}

func newUnaryConstraint(v *Variable, strength Strength, edit bool, planner *Planner) *UnaryConstraint {
	c := &UnaryConstraint{str: strength, myOutput: v, edit: edit}
	addConstraint(c, planner)
	return c
}

func NewStayConstraint(v *Variable, strength Strength, planner *Planner) *UnaryConstraint {
	return newUnaryConstraint(v, strength, false, planner)
}

func NewEditConstraint(v *Variable, strength Strength, planner *Planner) *UnaryConstraint {
	return newUnaryConstraint(v, strength, true, planner)
}

func (c *UnaryConstraint) strength() Strength { return c.str }
func (c *UnaryConstraint) isInput() bool      { return c.edit }

func (c *UnaryConstraint) addToGraph() {
	c.myOutput.addConstraint(c)
	c.satisfied = false
}

func (c *UnaryConstraint) chooseMethod(mark int) {
	c.satisfied = c.myOutput.mark != mark && c.str.stronger(c.myOutput.walkStrength)
}

func (c *UnaryConstraint) isSatisfied() bool   { return c.satisfied }
func (c *UnaryConstraint) markInputs(mark int) {}
func (c *UnaryConstraint) output() *Variable   { return c.myOutput }

func (c *UnaryConstraint) recalculate() {
	c.myOutput.walkStrength = c.str
	c.myOutput.stay = !c.isInput()
	if c.myOutput.stay {
		c.execute()
	}
}

func (c *UnaryConstraint) markUnsatisfied()          { c.satisfied = false }
func (c *UnaryConstraint) inputsKnown(mark int) bool { return true }

func (c *UnaryConstraint) removeFromGraph() {
	c.myOutput.removeConstraint(c)
	c.satisfied = false
}

func (c *UnaryConstraint) execute() {}

// ---------------------------------------------------------------------------
// Binary constraints: Equality and Scale share BinaryConstraint, which on its
// own is incomplete (each kind supplies execute and recalculate). Go has no
// virtual dispatch through embedding, so the shared part keeps the concrete
// constraint it belongs to, which is what variables list.

type BinaryConstraint struct {
	str       Strength
	v1, v2    *Variable
	direction Direction
	self      Constraint
}

func (c *BinaryConstraint) strength() Strength { return c.str }
func (c *BinaryConstraint) isInput() bool      { return false }

func (c *BinaryConstraint) chooseMethod(mark int) {
	direction := None
	if c.v1.mark == mark {
		if c.v2.mark != mark && c.str.stronger(c.v2.walkStrength) {
			direction = Forward
		} else {
			direction = None
		}
	}
	if c.v2.mark == mark {
		if c.v1.mark != mark && c.str.stronger(c.v1.walkStrength) {
			direction = Backward
		} else {
			direction = None
		}
	}
	if c.v1.walkStrength.weaker(c.v2.walkStrength) {
		if c.str.stronger(c.v1.walkStrength) {
			direction = Backward
		} else {
			direction = None
		}
	} else {
		if c.str.stronger(c.v2.walkStrength) {
			direction = Forward
		} else {
			direction = Backward
		}
	}
	c.direction = direction
}

func (c *BinaryConstraint) addToGraph() {
	c.v1.addConstraint(c.self)
	c.v2.addConstraint(c.self)
	c.direction = None
}

func (c *BinaryConstraint) isSatisfied() bool   { return c.direction != None }
func (c *BinaryConstraint) markInputs(mark int) { c.input().mark = mark }

func (c *BinaryConstraint) input() *Variable {
	if c.direction == Forward {
		return c.v1
	}
	return c.v2
}

func (c *BinaryConstraint) output() *Variable {
	if c.direction == Forward {
		return c.v2
	}
	return c.v1
}

func (c *BinaryConstraint) markUnsatisfied() { c.direction = None }

func (c *BinaryConstraint) inputsKnown(mark int) bool {
	i := c.input()
	return i.mark == mark || i.stay || i.determinedBy == nil
}

func (c *BinaryConstraint) removeFromGraph() {
	c.v1.removeConstraint(c.self)
	c.v2.removeConstraint(c.self)
	c.direction = None
}

type ScaleConstraint struct {
	BinaryConstraint
	scale, offset *Variable
}

func NewScaleConstraint(src, scale, offset, dest *Variable, strength Strength, planner *Planner) *ScaleConstraint {
	c := &ScaleConstraint{
		BinaryConstraint: BinaryConstraint{str: strength, v1: src, v2: dest, direction: None},
		scale:            scale,
		offset:           offset,
	}
	c.self = c
	addConstraint(c, planner)
	return c
}

func (c *ScaleConstraint) addToGraph() {
	c.BinaryConstraint.addToGraph()
	c.scale.addConstraint(c)
	c.offset.addConstraint(c)
}

func (c *ScaleConstraint) removeFromGraph() {
	c.BinaryConstraint.removeFromGraph()
	c.scale.removeConstraint(c)
	c.offset.removeConstraint(c)
}

func (c *ScaleConstraint) markInputs(mark int) {
	c.BinaryConstraint.markInputs(mark)
	c.scale.mark = mark
	c.offset.mark = mark
}

func (c *ScaleConstraint) execute() {
	if c.direction == Forward {
		c.v2.value = c.v1.value*c.scale.value + c.offset.value
	} else {
		c.v1.value = (c.v2.value - c.offset.value) / c.scale.value
	}
}

func (c *ScaleConstraint) recalculate() {
	ihn := c.input()
	out := c.output()
	out.walkStrength = c.str.weakestOf(ihn.walkStrength)
	out.stay = ihn.stay && c.scale.stay && c.offset.stay
	if out.stay {
		c.execute()
	}
}

type EqualityConstraint struct {
	BinaryConstraint
}

func NewEqualityConstraint(var1, var2 *Variable, strength Strength, planner *Planner) *EqualityConstraint {
	c := &EqualityConstraint{BinaryConstraint{str: strength, v1: var1, v2: var2, direction: None}}
	c.self = c
	addConstraint(c, planner)
	return c
}

func (c *EqualityConstraint) execute() { c.output().value = c.input().value }

func (c *EqualityConstraint) recalculate() {
	ihn := c.input()
	out := c.output()
	out.walkStrength = c.str.weakestOf(ihn.walkStrength)
	out.stay = ihn.stay
	if out.stay {
		c.execute()
	}
}

// ---------------------------------------------------------------------------
// Planner

type Planner struct {
	currentMark int
}

func (p *Planner) newMark() int {
	p.currentMark++
	return p.currentMark
}

func (p *Planner) incrementalAdd(c Constraint) {
	mark := p.newMark()
	overridden := satisfy(c, mark, p)
	for overridden != nil {
		overridden = satisfy(overridden, mark, p)
	}
}

func (p *Planner) incrementalRemove(c Constraint) {
	out := c.output()
	c.markUnsatisfied()
	c.removeFromGraph()
	unsatisfied := p.removePropagateFrom(out)
	strength := Required
	for {
		for _, u := range unsatisfied {
			if u.strength() == strength {
				p.incrementalAdd(u)
			}
		}
		strength = strength.nextWeaker()
		if strength == Weakest {
			break
		}
	}
}

func (p *Planner) makePlan(sources []Constraint) []Constraint {
	mark := p.newMark()
	var plan []Constraint
	todo := sources
	for len(todo) > 0 {
		c := todo[len(todo)-1]
		todo = todo[:len(todo)-1]
		out := c.output()
		if out.mark != mark && c.inputsKnown(mark) {
			plan = append(plan, c)
			out.mark = mark
			todo = p.addConstraintsConsumingTo(out, todo)
		}
	}
	return plan
}

func (p *Planner) extractPlanFromConstraints(constraints []Constraint) []Constraint {
	var sources []Constraint
	for _, c := range constraints {
		if c.isInput() && c.isSatisfied() {
			sources = append(sources, c)
		}
	}
	return p.makePlan(sources)
}

func (p *Planner) addPropagate(c Constraint, mark int) bool {
	todo := []Constraint{c}
	for len(todo) > 0 {
		d := todo[len(todo)-1]
		todo = todo[:len(todo)-1]
		out := d.output()
		if out.mark == mark {
			p.incrementalRemove(c)
			return false
		}
		d.recalculate()
		todo = p.addConstraintsConsumingTo(out, todo)
	}
	return true
}

func (p *Planner) removePropagateFrom(out *Variable) []Constraint {
	out.determinedBy = nil
	out.walkStrength = Weakest
	out.stay = true
	var unsatisfied []Constraint
	todo := []*Variable{out}
	for len(todo) > 0 {
		v := todo[len(todo)-1]
		todo = todo[:len(todo)-1]
		for _, c := range v.constraints {
			if !c.isSatisfied() {
				unsatisfied = append(unsatisfied, c)
			}
		}
		determining := v.determinedBy
		for _, c := range v.constraints {
			if c != determining && c.isSatisfied() {
				c.recalculate()
				todo = append(todo, c.output())
			}
		}
	}
	return unsatisfied
}

// addConstraintsConsumingTo appends to coll the satisfied constraints that
// consume v, and returns the grown slice.
func (p *Planner) addConstraintsConsumingTo(v *Variable, coll []Constraint) []Constraint {
	determining := v.determinedBy
	for _, c := range v.constraints {
		if c != determining && c.isSatisfied() {
			coll = append(coll, c)
		}
	}
	return coll
}

func executePlan(plan []Constraint) {
	for _, c := range plan {
		c.execute()
	}
}

// ---------------------------------------------------------------------------
// Tests

func chainTest(n int) int {
	planner := &Planner{}
	failures := 0
	var prev, first, last *Variable
	for i := 0; i <= n; i++ {
		v := NewVariable(0)
		if prev != nil {
			NewEqualityConstraint(prev, v, Required, planner)
		}
		if i == 0 {
			first = v
		}
		if i == n {
			last = v
		}
		prev = v
	}
	NewStayConstraint(last, StrongDefault, planner)
	edit := NewEditConstraint(first, Preferred, planner)
	plan := planner.extractPlanFromConstraints([]Constraint{edit})
	for i := 0; i < 100; i++ {
		first.value = i
		executePlan(plan)
		if last.value != i {
			failures++
		}
	}
	return failures
}

func projectionTest(n int) int {
	planner := &Planner{}
	failures := 0
	scale := NewVariable(10)
	offset := NewVariable(1000)
	var src, dst *Variable
	var dests []*Variable
	for i := 0; i < n; i++ {
		src = NewVariable(i)
		dst = NewVariable(i)
		dests = append(dests, dst)
		NewStayConstraint(src, Normal, planner)
		NewScaleConstraint(src, scale, offset, dst, Required, planner)
	}
	change(planner, src, 17)
	if dst.value != 1170 {
		failures++
	}
	change(planner, dst, 1050)
	if src.value != 5 {
		failures++
	}
	change(planner, scale, 5)
	for i := 0; i < n-1; i++ {
		if dests[i].value != i*5+1000 {
			failures++
		}
	}
	change(planner, offset, 2000)
	for i := 0; i < n-1; i++ {
		if dests[i].value != i*5+2000 {
			failures++
		}
	}
	return failures
}

func change(planner *Planner, v *Variable, newValue int) {
	edit := NewEditConstraint(v, Preferred, planner)
	plan := planner.extractPlanFromConstraints([]Constraint{edit})
	for i := 0; i < 10; i++ {
		v.value = newValue
		executePlan(plan)
	}
	destroyConstraint(edit, planner)
}
