import { useEffect, useState } from 'react';
import { View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/ui';
import { palette, space } from '@/theme';

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const insets = useSafeAreaInsets();
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false)), []);
  if (!offline) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ position: 'absolute', top: insets.top + space.sm, alignSelf: 'center', zIndex: 100, backgroundColor: palette.ink, borderRadius: 999, paddingHorizontal: space.lg, paddingVertical: space.sm }}
    >
      <Text variant="label" color="#fff">
        You’re offline. We’ll catch up when you’re back.
      </Text>
    </View>
  );
}
