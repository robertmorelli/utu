package utu

import (
	"math"
	"math/big"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Str's whitespace: what trim removes, and around a number.
func isSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
		return true
	}
	return r >= 0x2000 && r <= 0x200A
}

// utu:Str.index_of
func strIndexOf(s, part string, from int32) int32 { return int32(unitIndex(s, part, int(from))) }

// utu:Str.last_index_of
func strLastIndexOf(s, part string) int32 { return int32(unitLastIndex(s, part)) }

// utu:Str.trim
func strTrim(s string) string { return strings.TrimFunc(s, isSpace) }

// utu:Str.trim_start
func strTrimStart(s string) string { return strings.TrimLeftFunc(s, isSpace) }

// utu:Str.trim_end
func strTrimEnd(s string) string { return strings.TrimRightFunc(s, isSpace) }

// utu:Str.to_upper
func strToUpper(s string) string { return mapText(s, strings.ToUpper) }

// utu:Str.to_lower
func strToLower(s string) string { return mapText(s, strings.ToLower) }

// mapText is f of the text in s, leaving a lone surrogate (which Go's
// functions would make U+FFFD) where it is.
func mapText(s string, f func(string) string) string {
	if utf8.ValidString(s) {
		return f(s)
	}
	var b strings.Builder
	start := 0
	for i := 0; i+2 < len(s); {
		if s[i] == 0xED && s[i+1] >= 0xA0 && s[i+1] <= 0xBF {
			b.WriteString(f(s[start:i]))
			b.WriteString(s[i : i+3])
			i += 3
			start = i
		} else {
			i++
		}
	}
	b.WriteString(f(s[start:]))
	return b.String()
}

// utu:Str.repeat
func strRepeat(s string, count int32) string {
	if count <= 0 {
		return ""
	}
	return strings.Repeat(s, int(count))
}

// Every occurrence of part, left to right; an empty part is between every
// two code units, and at both ends.
//
// utu:Str.replace
func strReplace(s, part, with string) string {
	if part != "" || isASCII(s) {
		return strings.ReplaceAll(s, part, with)
	}
	var out []uint16
	w := units(with)
	for _, u := range units(s) {
		out = append(append(out, w...), u)
	}
	return fromUnits(append(out, w...))
}

// utu:Str.pad_start
func strPadStart(s string, width int32, fill string) string {
	return pad(s, int(width), fill, true)
}

// utu:Str.pad_end
func strPadEnd(s string, width int32, fill string) string {
	return pad(s, int(width), fill, false)
}

// s, filled to width code units with as much of fill, repeated, as fits.
func pad(s string, width int, fill string, start bool) string {
	n := unitLen(s)
	if width <= n || fill == "" {
		return s
	}
	f := units(fill)
	padding := make([]uint16, 0, width-n)
	for len(padding) < width-n {
		padding = append(padding, f[len(padding)%len(f)])
	}
	if start {
		return fromUnits(padding) + s
	}
	return s + fromUnits(padding)
}

var wholeNumber = regexp.MustCompile(`^([+-]?)(0[xX][0-9a-fA-F]+|[0-9]+)$`)

// A whole number (decimal, or hex after 0x) that fits an I32, else fallback.
//
// utu:Str.parse_i32
func strParseI32(s string, fallback int32) int32 {
	m := wholeNumber.FindStringSubmatch(strings.TrimFunc(s, isSpace))
	if m == nil {
		return fallback
	}
	digits, base := m[2], 10
	if len(digits) > 2 && (digits[1] == 'x' || digits[1] == 'X') {
		digits, base = digits[2:], 16
	}
	v, ok := new(big.Int).SetString(digits, base)
	if !ok {
		return fallback
	}
	if m[1] == "-" {
		v.Neg(v)
	}
	if !v.IsInt64() || v.Int64() < math.MinInt32 || v.Int64() > math.MaxInt32 {
		return fallback
	}
	return int32(v.Int64())
}

// The number s is, or NaN; an empty (or all-space) s is NaN.
//
// utu:Str.parse_f64
func strParseF64(s string) float64 {
	if strings.TrimFunc(s, isSpace) == "" {
		return math.NaN()
	}
	return parseNumber(s)
}

var (
	decimalNumber = regexp.MustCompile(`^[+-]?(Infinity|([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?)$`)
	prefixNumber  = regexp.MustCompile(`^0([xX][0-9a-fA-F]+|[oO][0-7]+|[bB][01]+)$`)
)

// parseNumber is the number text is, after its whitespace: a decimal (sign,
// digits, point, exponent), Infinity, or an unsigned 0x, 0o, or 0b integer;
// 0 when there is nothing; NaN for anything else.
func parseNumber(text string) float64 {
	t := strings.TrimFunc(text, isSpace)
	switch {
	case t == "":
		return 0
	case decimalNumber.MatchString(t):
		if strings.HasSuffix(t, "Infinity") {
			if t[0] == '-' {
				return math.Inf(-1)
			}
			return math.Inf(1)
		}
		// Out of range is ±Inf or ±0, which ParseFloat gives with an error.
		v, _ := strconv.ParseFloat(t, 64)
		return v
	case prefixNumber.MatchString(t):
		base := map[byte]int{'x': 16, 'X': 16, 'o': 8, 'O': 8, 'b': 2, 'B': 2}[t[1]]
		v, _ := new(big.Int).SetString(t[2:], base)
		f, _ := new(big.Float).SetInt(v).Float64()
		return f
	}
	return math.NaN()
}
