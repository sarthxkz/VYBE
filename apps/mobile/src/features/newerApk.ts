import { API_URL } from '@/api/client';

export type LatestApk = { versionCode: number; versionName: string; url: string };

/** Returns the newer APK, or null. Only accepts an https URL on our own API host. */
export function newerApk(data: unknown, currentVersionCode: number, apiUrl = API_URL): LatestApk | null {
  const d = data as Partial<LatestApk> | null;
  if (!d || typeof d.versionCode !== 'number' || typeof d.url !== 'string' || typeof d.versionName !== 'string') return null;
  if (!d.url.startsWith(`${apiUrl}/app/android/`) || !apiUrl.startsWith('https://')) return null;
  return d.versionCode > currentVersionCode ? (d as LatestApk) : null;
}
