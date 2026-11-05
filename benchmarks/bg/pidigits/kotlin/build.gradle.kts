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
        outputModuleName.set("pidigits")
        d8()
        binaries.executable()
    }
    sourceSets {
        // Kotlin/Wasm has no BigInteger; this is a pure-Kotlin multiplatform one.
        val wasmJsMain by getting {
            dependencies { implementation("com.ionspin.kotlin:bignum:0.3.10") }
        }
    }
}
