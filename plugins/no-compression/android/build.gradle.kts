plugins {
    id("com.android.library") version "9.2.1"
    id("com.android.application") version "9.2.1" apply false
    id("org.jetbrains.kotlin.multiplatform") version "2.4.10" apply false
}

android {
    namespace = "mlem.nocomp"
    compileSdk = 37

    defaultConfig {
        minSdk = 24
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

val valenced = providers.gradleProperty("valenced").get()
val media3 = "1.11.1"
val bundle: Configuration by configurations.creating

dependencies {
    compileOnly(files("$valenced/android/api/build/intermediates/aar_main_jar/release/syncReleaseLibJars/classes.jar"))
    compileOnly(files("$valenced/core/build/intermediates/aar_main_jar/androidMain/syncAndroidMainLibJars/classes.jar"))
    compileOnly("androidx.media3:media3-transformer:$media3")
    compileOnly("androidx.media3:media3-effect:$media3")
    compileOnly("androidx.media3:media3-common:$media3")
    bundle("androidx.media3:media3-transformer:$media3")
    bundle("androidx.media3:media3-effect:$media3")
}

tasks.register<Copy>("bundleDeps") {
    from(bundle)
    into(layout.buildDirectory.dir("bundle"))
}
