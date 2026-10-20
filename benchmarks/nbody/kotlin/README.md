# N-body: Kotlin (Kotlin/Wasm, WasmGC)

`src/wasmJsMain/kotlin/NBody.kt` follows `../nbody.js` step for step. Five
`Body` objects of seven `Double` fields sit in one `Array<Body>`, and the
floating-point operations run in the same order. `bench(iterations)` is
`@JsExport`ed and returns the `Long` sum of `floor(energy * 1e9 + 0.5)`,
which reaches JavaScript as a BigInt: `bench(5)` = -845446315. The checksum is the
same as in the other ports, even with Binaryen's `--fast-math`, which is a
plugin default.

## Toolchain

Kotlin 2.4.21 (the latest stable release), through the Kotlin Multiplatform
Gradle plugin's `wasmJs` target, which compiles to WasmGC. Gradle 9.8.1
(`/opt/homebrew/bin/gradle`), run on JDK 25 (Homebrew `openjdk@25`). The
plugin comes from the Gradle Plugin Portal and the Kotlin/Wasm standard library
from Maven Central, and both are cached in `~/.gradle`. For the production
build, the plugin also downloads Binaryen 130 into
`~/.gradle/binaryen/binaryen-version_130`. There is no Gradle wrapper, so
the installed `gradle` is used.

## Build

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home
gradle --project-cache-dir OUT/gradle-cache -PoutDir=OUT/build \
  -Pkotlin.project.persistent.dir=OUT/kotlin-data \
  compileProductionExecutableKotlinWasmJsOptimize
# -> OUT/build/compileSync/wasmJs/main/productionExecutable/optimized/
```

`-PoutDir` moves Gradle's build directory out of the source tree (see
`build.gradle.kts`). `--project-cache-dir` and
`kotlin.project.persistent.dir` do the same for `.gradle/` and `.kotlin/`.
This is the plugin's standard production pipeline. The Kotlin/Wasm compiler
first emits the production executable. Then Binaryen's `wasm-opt` runs with
the plugin's default flags:
`--closed-world --type-ssa -O3 -O3 --gufa -O3 --type-merging -O3 -Oz`, plus
`--traps-never-happen --fast-math --inline-functions-with-loops` and the
feature flags. No flags are added or removed. Kotlin's own safety checks are
explicit code that throws a Kotlin exception, not Wasm traps, so
`--traps-never-happen` does not remove them. Array index checks
(`IndexOutOfBoundsException`), `!!` and casts are all kept.

The shipped files are `nbody.wasm` and the three generated ES modules
`nbody.mjs` (the loader), `nbody.import-object.mjs` and
`nbody.js-builtins.mjs`. `nbody.wasm.map` is a source map and is not needed.

## Running in d8

```sh
d8 -e "globalThis.PORT_DIR='OUT/build/compileSync/wasmJs/main/productionExecutable/optimized'" \
  d8-prelude.js -e "PORT_READY.then(() => print(bench(5)))"
```

The generated `nbody.mjs` already supports d8. It detects d8, reads the
`.wasm` with `read(path, 'binary')`, and instantiates it synchronously with
the `js-string` builtins and imported string constants. No shim is needed.
The prelude `import()`s that module and defines `bench(iterations)`. Module loading is
asynchronous, so the prelude sets `globalThis.PORT_READY`.
