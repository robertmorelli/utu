package utu

// FNV-1a over the key's UTF-16 code units: a map's buckets, and so the
// order it lists its keys in, are the same on every host.
//
// utu:StrMap.hash
func strMapHash(key string) int32 {
	h := uint32(2166136261)
	if isASCII(key) {
		for i := 0; i < len(key); i++ {
			h = (h ^ uint32(key[i])) * 16777619
		}
	} else {
		for _, u := range units(key) {
			h = (h ^ uint32(u)) * 16777619
		}
	}
	return int32(h)
}
