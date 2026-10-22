import { useEffect, useId, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text as RNText, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
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

/**
 * Pops in on mount: a short rise with a slight scale-up on a stiff spring, the crisp entrance social apps use
 * (a slow drift reads as sluggish). `index` staggers siblings; the delay is capped so long lists don't wait.
 */
export function Appear({ children, index = 0, delay = 0, style }: { children: ReactNode; index?: number; delay?: number; style?: StyleProp<ViewStyle> }) {
  const d = delay + Math.min(index, 8) * motion.stagger;
  const entering = () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: 16 }, { scale: 0.96 }] },
      animations: {
        opacity: withDelay(d, withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) })),
        transform: [{ translateY: withDelay(d, withSpring(0, motion.pop)) }, { scale: withDelay(d, withSpring(1, motion.pop)) }],
      },
    };
  };
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}

/** Instagram-style loading shimmer: a soft highlight sweeping across the placeholder. */
export function Shimmer({ color = 'rgba(255,255,255,0.45)' }: { color?: string }) {
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced || !w) return;
    t.value = withRepeat(withTiming(1, { duration: 1150, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [t, w, reduced]);
  const band = useAnimatedStyle(() => ({ transform: [{ translateX: -w + t.value * w * 2 }] }));
  const id = `s${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && !reduced && (
        <Animated.View style={[{ width: w, height: '100%' }, band]}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0.2" stopColor={color} stopOpacity={0} />
                <Stop offset="0.5" stopColor={color} stopOpacity={1} />
                <Stop offset="0.8" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${id})`} />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

/** Slowly turning gradient ring layer (unseen stories). Put it inside a round, overflow-hidden parent. */
export function SpinningGradient({ colors, duration = 3200 }: { colors: readonly [string, string]; duration?: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
  }, [t, duration, reduced]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${t.value * 360}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, spin]}>
      <Gradient colors={colors} />
    </Animated.View>
  );
}

const BURST = [0, 60, 120, 180, 240, 300];

/**
 * Double-tap like: a big heart springs up past full size, settles, floats off, while small hearts burst
 * outward. Calls onDone when finished so the parent can unmount it.
 */
export function HeartBurst({ size = 72, onDone }: { size?: number; onDone?: () => void }) {
  const reduced = useReducedMotion();
  const pop = useSharedValue(0);
  const fly = useSharedValue(0);
  useEffect(() => {
    pop.value = reduced ? 1 : withSequence(withSpring(1.25, { damping: 7, stiffness: 320, mass: 0.6 }), withSpring(1, motion.press), withDelay(260, withTiming(0, { duration: 220 })));
    fly.value = reduced ? 1 : withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    const t = setTimeout(() => onDone?.(), reduced ? 500 : 1000);
    return () => clearTimeout(t);
  }, [pop, fly, reduced, onDone]);
  const big = useAnimatedStyle(() => ({ opacity: Math.min(1, pop.value * 1.5), transform: [{ scale: pop.value }, { translateY: -12 * fly.value }] }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {!reduced && BURST.map((deg) => <Particle key={deg} deg={deg} t={fly} distance={size * 0.9} />)}
      <Animated.View style={big}>
        <RNText style={{ fontSize: size * 0.8 }}>❤️</RNText>
      </Animated.View>
    </View>
  );
}

function Particle({ deg, t, distance }: { deg: number; t: { value: number }; distance: number }) {
  const rad = (deg * Math.PI) / 180;
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    opacity: t.value < 0.15 ? t.value / 0.15 : 1 - t.value,
    transform: [{ translateX: Math.cos(rad) * distance * t.value }, { translateY: Math.sin(rad) * distance * t.value }, { scale: 0.4 + 0.6 * (1 - t.value) }],
  }));
  return (
    <Animated.View style={style}>
      <RNText style={{ fontSize: 16 }}>💖</RNText>
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
