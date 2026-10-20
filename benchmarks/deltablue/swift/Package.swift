// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "DeltaBlue",
    targets: [
        // An executable target linked as a WASI reactor: no `main`, the host
        // calls `_initialize` once and then the exported functions.
        .executableTarget(
            name: "DeltaBlue",
            swiftSettings: [.unsafeFlags(["-parse-as-library"])],
            linkerSettings: [.unsafeFlags(["-Xclang-linker", "-mexec-model=reactor"])]
        ),
    ]
)
