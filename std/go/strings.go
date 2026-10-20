package utu

import (
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// A utu Str is a Go string. Its length and indices count UTF-16 code units,
// as the module's own string instructions do (`len`, `slice`, `get`), so a
// position one gives is a position the other takes: `"é".len()` is 1,
// `"😀".len()` is 2. A code unit with no partner (half of a surrogate pair,
// as slicing can leave) is in the Go string as its three-byte WTF-8 form,
// which is what lets every Str round-trip.
//
// The Str functions here are the operations a transpiled module needs for
// its string instructions, in those terms.

// isASCII is whether units and bytes are the same thing in s.
func isASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] >= utf8.RuneSelf {
			return false
		}
	}
	return true
}

// units is s as UTF-16 code units.
func units(s string) []uint16 {
	u := make([]uint16, 0, len(s))
	for i := 0; i < len(s); {
		if c := s[i]; c < utf8.RuneSelf {
			u = append(u, uint16(c))
			i++
			continue
		}
		// A lone surrogate, in WTF-8: ED A0–BF xx.
		if i+2 < len(s) && s[i] == 0xED && s[i+1] >= 0xA0 && s[i+1] <= 0xBF && s[i+2]&0xC0 == 0x80 {
			u = append(u, 0xD000|uint16(s[i+1]&0x3F)<<6|uint16(s[i+2]&0x3F))
			i += 3
			continue
		}
		r, n := utf8.DecodeRuneInString(s[i:])
		i += n
		if r >= 0x10000 {
			hi, lo := utf16.EncodeRune(r)
			u = append(u, uint16(hi), uint16(lo))
		} else {
			u = append(u, uint16(r))
		}
	}
	return u
}

// fromUnits is the string of UTF-16 code units u.
func fromUnits(u []uint16) string {
	var b strings.Builder
	b.Grow(len(u))
	for i := 0; i < len(u); i++ {
		c := u[i]
		switch {
		case c < utf8.RuneSelf:
			b.WriteByte(byte(c))
		case utf16.IsSurrogate(rune(c)) && c < 0xDC00 && i+1 < len(u) && u[i+1] >= 0xDC00 && u[i+1] < 0xE000:
			b.WriteRune(utf16.DecodeRune(rune(c), rune(u[i+1])))
			i++
		case utf16.IsSurrogate(rune(c)):
			b.Write([]byte{0xED, 0xA0 | byte(c>>6&0x1F), 0x80 | byte(c&0x3F)})
		default:
			b.WriteRune(rune(c))
		}
	}
	return b.String()
}

// unitLen is the length of s in UTF-16 code units.
func unitLen(s string) int {
	if isASCII(s) {
		return len(s)
	}
	return len(units(s))
}

// unitIndex is the first index of p in s at or after from, in UTF-16 code
// units, or -1. from is clamped to the string.
func unitIndex(s, p string, from int) int {
	if isASCII(s) && isASCII(p) {
		from = clamp(from, 0, len(s))
		if i := strings.Index(s[from:], p); i >= 0 {
			return from + i
		}
		return -1
	}
	su, pu := units(s), units(p)
	for i := clamp(from, 0, len(su)); i+len(pu) <= len(su); i++ {
		if equalUnits(su[i:i+len(pu)], pu) {
			return i
		}
	}
	return -1
}

// unitLastIndex is the last index of p in s, in UTF-16 code units, or -1.
func unitLastIndex(s, p string) int {
	if isASCII(s) && isASCII(p) {
		return strings.LastIndex(s, p)
	}
	su, pu := units(s), units(p)
	for i := len(su) - len(pu); i >= 0; i-- {
		if equalUnits(su[i:i+len(pu)], pu) {
			return i
		}
	}
	return -1
}

func equalUnits(a, b []uint16) bool {
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func clamp(n, lo, hi int) int { return max(lo, min(n, hi)) }

// StrLength is s's length in UTF-16 code units.
func StrLength(s string) int32 { return int32(unitLen(s)) }

// StrCharCodeAt is the code unit at i.
func StrCharCodeAt(s string, i int32) int32 {
	if isASCII(s) {
		return int32(s[i])
	}
	return int32(units(s)[i])
}

// StrCodePointAt is the code point at unit i (a lone surrogate is itself).
func StrCodePointAt(s string, i int32) int32 {
	u := units(s)
	c := u[i]
	if c >= 0xD800 && c < 0xDC00 && int(i)+1 < len(u) && u[i+1] >= 0xDC00 && u[i+1] < 0xE000 {
		return int32(utf16.DecodeRune(rune(c), rune(u[i+1])))
	}
	return int32(c)
}

// StrSubstring is the units [start, end) of s, each clamped to the string
// and the two swapped when start is past end.
func StrSubstring(s string, start, end int32) string {
	n := unitLen(s)
	a, b := clamp(int(start), 0, n), clamp(int(end), 0, n)
	if a > b {
		a, b = b, a
	}
	if isASCII(s) {
		return s[a:b]
	}
	return fromUnits(units(s)[a:b])
}

// StrConcat is a then b. (Two halves of a surrogate pair meet as the pair.)
func StrConcat(a, b string) string {
	if isASCII(a) || isASCII(b) {
		return a + b
	}
	return fromUnits(append(units(a), units(b)...))
}

// StrEquals is whether a and b are the same units.
func StrEquals(a, b string) bool { return a == b }

// StrCompare orders a and b by their code units: -1, 0, or 1.
func StrCompare(a, b string) int32 {
	if isASCII(a) && isASCII(b) {
		return int32(strings.Compare(a, b))
	}
	ua, ub := units(a), units(b)
	for i := 0; i < len(ua) && i < len(ub); i++ {
		if ua[i] != ub[i] {
			if ua[i] < ub[i] {
				return -1
			}
			return 1
		}
	}
	switch {
	case len(ua) < len(ub):
		return -1
	case len(ua) > len(ub):
		return 1
	}
	return 0
}

// StrFromCharCode is the string of one code unit.
func StrFromCharCode(c int32) string { return fromUnits([]uint16{uint16(c)}) }

// StrFromCodePoint is the string of one code point.
func StrFromCodePoint(c int32) string {
	if c >= 0xD800 && c < 0xE000 {
		return StrFromCharCode(c)
	}
	return string(rune(c))
}
