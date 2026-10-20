package utu

// A Stream is an AsyncIterable: what it gives, one promise at a time. Each
// next is the promise of an IterResult; Return ends the iteration early,
// closing whatever it reads from. Streams pull: nothing runs until a next.
//
// Go code can make a utu stream from anything that gives values by
// implementing AsyncIterable; a channel is one with FromChannel.

type AsyncIterable interface{ Iterator() AsyncIterator }

type AsyncIterator interface {
	Next() *Promise
	Return() *Promise
}

// IterResult is what a next gives: a value, or the end.
type IterResult struct {
	Done  bool
	Value any
}

var end = IterResult{Done: true}

// gen is an iterator whose nexts take turns: one asked for before the last
// has settled starts when it does.
type gen struct {
	last  *Promise
	done  bool
	step  func() *Promise
	close func() *Promise
}

func (g *gen) Next() *Promise {
	if g.last != nil && g.last.state == pending {
		after := func(any) any { return g.next() }
		g.last = g.last.Then(after, after)
	} else {
		g.last = g.next()
	}
	return g.last
}

func (g *gen) next() *Promise {
	if g.done {
		return Resolved(end)
	}
	return g.step()
}

func (g *gen) Return() *Promise {
	if g.done {
		return Resolved(end)
	}
	g.done = true
	if g.close != nil {
		return g.close().Then(func(any) any { return end }, nil)
	}
	return Resolved(end)
}

type iterable func() AsyncIterator

func (f iterable) Iterator() AsyncIterator { return f() }

// pull is an iterator of source's values, opened at its first next.
type pull struct {
	source any
	it     AsyncIterator
}

func (p *pull) next() *Promise {
	if p.it == nil {
		p.it = iteratorOf(p.source)
	}
	return p.it.Next()
}

func (p *pull) close() *Promise {
	if p.it == nil {
		return Resolved(end)
	}
	return p.it.Return()
}

func iteratorOf(s any) AsyncIterator {
	if it, ok := s.(AsyncIterable); ok {
		return it.Iterator()
	}
	panic("utu: not a stream")
}

// FromChannel is a stream of what ch receives, until it is closed.
func FromChannel[T any](ch <-chan T) AsyncIterable {
	return iterable(func() AsyncIterator {
		g := &gen{}
		g.step = func() *Promise {
			return Async(func() (any, error) {
				if v, ok := <-ch; ok {
					return IterResult{Value: v}, nil
				}
				return end, nil
			}).Then(func(r any) any {
				g.done = r.(IterResult).Done
				return r
			}, nil)
		}
		return g
	})
}

// utu:Stream.from_js
func streamFrom(iterable any) any { return iterable }

// at(0), at(1), … at(count - 1).
//
// utu:Stream.of
// utu:Stream.generate
func streamGenerate(count int32, at func(int32) any) any {
	return iterable(func() AsyncIterator {
		var i int32
		g := &gen{}
		g.step = func() *Promise {
			if i >= count {
				g.done = true
				return Resolved(end)
			}
			v := at(i)
			i++
			return Resolved(IterResult{Value: v})
		}
		return g
	})
}

// The first n values, then the source is closed.
//
// utu:Stream.take
func streamTake(s any, n int32) any {
	return iterable(func() AsyncIterator {
		src := &pull{source: s}
		var i int32
		g := &gen{close: src.close}
		g.step = func() *Promise {
			if n <= 0 {
				g.done = true
				return Resolved(end)
			}
			if i >= n {
				g.done = true
				return src.close().Then(func(any) any { return end }, nil)
			}
			return src.next().Then(func(r any) any {
				if r.(IterResult).Done {
					g.done = true
					return end
				}
				i++
				return r
			}, nil)
		}
		return g
	})
}

// The values after the first n.
//
// utu:Stream.skip
func streamSkip(s any, n int32) any {
	return each(s, func(v any, i int32) (bool, any) { return i >= n, v })
}

// utu:Stream.filter
func streamFilter(s any, keep func(any) bool) any {
	return each(s, func(v any, _ int32) (bool, any) { return keep(v), v })
}

// utu:Stream.map
func streamMap(s any, f func(any) any) any {
	return each(s, func(v any, _ int32) (bool, any) { return true, f(v) })
}

// A stream of what visit makes of each of s's values (and their index) that
// it keeps.
func each(s any, visit func(v any, i int32) (bool, any)) any {
	return iterable(func() AsyncIterator {
		src := &pull{source: s}
		var i int32
		g := &gen{close: src.close}
		var step func() *Promise
		step = func() *Promise {
			return src.next().Then(func(r any) any {
				res := r.(IterResult)
				if res.Done {
					g.done = true
					return end
				}
				keep, v := visit(res.Value, i)
				i++
				if !keep {
					return step()
				}
				return IterResult{Value: v}
			}, nil)
		}
		g.step = step
		return g
	})
}

// a's values, then b's.
//
// utu:Stream.chain
func streamChain(a, b any) any {
	return iterable(func() AsyncIterator {
		first, second := &pull{source: a}, &pull{source: b}
		current := first
		g := &gen{close: func() *Promise { return current.close() }}
		var step func() *Promise
		step = func() *Promise {
			return current.next().Then(func(r any) any {
				if !r.(IterResult).Done {
					return r
				}
				if current == first {
					current = second
					return step()
				}
				g.done = true
				return end
			}, nil)
		}
		g.step = step
		return g
	})
}

// utu:Stream.iterator
func streamIterator(s any) any { return iteratorOf(s) }

// utu:Stream.next
func streamNext(it any) any { return it.(AsyncIterator).Next() }

// utu:Stream.done
func streamDone(r any) bool { return r.(IterResult).Done }

// utu:Stream.value
func streamValue(r any) any { return r.(IterResult).Value }

// utu:Stream.close
func streamClose(it any) any { return it.(AsyncIterator).Return() }
