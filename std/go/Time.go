package utu

import "time"

var started = time.Now()

// Milliseconds since the program started, to the nanosecond.
//
// utu:Time.now
func timeNow() float64 { return float64(time.Since(started).Nanoseconds()) / 1e6 }

// Milliseconds since 1970, whole.
//
// utu:Time.epoch_ms
func timeEpochMs() float64 { return float64(time.Now().UnixMilli()) }
