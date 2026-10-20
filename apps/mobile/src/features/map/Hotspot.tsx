import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Text } from '@/ui';
import { palette, radius, shadow, space } from '@/theme';

/** A glowing, gently pulsing "🔥 3 friends here" marker. */
export function Hotspot({ count }: { count: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!reduced) t.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
  }, [reduced, t]);
  const ring = useAnimatedStyle(() => ({ opacity: reduced ? 0.35 : 0.55 * (1 - t.value), transform: [{ scale: reduced ? 1.4 : 0.8 + t.value * 1.2 }] }));
  const size = 70 + Math.min(count, 8) * 8;
  return (
    <View style={{ width: size * 2, height: size * 2, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`Hotspot: ${count} friends here`}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: palette.coral500 }, ring]} />
      <View style={{ position: 'absolute', width: size * 0.7, height: size * 0.7, borderRadius: size, backgroundColor: palette.coral400, opacity: 0.35 }} />
      <View style={[{ backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3 }, shadow.card]}>
        <Text variant="label" color={palette.coral600}>
          🔥 {count} friends here
        </Text>
      </View>
    </View>
  );
}
