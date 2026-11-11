plugins {
    id("com.android.library") version "9.2.1"
    id("org.jetbrains.kotlin.multiplatform") version "2.4.10" apply false
}

android {
    namespace = "mlem.heads"
    compileSdk = 37

    defaultConfig {
        minSdk = 28
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

val valenced = providers.gradleProperty("valenced").get()

dependencies {
    compileOnly(files("$valenced/android/api/build/intermediates/aar_main_jar/release/syncReleaseLibJars/classes.jar"))
    compileOnly(files("$valenced/core/build/intermediates/aar_main_jar/androidMain/syncAndroidMainLibJars/classes.jar"))
    compileOnly("de.robv.android.xposed:api:82")
}
