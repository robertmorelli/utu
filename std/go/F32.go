package utu

import "strconv"

// The fewest digits that are v as an F32, written as an F64 would be.
//
// utu:F32.to_str
func f32ToStr(v float32) string {
	f, _ := strconv.ParseFloat(strconv.FormatFloat(float64(v), 'g', -1, 32), 64)
	return formatNumber(f)
}
