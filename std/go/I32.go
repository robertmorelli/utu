package utu

import "strconv"

// utu:I32.to_str
func i32ToStr(v int32) string { return strconv.FormatInt(int64(v), 10) }
