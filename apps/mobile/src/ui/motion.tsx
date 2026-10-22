import { useEffect, useId, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { motion } from '@/theme';

const APressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable that sinks under the finger on a spring and springs back on release, like native buttons do.
 * `scaleTo` is how far it sinks; big surfaces want less (0.98), small buttons more (0.92).
 */
export function PressScale({
  children,
  style,
  scaleTo = 0.96,
  onPressIn,
  onPressOut,
  ...p
}: Omit<PressableProps, 'style' | 'children'> & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({
    // Scale only: an animated opacity would override the caller's (e.g. a disabled button's 0.5).
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, scaleTo]) }],
  }));
  return (
    <APressable
      {...p}
      onPressIn={(e) => {
        pressed.set(reduced ? 1 : withSpring(1, motion.press));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.set(reduced ? 0 : withSpring(0, motion.press));
        onPressOut?.(e);
      }}
      style={[style, anim]}
    >
      {children}
    </APressable>
  );
}

/** Rises and fades in on mount. `index` staggers siblings; the delay is capped so long lists don't wait. */
export function Appear({ children, index = 0, delay = 0, style }: { children: ReactNode; index?: number; delay?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay + Math.min(index, 10) * motion.stagger)
        .springify()
        .damping(motion.snappy.damping)
        .stiffness(motion.snappy.stiffness)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** Slow breathing loop (0 → 1 → 0) for placeholders, live dots and idle decoration. */
export function useBreathe(duration = 1100) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [t, duration, reduced]);
  return t;
}

/** Gentle up-and-down float, e.g. for empty-state art. */
export function Float({ children, distance = 6 }: { children: ReactNode; distance?: number }) {
  const t = useBreathe(1800);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -distance * t.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Expanding ring behind a live element (the "this is happening now" pulse). */
export function PulseRing({ size, color }: { size: number; color: string }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
  }, [t, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - t.value), transform: [{ scale: 1 + t.value * 1.4 }] }));
  if (reduced) return null;
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

/** Three bouncing dots: someone is typing. */
export function TypingDots({ color, size = 6 }: { color: string; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.6, alignItems: 'center', height: size * 2 }} accessibilityLabel="typing">
      {[0, 1, 2].map((i) => (
        <Dot key={i} i={i} color={color} size={size} />
      ))}
    </View>
  );
}

function Dot({ i, color, size }: { i: number; color: string; size: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withDelay(
      i * 140,
      withRepeat(withSequence(withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: 260 })), -1),
    );
  }, [t, i, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * t.value, transform: [{ translateY: -size * 0.6 * t.value }] }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

/** Fills its parent with a two-stop gradient. Diagonal by default. */
export function Gradient({ colors, angle = 'diagonal', style }: { colors: readonly [string, string]; angle?: 'diagonal' | 'vertical' | 'horizontal'; style?: StyleProp<ViewStyle> }) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const end = { diagonal: { x2: '1', y2: '1' }, vertical: { x2: '0', y2: '1' }, horizontal: { x2: '1', y2: '0' } }[angle];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" {...end}>
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Soft radial glow, for atmosphere behind hero content. */
export function Glow({ color, size, style, opacity = 0.5 }: { color: string; size: number; style?: StyleProp<ViewStyle>; opacity?: number }) {
  const id = `r${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
