// Package utu is utu's Go host: what a utu module needs from its host, in Go.
//
// `utu build` copies these files into the built program's package (with
// `package utu` renamed) beside host.go, which it generates: one method per
// import the module makes, adapting the import's wasm signature to the Go
// that gives it. The standard library's imports are the functions in the
// other files here, each marked with the binding it gives (`// utu:Str.trim`);
// a program's own `@go` bindings are their bodies.
//
// The module is Go too, made by gosm (gosm/rt is its runtime), and imports
// through gosm's Host interface. Wasm values cross as Go values: i32, i64,
// f32, and f64 as int32, int64, float32, and float64; a function reference
// as *rt.Func; anything else of the host's (a string, a closure, a promise)
// as `any`, a string being a Go string. In and Out convert between those
// and the types a Go function declares: an int32 is a bool where Go wants
// one, a closure is a typed Go func.
//
// The host runs on the goroutine that calls into the module, as one thread:
// promise reactions and timers run on it, in Run or while Await waits, never
// beside the module's own code. Go code that works on other goroutines hands
// results back with Post (or Async, which does both).
package utu

import (
	"container/heap"
	"fmt"
	"reflect"
	"strconv"
	"sync"
	"time"

	rt "gosm/rt"
)

// ---------------------------------------------------------------------------
// Values

// In converts a value as wasm passes it (a number, or a reference as any) to
// the type a Go function takes.
func In[T any](v any) T {
	if t, ok := v.(T); ok {
		return t
	}
	var zero T
	if v == nil {
		return zero
	}
	return convert(v, reflect.TypeFor[T]()).Interface().(T)
}

// Out converts what a Go function returns to the type wasm takes: a bool is
// an int32 of 1 or 0.
func Out[W any](v any) W {
	if w, ok := v.(W); ok {
		return w
	}
	if b, ok := v.(bool); ok {
		if b {
			return In[W](int32(1))
		}
		return In[W](int32(0))
	}
	return In[W](v)
}

// Value is a zero-argument import's result: its binding's value, or what the
// binding returns when it is a function.
func Value(v any) any {
	if rv := reflect.ValueOf(v); rv.Kind() == reflect.Func && rv.Type().NumIn() == 0 && rv.Type().NumOut() == 1 {
		return rv.Call(nil)[0].Interface()
	}
	return v
}

func convert(v any, t reflect.Type) reflect.Value {
	if v == nil {
		return reflect.Zero(t)
	}
	rv := reflect.ValueOf(v)
	switch {
	case rv.Type().AssignableTo(t):
		return rv
	case t.Kind() == reflect.Bool:
		return reflect.ValueOf(Truthy(v)).Convert(t)
	case t.Kind() == reflect.Func && isCallable(rv):
		return reflect.MakeFunc(t, func(args []reflect.Value) []reflect.Value {
			in := make([]any, len(args))
			for i, a := range args {
				in[i] = a.Interface()
			}
			r := Invoke(v, in...)
			if t.NumOut() == 0 {
				return nil
			}
			return []reflect.Value{convert(r, t.Out(0))}
		})
	case isNumber(rv.Kind()) && isNumber(t.Kind()):
		return rv.Convert(t)
	case rv.Kind() == reflect.Bool && isNumber(t.Kind()):
		n := 0
		if rv.Bool() {
			n = 1
		}
		return reflect.ValueOf(n).Convert(t)
	}
	panic(fmt.Sprintf("utu: a %T is not a %v", v, t))
}

func isNumber(k reflect.Kind) bool { return k >= reflect.Int && k <= reflect.Float64 }

func isCallable(rv reflect.Value) bool {
	switch rv.Interface().(type) {
	case *Closure, *rt.Func:
		return true
	}
	return rv.Kind() == reflect.Func
}

// Truthy is whether a value counts as true: not nil, false, zero, or "".
func Truthy(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case string:
		return x != ""
	case int32:
		return x != 0
	case int64:
		return x != 0
	case float32:
		return x != 0 && x == x
	case float64:
		return x != 0 && x == x
	}
	rv := reflect.ValueOf(v)
	if isNumber(rv.Kind()) {
		return !rv.IsZero()
	}
	return true
}

// Show is v as `utu run` prints what main returns: a number as utu writes
// it (an I64 with an n after it), a string as itself, a null as null.
func Show(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case int32:
		return strconv.FormatInt(int64(x), 10)
	case int64:
		return strconv.FormatInt(x, 10) + "n"
	case float32:
		return formatNumber(float64(x))
	case float64:
		return formatNumber(x)
	case string:
		return x
	}
	return fmt.Sprint(v)
}

// ---------------------------------------------------------------------------
// Calls: a Go function given the arguments wasm passes. One of each arity,
// with a result (Call) and without (Do).

func Call0[R any](f func() R) R                     { return f() }
func Call1[A, R any](f func(A) R, a any) R          { return f(In[A](a)) }
func Call2[A, B, R any](f func(A, B) R, a, b any) R { return f(In[A](a), In[B](b)) }
func Call3[A, B, C, R any](f func(A, B, C) R, a, b, c any) R {
	return f(In[A](a), In[B](b), In[C](c))
}
func Call4[A, B, C, D, R any](f func(A, B, C, D) R, a, b, c, d any) R {
	return f(In[A](a), In[B](b), In[C](c), In[D](d))
}
func Call5[A, B, C, D, E, R any](f func(A, B, C, D, E) R, a, b, c, d, e any) R {
	return f(In[A](a), In[B](b), In[C](c), In[D](d), In[E](e))
}
func Call6[A, B, C, D, E, F, R any](f func(A, B, C, D, E, F) R, a, b, c, d, e, g any) R {
	return f(In[A](a), In[B](b), In[C](c), In[D](d), In[E](e), In[F](g))
}

func Do0(f func())                         { f() }
func Do1[A any](f func(A), a any)          { f(In[A](a)) }
func Do2[A, B any](f func(A, B), a, b any) { f(In[A](a), In[B](b)) }
func Do3[A, B, C any](f func(A, B, C), a, b, c any) {
	f(In[A](a), In[B](b), In[C](c))
}
func Do4[A, B, C, D any](f func(A, B, C, D), a, b, c, d any) {
	f(In[A](a), In[B](b), In[C](c), In[D](d))
}
func Do5[A, B, C, D, E any](f func(A, B, C, D, E), a, b, c, d, e any) {
	f(In[A](a), In[B](b), In[C](c), In[D](d), In[E](e))
}
func Do6[A, B, C, D, E, F any](f func(A, B, C, D, E, F), a, b, c, d, e, g any) {
	f(In[A](a), In[B](b), In[C](c), In[D](d), In[E](e), In[F](g))
}

// ---------------------------------------------------------------------------
// Closures
//
// A utu closure that leaves the module is a function over its environment:
// the module's function (a function reference) and the environment it takes
// first. It is what a Go function asking for a func(…) receives, adapted by
// In.

type Closure struct {
	fn         reflect.Value
	depth      bool
	env        any
	withEnv    bool
	boolResult bool
}

// NewClosure closes fn (an *rt.Func, or a Go func) over env. flags: 1, the
// result is a Bool; 2, the environment is there even when nil (a closure
// whose one capture is its environment).
func NewClosure(fn, env any, flags int32) *Closure {
	f, depth := funcOf(fn)
	return &Closure{
		fn:         f,
		depth:      depth,
		env:        env,
		withEnv:    env != nil || flags&2 != 0,
		boolResult: flags&1 != 0,
	}
}

// Call calls the closure with args (each as wasm or Go passes it).
func (c *Closure) Call(args ...any) any {
	if c.withEnv {
		args = append([]any{c.env}, args...)
	}
	r := call(c.fn, c.depth, args)
	if c.boolResult {
		return Truthy(r)
	}
	return r
}

// Invoke calls f, a closure, a function reference, or a Go func, with args.
func Invoke(f any, args ...any) any {
	if c, ok := f.(*Closure); ok {
		return c.Call(args...)
	}
	fn, depth := funcOf(f)
	return call(fn, depth, args)
}

// funcOf is the Go func f is or holds, and whether it takes gosm's call
// depth first (a function reference's does).
func funcOf(f any) (reflect.Value, bool) {
	if r, ok := f.(*rt.Func); ok {
		if r == nil {
			panic(rt.ErrNullFunc)
		}
		return reflect.ValueOf(r.Fn), true
	}
	rv := reflect.ValueOf(f)
	if rv.Kind() != reflect.Func {
		panic(fmt.Sprintf("utu: a %T is not callable", f))
	}
	return rv, false
}

// call calls fn with args, each converted to the type fn takes: after a
// depth of 0, when it takes one, as a call from the host does.
func call(fn reflect.Value, depth bool, args []any) any {
	t := fn.Type()
	in := make([]reflect.Value, 0, len(args)+1)
	if depth {
		in = append(in, reflect.ValueOf(0))
	}
	for _, a := range args {
		in = append(in, convert(a, t.In(len(in))))
	}
	out := fn.Call(in)
	if len(out) == 0 {
		return nil
	}
	return out[0].Interface()
}

// ---------------------------------------------------------------------------
// Exceptions

// JSTag is the tag of host exceptions, the module's `utu.js_tag`: what
// utu's `catch` catches. Its one value is what was thrown.
var JSTag = &rt.Tag{Type: rt.FuncType([]string{"ref null extern"}, nil)}

// Throw throws v as a host exception, as a rejected Await does.
func Throw(v any) { panic(&rt.Exception{Tag: JSTag, Values: []any{v}}) }

// Thrown is what was thrown, given what recover gives: a host exception's
// value, or the panic's own.
func Thrown(r any) any {
	if e, ok := r.(*rt.Exception); ok && e.Tag == JSTag && len(e.Values) == 1 {
		return e.Values[0]
	}
	return r
}

// ---------------------------------------------------------------------------
// The event loop

type timer struct {
	at    time.Time
	seq   int
	f     func()
	index int
}

type timers []*timer

func (h timers) Len() int { return len(h) }
func (h timers) Less(i, j int) bool {
	return h[i].at.Before(h[j].at) || h[i].at.Equal(h[j].at) && h[i].seq < h[j].seq
}
func (h timers) Swap(i, j int) { h[i], h[j] = h[j], h[i]; h[i].index = i; h[j].index = j }
func (h *timers) Push(x any)   { t := x.(*timer); t.index = len(*h); *h = append(*h, t) }
func (h *timers) Pop() any {
	old := *h
	t := old[len(old)-1]
	*h = old[:len(old)-1]
	t.index = -1
	return t
}

var loop = struct {
	micro []func() // the loop's goroutine only

	mu     sync.Mutex
	tasks  []func()
	timers timers
	seq    int
	holds  int
	wake   chan struct{}
}{wake: make(chan struct{}, 1)}

func signal() {
	select {
	case loop.wake <- struct{}{}:
	default:
	}
}

func queueMicrotask(f func()) { loop.micro = append(loop.micro, f) }

// Post runs f on the host's goroutine, as a task. Safe from any goroutine.
func Post(f func()) {
	loop.mu.Lock()
	loop.tasks = append(loop.tasks, f)
	loop.mu.Unlock()
	signal()
}

// Hold keeps Run and Await waiting for work another goroutine has yet to
// Post; call the function it returns once that work is posted.
func Hold() (release func()) {
	loop.mu.Lock()
	loop.holds++
	loop.mu.Unlock()
	var once sync.Once
	return func() {
		once.Do(func() {
			loop.mu.Lock()
			loop.holds--
			loop.mu.Unlock()
			signal()
		})
	}
}

// Timer is a pending SetTimeout.
type Timer struct{ t *timer }

// SetTimeout runs f on the host's goroutine after ms milliseconds.
func SetTimeout(ms float64, f func()) Timer {
	loop.mu.Lock()
	defer loop.mu.Unlock()
	loop.seq++
	t := &timer{at: time.Now().Add(time.Duration(ms * float64(time.Millisecond))), seq: loop.seq, f: f}
	heap.Push(&loop.timers, t)
	signal()
	return Timer{t}
}

// ClearTimeout cancels a timer that has not run.
func ClearTimeout(t Timer) {
	loop.mu.Lock()
	defer loop.mu.Unlock()
	if t.t != nil && t.t.index >= 0 {
		heap.Remove(&loop.timers, t.t.index)
	}
}

func drainMicrotasks() {
	for len(loop.micro) > 0 {
		f := loop.micro[0]
		loop.micro = loop.micro[1:]
		f()
	}
}

// step runs the microtasks, then a task (a posted one, else a due timer), and
// its microtasks; waiting for one when none is ready. False when it ran
// nothing and nothing is left that could ever run.
func step() bool {
	ran := len(loop.micro) > 0
	drainMicrotasks()
	for {
		loop.mu.Lock()
		var f func()
		var wait <-chan time.Time
		switch {
		case len(loop.tasks) > 0:
			f = loop.tasks[0]
			loop.tasks = loop.tasks[1:]
		case len(loop.timers) > 0 && !loop.timers[0].at.After(time.Now()):
			f = heap.Pop(&loop.timers).(*timer).f
		case len(loop.timers) > 0:
			wait = time.After(time.Until(loop.timers[0].at))
		case loop.holds == 0 || ran:
			loop.mu.Unlock()
			return ran
		}
		loop.mu.Unlock()
		if f != nil {
			f()
			drainMicrotasks()
			return true
		}
		select {
		case <-loop.wake:
		case <-wait:
		}
	}
}

// Run runs what is queued (promise reactions, timers, posted tasks) until
// nothing is left. Call it after calling into the module, as a JavaScript
// host would run its event loop.
func Run() {
	for step() {
	}
}

// ---------------------------------------------------------------------------
// Promises
//
// A utu Promise[T] is a *Promise. Its reactions run as microtasks on the
// host's goroutine; Await runs the loop until it settles.

const (
	pending int8 = iota
	fulfilled
	rejected
)

type Promise struct {
	state     int8
	value     any
	reactions []func()
}

// NewPromise is a pending promise and what settles it. Call resolve and
// reject on the host's goroutine (from another, Post them).
func NewPromise() (p *Promise, resolve func(any), reject func(any)) {
	p = &Promise{}
	done := false
	resolve = func(v any) {
		if done {
			return
		}
		done = true
		p.resolve(v)
	}
	reject = func(r any) {
		if done {
			return
		}
		done = true
		p.settle(rejected, r)
	}
	return
}

func (p *Promise) resolve(v any) {
	if q, ok := v.(*Promise); ok {
		if q == p {
			p.settle(rejected, fmt.Errorf("utu: a promise resolved with itself"))
			return
		}
		queueMicrotask(func() { q.react(func() { p.settle(q.state, q.value) }) })
		return
	}
	p.settle(fulfilled, v)
}

func (p *Promise) settle(state int8, v any) {
	if p.state != pending {
		return
	}
	p.state, p.value = state, v
	for _, r := range p.reactions {
		queueMicrotask(r)
	}
	p.reactions = nil
}

func (p *Promise) react(f func()) {
	if p.state == pending {
		p.reactions = append(p.reactions, f)
	} else {
		queueMicrotask(f)
	}
}

// Resolved is a promise of v (v itself when it is one).
func Resolved(v any) *Promise {
	if p, ok := v.(*Promise); ok {
		return p
	}
	return &Promise{state: fulfilled, value: v}
}

// Rejected is a promise rejected with r.
func Rejected(r any) *Promise { return &Promise{state: rejected, value: r} }

// Then is the promise of what onFulfilled or onRejected returns (a nil
// handler passes the value or the reason on). A handler that panics rejects
// it with the panic's value.
func (p *Promise) Then(onFulfilled, onRejected func(any) any) *Promise {
	q, resolve, reject := NewPromise()
	p.react(func() {
		handler := onFulfilled
		if p.state == rejected {
			handler = onRejected
		}
		if handler == nil {
			if p.state == rejected {
				reject(p.value)
			} else {
				resolve(p.value)
			}
			return
		}
		defer func() {
			if r := recover(); r != nil {
				reject(Thrown(r))
			}
		}()
		resolve(handler(p.value))
	})
	return q
}

// Await waits for p, running the loop meanwhile, and is its value; a
// rejection is thrown (Throw). A value that is not a promise is itself.
func Await(v any) any {
	p, ok := v.(*Promise)
	if !ok {
		return v
	}
	for p.state == pending {
		if !step() {
			Throw(fmt.Errorf("utu: await on a promise that nothing will settle"))
		}
	}
	if p.state == rejected {
		Throw(p.value)
	}
	return p.value
}

// Async runs f on its own goroutine and is the promise of its result.
func Async(f func() (any, error)) *Promise {
	p, resolve, reject := NewPromise()
	release := Hold()
	go func() {
		v, err := f()
		Post(func() {
			if err != nil {
				reject(err)
			} else {
				resolve(v)
			}
		})
		release()
	}()
	return p
}

// Sleep is a promise of v, after ms milliseconds.
func Sleep(v any, ms float64) *Promise {
	p, resolve, _ := NewPromise()
	SetTimeout(ms, func() { resolve(v) })
	return p
}

func promiseThen(p, f any) {
	Resolved(p).Then(func(v any) any { Invoke(f, v); return nil }, nil)
}

func promiseCatch(p, f any) {
	Resolved(p).Then(nil, func(r any) any { Invoke(f, r); return nil })
}
