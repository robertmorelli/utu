package utu

import "strconv"

// A U64 is an i64 in wasm: its bits, read unsigned.
//
// utu:U64.to_str
func u64ToStr(v int64) string { return strconv.FormatUint(uint64(v), 10) }
