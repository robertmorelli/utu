import json
import statistics
import sys
import time
import wasmtime

wasm_path = sys.argv[1]
samples = int(sys.argv[2]) if len(sys.argv) > 2 else 20
warmups = int(sys.argv[3]) if len(sys.argv) > 3 else 5
iterations = int(sys.argv[4]) if len(sys.argv) > 4 else 20
engine = wasmtime.Engine()
store = wasmtime.Store(engine)
module = wasmtime.Module.from_file(engine, wasm_path)
instance = wasmtime.Instance(store, module, [])
main = instance.exports(store)["main"]

def measure(kind):
    def run():
        return main(store, kind, iterations)
    expected = run()
    if expected != 0:
        raise RuntimeError(f"DeltaBlue returned {expected}")
    for _ in range(warmups):
        run()
    times = []
    for _ in range(samples):
        start = time.perf_counter_ns()
        run()
        times.append((time.perf_counter_ns() - start) / 1_000_000)
    return {"median": statistics.median(times), "best": min(times), "result": str(expected)}

print(json.dumps({"samples": samples, "warmups": warmups, "iterations": iterations,
                  "chain": measure(0), "projection": measure(1)}))
