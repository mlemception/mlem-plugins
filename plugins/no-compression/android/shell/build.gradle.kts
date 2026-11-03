plugins {
    id("com.android.application")
}

android {
    namespace = "mlem.nocomp.shell"
    compileSdk = 37

    defaultConfig {
        minSdk = 24
    }
}

dependencies {
    implementation("androidx.media3:media3-transformer:1.11.1")
    implementation("androidx.media3:media3-effect:1.11.1")
}
