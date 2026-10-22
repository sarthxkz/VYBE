import { useEffect, useState } from 'react';
import Animated, { FadeOutUp, SlideInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
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
    <Animated.View
      accessibilityRole="alert"
      entering={SlideInUp.springify().damping(18)}
      exiting={FadeOutUp}
      style={{ position: 'absolute', top: insets.top + space.sm, alignSelf: 'center', zIndex: 100, backgroundColor: palette.ink, borderRadius: 999, paddingHorizontal: space.lg, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
    >
      <Ionicons name="cloud-offline" size={16} color={palette.amber500} />
      <Text variant="label" color="#fff">
        You’re offline. We’ll catch up when you’re back.
      </Text>
    </Animated.View>
  );
}
