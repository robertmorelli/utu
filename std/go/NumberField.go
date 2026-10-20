package utu

import (
	"math"
	"strings"
)

// utu:NumberField.valid
func numberFieldValid(text string, min, max float64) bool {
	v := parseNumber(text)
	return strings.TrimFunc(text, isSpace) != "" && !math.IsInf(v, 0) && v == v && v >= min && v <= max
}

// utu:NumberField.value
func numberFieldValue(text string) float64 { return parseNumber(text) }
