package utu

import (
	"errors"
	"math"
	"reflect"
	"strings"
	"testing"

	rt "gosm/rt"
)

func TestInOut(t *testing.T) {
	if !In[bool](int32(1)) || In[bool](int32(0)) {
		t.Fatal("an i32 is a bool")
	}
	if Out[int32](true) != 1 || Out[int32](false) != 0 {
		t.Fatal("a bool is an i32")
	}
	if In[string]("hi") != "hi" || In[string](nil) != "" {
		t.Fatal("a string is itself; nil is empty")
	}
	if In[int](int32(7)) != 7 || In[float64](int32(2)) != 2 {
		t.Fatal("numbers convert")
	}
	if Out[any]("x") != "x" || Out[any](nil) != nil {
		t.Fatal("a reference is itself")
	}
	if Value(42) != 42 || Value(func() int32 { return 9 }) != int32(9) {
		t.Fatal("a value, or what a thunk gives")
	}
	defer func() {
		if recover() == nil {
			t.Fatal("a string is not an int32")
		}
	}()
	In[int32]("nope")
}

func TestClosures(t *testing.T) {
	// The module's function takes its environment first.
	type env struct{ n int32 }
	add := NewClosure(func(e *env, x int32) int32 { return e.n + x }, &env{40}, 0)
	if Invoke(add, int32(2)) != int32(42) {
		t.Fatal("a closure over its environment")
	}
	// No environment: a decayed fun.
	twice := NewClosure(func(x int32) int32 { return 2 * x }, nil, 0)
	if Invoke(twice, int32(4)) != int32(8) {
		t.Fatal("a fun as a closure")
	}
	// A nil environment that is the one capture is still passed.
	isNil := NewClosure(func(e *env) int32 { return Out[int32](e == nil) }, nil, 2|1)
	if Invoke(isNil) != true {
		t.Fatal("flag 2 passes a nil environment; flag 1 makes a Bool")
	}
	// Go code asks for a func and gets the closure as one.
	f := In[func(int32) int32](twice)
	if f(5) != 10 {
		t.Fatal("a closure as a typed func")
	}
	keep := In[func(any) bool](NewClosure(func(v any) int32 { return Out[int32](v == "yes") }, nil, 0))
	if !keep("yes") || keep("no") {
		t.Fatal("a closure returning an i32 as a func returning bool")
	}
}

func TestPromiseOrder(t *testing.T) {
	var log []string
	p, resolve, _ := NewPromise()
	p.Then(func(v any) any { log = append(log, "a:"+v.(string)); return nil }, nil)
	Resolved("x").Then(func(v any) any { log = append(log, "b:"+v.(string)); return nil }, nil)
	SetTimeout(0, func() { log = append(log, "timer"); resolve("y") })
	Post(func() { log = append(log, "task") })
	Run()
	// Reactions before tasks; tasks in order; the timer's reaction after it.
	want := "b:x task timer a:y"
	if got := strings.Join(log, " "); got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestPromiseChains(t *testing.T) {
	inner, resolve, _ := NewPromise()
	// A handler's promise is adopted.
	outer := Resolved(1).Then(func(any) any { return inner }, nil)
	SetTimeout(1, func() { resolve("late") })
	if Await(outer) != "late" {
		t.Fatal("adoption")
	}
	// A panic in a handler rejects; catch sees the reason.
	failed := Resolved(1).Then(func(any) any { Throw("boom"); return nil }, nil)
	var reason any
	promiseCatch(failed, func(r any) { reason = r })
	Run()
	if reason != "boom" {
		t.Fatalf("reason %v", reason)
	}
	// Await of a rejection throws it.
	func() {
		defer func() {
			if r := recover(); Thrown(r) != "no" {
				t.Fatalf("got %v", r)
			}
		}()
		Await(Rejected("no"))
	}()
	// A value is its own await.
	if Await(int32(3)) != int32(3) {
		t.Fatal("a value")
	}
}

func TestAwaitDeadlock(t *testing.T) {
	p, _, _ := NewPromise()
	defer func() {
		if _, ok := Thrown(recover()).(error); !ok {
			t.Fatal("a promise nothing settles is an error, not a hang")
		}
	}()
	Await(p)
}

func TestAsync(t *testing.T) {
	ok := Async(func() (any, error) { return 5, nil })
	bad := Async(func() (any, error) { return nil, errors.New("down") })
	if Await(ok) != 5 {
		t.Fatal("a goroutine's result")
	}
	func() {
		defer func() {
			if err, _ := Thrown(recover()).(error); err == nil || err.Error() != "down" {
				t.Fatal("a goroutine's error")
			}
		}()
		Await(bad)
	}()
	if Await(Sleep("z", 2)) != "z" {
		t.Fatal("sleep")
	}
}

// What a stream gives, to its end.
func drain(s any) []any {
	it := streamIterator(s)
	var out []any
	for {
		r := Await(streamNext(it))
		if streamDone(r) {
			return out
		}
		out = append(out, streamValue(r))
	}
}

func count(n int32) any {
	return streamGenerate(n, func(i int32) any { return i })
}

func TestStreams(t *testing.T) {
	check := func(name string, got []any, want ...any) {
		t.Helper()
		if len(got) != len(want) || len(want) > 0 && !reflect.DeepEqual(got, want) {
			t.Fatalf("%s: got %v, want %v", name, got, want)
		}
	}
	check("generate", drain(count(3)), int32(0), int32(1), int32(2))
	check("take", drain(streamTake(count(10), 2)), int32(0), int32(1))
	check("take 0", drain(streamTake(count(10), 0)))
	check("skip", drain(streamSkip(count(4), 2)), int32(2), int32(3))
	check("filter", drain(streamFilter(count(6), func(v any) bool { return v.(int32)%2 == 1 })), int32(1), int32(3), int32(5))
	check("map", drain(streamMap(count(3), func(v any) any { return v.(int32) * 10 })), int32(0), int32(10), int32(20))
	check("chain", drain(streamChain(count(2), count(1))), int32(0), int32(1), int32(0))
	ch := make(chan string, 2)
	ch <- "a"
	ch <- "b"
	close(ch)
	check("channel", drain(FromChannel(ch)), "a", "b")

	// take closes what it reads once it has enough; at most what it needs is made.
	made := 0
	closed := false
	source := iterable(func() AsyncIterator {
		g := &gen{close: func() *Promise { closed = true; return Resolved(nil) }}
		g.step = func() *Promise { made++; return Resolved(IterResult{Value: made}) }
		return g
	})
	check("take closes", drain(streamTake(source, 2)), 1, 2)
	if made != 2 || !closed {
		t.Fatalf("made %d, closed %v", made, closed)
	}
	// Nexts asked for together take turns.
	it := streamIterator(count(2))
	a, b, c := streamNext(it), streamNext(it), streamNext(it)
	if streamValue(Await(a)) != int32(0) || streamValue(Await(b)) != int32(1) || !streamDone(Await(c)) {
		t.Fatal("nexts in order")
	}
}

func TestFunctionReferences(t *testing.T) {
	// A function reference's Go func takes the call depth first.
	ref := &rt.Func{Fn: func(depth int, e *int32, x int32) int32 {
		if depth != 0 {
			t.Fatal("the host calls with depth 0")
		}
		return *e + x
	}}
	n := int32(40)
	if Invoke(NewClosure(ref, &n, 0), int32(2)) != int32(42) {
		t.Fatal("a closure of a function reference")
	}
	if In[func(int32) int32](NewClosure(ref, &n, 0))(1) != 41 {
		t.Fatal("as a typed func")
	}
	// The module's catch sees a host exception as JSTag with its value.
	err := rt.Catch(func() { Throw("x") })
	if e, ok := err.(*rt.Exception); !ok || e.Tag != JSTag || e.Values[0] != "x" {
		t.Fatalf("got %v", err)
	}
	if JSTag.Type != rt.FuncType([]string{"ref null extern"}, nil) {
		t.Fatal("the tag's type is the module's (externref)")
	}
}

func TestStrings(t *testing.T) {
	lone := fromUnits([]uint16{'a', 0xD800, 'b'})
	for _, s := range []string{"", "abc", "é", "😀", "a😀b", lone, fromUnits([]uint16{0xDE00})} {
		if fromUnits(units(s)) != s {
			t.Fatalf("%q does not round-trip", s)
		}
	}
	if StrLength("é") != 1 || StrLength("😀") != 2 || StrLength(lone) != 3 {
		t.Fatal("lengths are UTF-16 code units")
	}
	// Half a pair, sliced off, and put back, is the pair.
	hi, lo := StrSubstring("😀", 0, 1), StrSubstring("😀", 1, 2)
	if StrLength(hi) != 1 || StrConcat(hi, lo) != "😀" {
		t.Fatal("surrogate halves")
	}
	if StrCharCodeAt("a😀", 1) != 0xD83D || StrCodePointAt("a😀", 1) != 0x1F600 {
		t.Fatal("code units and points")
	}
	if StrSubstring("hello", 4, 1) != "ell" || StrCompare("a", "b") != -1 || StrCompare("😀", "￿") != -1 {
		t.Fatal("substring swaps; compare is by code unit")
	}
	if strIndexOf("a😀b😀", "😀", 2) != 4 || strLastIndexOf("a😀b😀", "b") != 3 || strIndexOf("abc", "", 9) != 3 {
		t.Fatal("indices are code units")
	}
}

func TestNumbers(t *testing.T) {
	for v, want := range map[float64]string{
		0: "0", 1: "1", -1.5: "-1.5", 0.1: "0.1", 100: "100", 1e21: "1e+21", 1e20: "100000000000000000000",
		1e-7: "1e-7", 1.5e-7: "1.5e-7", 0.000001: "0.000001", 123.456: "123.456", 5e-324: "5e-324",
		math.MaxFloat64: "1.7976931348623157e+308", math.Inf(-1): "-Infinity", math.Copysign(0, -1): "0",
	} {
		if got := formatNumber(v); got != want {
			t.Errorf("%v: got %q, want %q", v, got, want)
		}
	}
	if got := f32ToStr(0.1); got != "0.1" {
		t.Errorf("f32 0.1: %q", got)
	}
	for text, want := range map[string]float64{
		"": 0, "  ": 0, "12": 12, " -3.5 ": -3.5, ".5": 0.5, "5.": 5, "1e3": 1000, "0x1F": 31, "0b101": 5, "0o17": 15,
		"Infinity": math.Inf(1), "-Infinity": math.Inf(-1), "1e400": math.Inf(1),
	} {
		if got := parseNumber(text); got != want {
			t.Errorf("%q: got %v, want %v", text, got, want)
		}
	}
	for _, text := range []string{"abc", "-0x10", "1_000", "inf", "nan", "0x", "1e", "+-1"} {
		if got := parseNumber(text); got == got {
			t.Errorf("%q: got %v, want NaN", text, got)
		}
	}
}

func TestMemory(t *testing.T) {
	m := NewMemory("I32", 0)
	if m.CopyIn([]byte{1, 0, 0, 0, 2, 0, 0, 0}) != 2 {
		t.Fatal("elements copied")
	}
	view := m.View(0, 2).([]int32)
	if view[0] != 1 || view[1] != 2 {
		t.Fatal("a view of the elements")
	}
	view[1] = 7
	if m.Data[4] != 7 {
		t.Fatal("a view shares the bytes")
	}
	big := NewMemory("U8", 0)
	if big.CopyIn(strings.Repeat("x", 70000)) != 70000 || big.Pages() != 2 {
		t.Fatal("copy_in grows the mem")
	}
	if NewMemory("U8", 0).CopyIn(fromUnits([]uint16{0xD800})) != 3 {
		t.Fatal("a lone surrogate is written as U+FFFD")
	}
}
