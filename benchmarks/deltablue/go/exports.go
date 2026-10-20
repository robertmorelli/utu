package main

// The wasm exports: each runs the 1,048-node test `iterations` times and
// returns the summed failure count.

//go:wasmexport bench_chain
func benchChain(iterations int32) int64 {
	failures := 0
	for i := int32(0); i < iterations; i++ {
		failures += chainTest(1048)
	}
	return int64(failures)
}

//go:wasmexport bench_projection
func benchProjection(iterations int32) int64 {
	failures := 0
	for i := int32(0); i < iterations; i++ {
		failures += projectionTest(1048)
	}
	return int64(failures)
}

// main is required by package main; built with -buildmode=c-shared the module
// is a WASI reactor and main never runs.
func main() {}
