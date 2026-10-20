package utu

import (
	"unicode/utf8"
	"unsafe"

	rt "gosm/rt"
)

// Memory is a mem the host reads and writes (`copy_in`, `view`): created by
// the host, imported by the module as its *rt.Memory. Data grows by
// reallocating, so a view made before a growth is of the old bytes.
type Memory struct {
	*rt.Memory
	kind string
}

// NewMemory is a mem of kind ("U8", "I32", "F64", …), with room for an
// initial data segment of dataBytes.
func NewMemory(kind string, dataBytes int) *Memory {
	pages := max(1, (dataBytes+rt.PageSize-1)/rt.PageSize)
	return &Memory{Memory: rt.NewMemory(uint64(pages), 65535, true, false), kind: kind}
}

func (m *Memory) size() int {
	switch m.kind {
	case "U16", "I16":
		return 2
	case "I32", "U32", "F32":
		return 4
	case "I64", "U64", "F64":
		return 8
	}
	return 1
}

func (m *Memory) fit(n int) {
	if have := len(m.Data); n > have {
		if m.Grow(uint64((n-have+rt.PageSize-1)/rt.PageSize)) < 0 {
			panic(rt.NewTrap("utu: copy_in: the mem cannot grow that far"))
		}
	}
}

// CopyIn copies v ([]byte, or a string as UTF-8) into the mem from element
// 0, and is the number of elements it fills.
func (m *Memory) CopyIn(v any) int32 {
	var b []byte
	switch x := v.(type) {
	case string:
		// A lone surrogate is not UTF-8: it is written as U+FFFD.
		if !utf8.ValidString(x) {
			b = []byte(toUTF8(x))
		} else {
			b = []byte(x)
		}
	case []byte:
		b = x
	default:
		panic("utu: copy_in takes a string or []byte")
	}
	m.fit(len(b))
	copy(m.Data, b)
	return int32(len(b) / m.size())
}

func toUTF8(s string) string {
	u := units(s)
	for i, c := range u {
		if c >= 0xD800 && c < 0xE000 {
			paired := c < 0xDC00 && i+1 < len(u) && u[i+1] >= 0xDC00 && u[i+1] < 0xE000 ||
				c >= 0xDC00 && i > 0 && u[i-1] >= 0xD800 && u[i-1] < 0xDC00
			if !paired {
				u[i] = 0xFFFD
			}
		}
	}
	return fromUnits(u)
}

// View is elements [start, end) of the mem as a slice of its element type
// ([]uint8, []int32, []float64, …) sharing its bytes.
func (m *Memory) View(start, end int32) any {
	n := int(end - start)
	if n == 0 {
		return m.Data[:0]
	}
	p := unsafe.Pointer(&m.Data[int(start)*m.size()])
	switch m.kind {
	case "I8":
		return unsafe.Slice((*int8)(p), n)
	case "U16":
		return unsafe.Slice((*uint16)(p), n)
	case "I16":
		return unsafe.Slice((*int16)(p), n)
	case "I32":
		return unsafe.Slice((*int32)(p), n)
	case "U32":
		return unsafe.Slice((*uint32)(p), n)
	case "I64":
		return unsafe.Slice((*int64)(p), n)
	case "U64":
		return unsafe.Slice((*uint64)(p), n)
	case "F32":
		return unsafe.Slice((*float32)(p), n)
	case "F64":
		return unsafe.Slice((*float64)(p), n)
	}
	return m.Data[start:end]
}
