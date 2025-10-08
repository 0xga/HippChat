export default {
  expo: {
    name: "HippChat",
    scheme: "hippchat",
    slug: "hippchat",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundColor: "#ffffff"
      }
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router"
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      hippS3Endpoint: process.env.HIPP_S3_ENDPOINT || "https://s3.hippius.com",
      hippRegion: process.env.HIPP_REGION || "us-east-1",
      usePerUserBucket: process.env.USE_PER_USER_BUCKET === "true",
      useS4Append: process.env.USE_S4_APPEND !== "false"
    }
  }
};
