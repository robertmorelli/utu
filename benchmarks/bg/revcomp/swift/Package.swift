// swift-tools-version:6.0
import PackageDescription

// A WASI reactor: no `main`; the host calls `_initialize` once, then `bench`.
// -Ounchecked as BG builds it (`swift build -c release` adds -O and -wmo).
let package = Package(
    name: "Revcomp",
    targets: [
        .executableTarget(
            name: "Revcomp",
            swiftSettings: [.unsafeFlags(["-parse-as-library", "-Ounchecked", "-wmo"])],
            linkerSettings: [.unsafeFlags(["-Xclang-linker", "-mexec-model=reactor"])]
        ),
    ]
)
