// swift-tools-version:6.0
import PackageDescription

// A WASI reactor: no `main`; the host calls `_initialize` once, then `bench`.
// -Ounchecked as BG builds it (`swift build -c release` adds -O and -wmo).
// `gmp` is mini-gmp 6.3.0 (../c/mini-gmp.c) as a C target: BG links GMP.
let package = Package(
    name: "PiDigits",
    targets: [
        .target(name: "gmp", cSettings: [.unsafeFlags(["-O3"])]),
        .executableTarget(
            name: "PiDigits",
            dependencies: ["gmp"],
            swiftSettings: [.unsafeFlags(["-parse-as-library", "-Ounchecked", "-wmo"])],
            linkerSettings: [.unsafeFlags(["-Xclang-linker", "-mexec-model=reactor"])]
        ),
    ]
)
