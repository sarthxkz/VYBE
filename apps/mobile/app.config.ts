import type { ExpoConfig } from 'expo/config';

// Set per build: EXPO_PUBLIC_API_URL (e.g. https://api.161-153-37-106.sslip.io). Never hardcode in source.
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const isRelease = process.env.APP_VARIANT === 'production';
if (isRelease && (!apiUrl || !apiUrl.startsWith('https://'))) {
  throw new Error('Production builds require EXPO_PUBLIC_API_URL with https://');
}

// Bump VERSION (and android.versionCode) whenever native code changes: over-the-air updates only reach
// APKs with the same runtime version, so a JS update can never land on incompatible native code.
const VERSION = '0.1.0';
const VERSION_CODE = 1;

const config: ExpoConfig = {
  name: 'Vybe',
  slug: 'vybe',
  scheme: 'vybe',
  version: VERSION,
  runtimeVersion: VERSION,
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  android: {
    package: 'app.vybe',
    versionCode: VERSION_CODE,
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
    './plugins/withCmakeVersion',
    './plugins/withReleaseSigning',
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
  // Self-hosted OTA (scripts/publish-update.mjs). Updates are signed on the developer machine; the app
  // rejects any manifest not signed by the key behind certs/ota-certificate.pem, so the VM can't inject code.
  updates: apiUrl?.startsWith('https://')
    ? {
        url: `${apiUrl}/ota/android/${VERSION}/manifest`,
        checkAutomatically: 'ON_LOAD',
        fallbackToCacheTimeout: 0,
        codeSigningCertificate: './certs/ota-certificate.pem',
        codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
      }
    : { enabled: false },
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: apiUrl ?? 'http://10.0.2.2:3000',
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? null,
    supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? null,
  },
};

export default config;
