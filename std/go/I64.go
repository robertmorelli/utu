package utu

import "strconv"

// utu:I64.to_str
func i64ToStr(v int64) string { return strconv.FormatInt(v, 10) }
