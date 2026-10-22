import { API_URL } from '@/api/client';

// Native updates (a new APK). JS-only changes arrive silently through expo-updates instead.
// Published by scripts/publish-apk.mjs as /app/android/latest.json on the API host.
export type LatestApk = { versionCode: number; versionName: string; url: string };

/** Returns the newer APK, or null. Only accepts an https URL on our own API host. */
export function newerApk(data: unknown, currentVersionCode: number, apiUrl = API_URL): LatestApk | null {
  const d = data as Partial<LatestApk> | null;
  if (!d || typeof d.versionCode !== 'number' || typeof d.url !== 'string' || typeof d.versionName !== 'string') return null;
  if (!d.url.startsWith(`${apiUrl}/app/android/`) || !apiUrl.startsWith('https://')) return null;
  return d.versionCode > currentVersionCode ? (d as LatestApk) : null;
}
