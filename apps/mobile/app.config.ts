import type { ExpoConfig } from 'expo/config';

// Set per build: EXPO_PUBLIC_API_URL (e.g. https://api.161-153-37-106.sslip.io). Never hardcode in source.
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const isRelease = process.env.APP_VARIANT === 'production';
if (isRelease && (!apiUrl || !apiUrl.startsWith('https://'))) {
  throw new Error('Production builds require EXPO_PUBLIC_API_URL with https://');
}

const config: ExpoConfig = {
  name: 'Vybe',
  slug: 'vybe',
  scheme: 'vybe',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  android: {
    package: 'app.vybe',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundColor: '#6C4CF5',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    allowBackup: false,
    permissions: ['android.permission.POST_NOTIFICATIONS'],
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'],
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
    predictiveBackGestureEnabled: true,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    'expo-image',
    ['expo-sqlite', { useSQLCipher: true }],
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#6C4CF5', dark: { backgroundColor: '#14121F' } },
    ],
    [
      'expo-location',
      {
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        locationWhenInUsePermission: 'Vybe shows your location only to friends you choose.',
      },
    ],
    ['expo-camera', { cameraPermission: 'Vybe uses the camera so you can snap photos for friends.', recordAudioAndroid: false }],
    ['expo-image-picker', { photosPermission: 'Pick a photo to send privately to friends.', microphonePermission: false }],
    ['expo-notifications', { color: '#6C4CF5' }],
    '@maplibre/maplibre-react-native',
    './plugins/withCoreLibraryDesugaring',
    './plugins/withShortCmakeObjectPaths',
    ...(process.env.GOOGLE_SERVICES_JSON ? ['@react-native-google-signin/google-signin'] : []),
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 26,
          // Cleartext only for local dev servers; release builds are HTTPS-only.
          usesCleartextTraffic: !isRelease,
          extraMavenRepos: ['https://build-artifacts.signal.org/libraries/maven/'],
          packagingOptions: { exclude: ['**/libsignal_jni*.dylib', '**/signal_jni*.dll', '**/libsignal_jni_testing.so'] },
        },
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: apiUrl ?? 'http://10.0.2.2:3000',
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? null,
    supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? null,
  },
};

export default config;
