import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import * as Application from 'expo-application';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeOutDown, SlideInDown } from 'react-native-reanimated';
import { Button, Text } from '@/ui';
import { palette, radius, space } from '@/theme';
import { API_URL } from '@/api/client';

// Native updates (a new APK). JS-only changes arrive silently through expo-updates instead.
// Published by scripts/publish-apk.mjs as /app/android/latest.json on the API host.
import { newerApk, type LatestApk } from './newerApk';
export { newerApk, type LatestApk };

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
    <Animated.View
      accessibilityRole="alert"
      entering={SlideInDown.springify().damping(18)}
      exiting={FadeOutDown}
      style={{ position: 'absolute', left: space.md, right: space.md, bottom: insets.bottom + space.md, zIndex: 100, backgroundColor: palette.ink, borderRadius: radius.lg, padding: space.md, gap: space.sm }}
    >
      <Text variant="label" color="#fff">
        Vybe {latest.versionName} is ready. Download it, then tap the file to install.
      </Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Download update" onPress={() => void Linking.openURL(latest.url)} style={{ flex: 1 }} />
        <Button title="Later" kind="secondary" onPress={() => setLatest(null)} />
      </View>
    </Animated.View>
  );
}
