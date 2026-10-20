import { useEffect } from 'react';
import { StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { palette } from '@/theme';

function Blob({ color, size, x, y, t, phase, opacity }: { color: string; size: number; x: number; y: number; t: SharedValue<number>; phase: number; opacity: number }) {
  const style = useAnimatedStyle(() => {
    const a = (t.value + phase) * Math.PI * 2;
    return { transform: [{ translateX: x + 28 * Math.sin(a) }, { translateY: y + 22 * Math.cos(a * 0.8) }, { scale: 1 + 0.06 * Math.sin(a * 1.3) }] };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity }, style]} />;
}

/**
 * Soft brand-colour glows drifting slowly behind a screen. Purely decorative: no touches, hidden from screen
 * readers, and frozen in place under the system "reduce motion" setting. Runs on the UI thread (Reanimated).
 */
export function Ambient({ intensity = 1 }: { intensity?: number }) {
  const dark = useColorScheme() === 'dark';
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!reduced) t.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.linear }), -1, false);
  }, [reduced, t]);
  // Dark backgrounds need more colour to read; light ones less, so text keeps its contrast.
  const o = (dark ? 0.22 : 0.13) * intensity;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Blob color={palette.grape500} size={width * 0.95} x={-width * 0.4} y={-height * 0.08} t={t} phase={0} opacity={o} />
      <Blob color={palette.coral500} size={width * 0.75} x={width * 0.5} y={height * 0.3} t={t} phase={0.33} opacity={o * 0.9} />
      <Blob color={palette.lime400} size={width * 0.7} x={-width * 0.2} y={height * 0.7} t={t} phase={0.66} opacity={o} />
    </View>
  );
}
