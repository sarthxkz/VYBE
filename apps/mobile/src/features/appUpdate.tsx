import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import * as Application from 'expo-application';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '@/ui';
import { palette, radius, space } from '@/theme';
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

export function AppUpdateBanner() {
  const insets = useSafeAreaInsets();
  const [latest, setLatest] = useState<LatestApk | null>(null);

  useEffect(() => {
    const current = Number(Application.nativeBuildVersion);
    if (!Number.isFinite(current)) return;
    fetch(`${API_URL}/app/android/latest.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLatest(newerApk(d, current)))
      .catch(() => {}); // offline or not published yet: try again next launch
  }, []);

  if (!latest) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ position: 'absolute', left: space.md, right: space.md, bottom: insets.bottom + space.md, zIndex: 100, backgroundColor: palette.ink, borderRadius: radius.lg, padding: space.md, gap: space.sm }}
    >
      <Text variant="label" color="#fff">
        Vybe {latest.versionName} is ready. Download it, then tap the file to install.
      </Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Download update" onPress={() => void Linking.openURL(latest.url)} style={{ flex: 1 }} />
        <Button title="Later" kind="secondary" onPress={() => setLatest(null)} />
      </View>
    </View>
  );
}
