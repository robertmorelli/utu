package utu

import (
	"math"
	"strconv"
	"strings"
)

// utu:F64.to_str
func f64ToStr(v float64) string { return formatNumber(v) }

// formatNumber writes v as utu writes a number: the fewest digits that are
// v; positionally from 1e-7 up to 1e21, exponentially (1e+21, 1.5e-7) past
// those; NaN, Infinity, -Infinity; and 0 for either zero.
func formatNumber(v float64) string {
	switch {
	case v != v:
		return "NaN"
	case math.IsInf(v, 1):
		return "Infinity"
	case math.IsInf(v, -1):
		return "-Infinity"
	case v == 0:
		return "0"
	}
	sign := ""
	if v < 0 {
		sign, v = "-", -v
	}
	// d.ddde±x: the digits, and n, where the decimal point goes.
	e := strconv.FormatFloat(v, 'e', -1, 64)
	at := strings.IndexByte(e, 'e')
	digits := strings.Replace(e[:at], ".", "", 1)
	exp, _ := strconv.Atoi(e[at+1:])
	k, n := len(digits), exp+1
	switch {
	case k <= n && n <= 21:
		return sign + digits + strings.Repeat("0", n-k)
	case 0 < n && n <= 21:
		return sign + digits[:n] + "." + digits[n:]
	case -6 < n && n <= 0:
		return sign + "0." + strings.Repeat("0", -n) + digits
	}
	mark := "+"
	if n-1 < 0 {
		mark = "-"
	}
	mantissa := digits[:1]
	if k > 1 {
		mantissa += "." + digits[1:]
	}
	return sign + mantissa + "e" + mark + strconv.Itoa(abs(n-1))
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

// utu:F64.sin
func f64Sin(x float64) float64 { return math.Sin(x) }

// utu:F64.cos
func f64Cos(x float64) float64 { return math.Cos(x) }

// utu:F64.tan
func f64Tan(x float64) float64 { return math.Tan(x) }

// utu:F64.asin
func f64Asin(x float64) float64 { return math.Asin(x) }

// utu:F64.acos
func f64Acos(x float64) float64 { return math.Acos(x) }

// utu:F64.atan
func f64Atan(x float64) float64 { return math.Atan(x) }

// utu:F64.exp
func f64Exp(x float64) float64 { return math.Exp(x) }

// utu:F64.ln
func f64Ln(x float64) float64 { return math.Log(x) }

// utu:F64.log2
func f64Log2(x float64) float64 { return math.Log2(x) }

// utu:F64.log10
func f64Log10(x float64) float64 { return math.Log10(x) }

// utu:F64.cbrt
func f64Cbrt(x float64) float64 { return math.Cbrt(x) }

// utu:F64.pow
func f64Pow(x, y float64) float64 { return math.Pow(x, y) }

// utu:F64.atan2
func f64Atan2(y, x float64) float64 { return math.Atan2(y, x) }

// utu:F64.hypot
func f64Hypot(x, y float64) float64 { return math.Hypot(x, y) }
