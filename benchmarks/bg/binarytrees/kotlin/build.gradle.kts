import org.jetbrains.kotlin.gradle.ExperimentalWasmDsl

plugins {
    kotlin("multiplatform") version "2.4.21"
}

// Build output goes wherever -PoutDir points (outside the source tree).
providers.gradleProperty("outDir").orNull?.let { layout.buildDirectory.set(file(it)) }

repositories {
    mavenCentral()
}

kotlin {
    @OptIn(ExperimentalWasmDsl::class)
    wasmJs {
        outputModuleName.set("binarytrees")
        d8()
        binaries.executable()
    }
}
