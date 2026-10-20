package utu

import "strconv"

// A U32 is an i32 in wasm: its bits, read unsigned.
//
// utu:U32.to_str
func u32ToStr(v int32) string { return strconv.FormatUint(uint64(uint32(v)), 10) }
