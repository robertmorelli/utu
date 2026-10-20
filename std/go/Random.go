package utu

import (
	"crypto/rand"
	"encoding/binary"
)

// utu:Random.from_host
func randomSeed() int32 {
	var b [4]byte
	_, _ = rand.Read(b[:])
	return int32(binary.LittleEndian.Uint32(b[:]))
}
