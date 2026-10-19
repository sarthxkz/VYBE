import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Button, Screen, Text } from '@/ui';
import { palette, radius, space, useColors } from '@/theme';
import { intro } from '@/copy';
import { useSession } from '@/stores/session';
import {
  ChatIllustration,
  ControlIllustration,
  MapIllustration,
  PhotoIllustration,
} from '@/features/Illustrations';
import { AnimatedLogo, LogoMark } from '@/features/brand/Logo';

const art = [MapIllustration, PhotoIllustration, ChatIllustration, ControlIllustration];
const AFlatList = Animated.createAnimatedComponent(FlatList<(typeof intro)[number]>);

/** Soft colour glow drifting behind the opening logo. */
function Glow({
  color,
  size,
  x,
  y,
  drift,
}: {
  color: string;
  size: number;
  x: number;
  y: number;
  drift: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x + 30 * Math.sin(drift.value * Math.PI * 2) },
      { translateY: y + 24 * Math.cos(drift.value * Math.PI * 2) },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: 0.35,
        },
        style,
      ]}
    />
  );
}

/** Full-screen opening: animated logo on grape, then it lifts away to reveal the slides. Skipped under reduced motion. */
function Opening({ onFinished }: { onFinished: () => void }) {
  const { width, height } = useWindowDimensions();
  const drift = useSharedValue(0);
  const out = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1, false);
  }, [drift]);
  const leave = () => {
    out.value = withTiming(1, { duration: 450, easing: Easing.in(Easing.cubic) });
    setTimeout(onFinished, 460);
  };
  const style = useAnimatedStyle(() => ({
    opacity: 1 - out.value,
    transform: [{ translateY: -height * 0.15 * out.value }, { scale: 1 + 0.08 * out.value }],
  }));
  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 10, backgroundColor: palette.grape500, overflow: 'hidden' },
        style,
      ]}
    >
      <Glow
        color={palette.coral500}
        size={width * 0.9}
        x={-width * 0.35}
        y={height * 0.05}
        drift={drift}
      />
      <Glow
        color={palette.lime400}
        size={width * 0.8}
        x={width * 0.45}
        y={height * 0.55}
        drift={drift}
      />
      <Glow
        color={palette.sky500}
        size={width * 0.6}
        x={width * 0.1}
        y={height * 0.75}
        drift={drift}
      />
      <Pressable
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        onPress={leave}
        accessibilityLabel="Skip intro animation"
        accessibilityRole="button"
      >
        <AnimatedLogo size={190} onDone={() => setTimeout(leave, 700)} />
      </Pressable>
    </Animated.View>
  );
}

function Slide({
  item,
  i,
  x,
  width,
}: {
  item: (typeof intro)[number];
  i: number;
  x: SharedValue<number>;
  width: number;
}) {
  const Art = art[i]!;
  const reduced = useReducedMotion();
  const range = [(i - 1) * width, i * width, (i + 1) * width];
  const artStyle = useAnimatedStyle(() =>
    reduced
      ? {}
      : {
          opacity: interpolate(x.value, range, [0.2, 1, 0.2], 'clamp'),
          transform: [
            { translateX: interpolate(x.value, range, [width * 0.35, 0, -width * 0.35], 'clamp') },
            { scale: interpolate(x.value, range, [0.8, 1, 0.8], 'clamp') },
          ],
        },
  );
  const textStyle = useAnimatedStyle(() =>
    reduced
      ? {}
      : {
          opacity: interpolate(x.value, range, [0, 1, 0], 'clamp'),
          transform: [{ translateY: interpolate(x.value, range, [24, 0, 24], 'clamp') }],
        },
  );
  return (
    <View
      style={{
        width,
        paddingHorizontal: space.xl,
        justifyContent: 'center',
        alignItems: 'center',
        gap: space.xxl,
      }}
    >
      <Animated.View style={artStyle}>
        <Art />
      </Animated.View>
      <Animated.View style={[{ gap: space.md, alignItems: 'center' }, textStyle]}>
        <Text variant="hero" style={{ textAlign: 'center' }} accessibilityRole="header">
          {item.title}
        </Text>
        <Text muted style={{ textAlign: 'center', maxWidth: 320 }}>
          {item.body}
        </Text>
      </Animated.View>
    </View>
  );
}

function Dot({
  i,
  x,
  width,
  color,
}: {
  i: number;
  x: SharedValue<number>;
  width: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const t = interpolate(
      x.value,
      [(i - 1) * width, i * width, (i + 1) * width],
      [0, 1, 0],
      'clamp',
    );
    return { width: 8 + 16 * t, opacity: 0.45 + 0.55 * t };
  });
  return (
    <Animated.View
      style={[{ height: 8, borderRadius: radius.pill, backgroundColor: color }, style]}
    />
  );
}

export default function Intro() {
  const c = useColors();
  const router = useRouter();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [opening, setOpening] = useState(!reduced);
  const list = useRef<FlatList>(null);
  const x = useSharedValue(0);
  const markIntroSeen = useSession((s) => s.markIntroSeen);
  const last = index === intro.length - 1;
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });
  // Programmatic scrolls don't reliably fire onMomentumScrollEnd on Android, so track the index here too.
  const go = (i: number) => {
    setIndex(i);
    list.current?.scrollToIndex({ index: i, animated: !reduced });
  };

  const finish = async (to: '/sign-up' | '/sign-in') => {
    router.replace(to);
    await markIntroSeen();
  };

  // The content behind the opening eases in as it lifts away.
  const enter = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!opening)
      enter.value = withDelay(
        80,
        withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }),
      );
  }, [opening, enter]);
  const enterStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 24 }],
  }));

  return (
    <View style={{ flex: 1 }}>
      <Screen padded={false}>
        <Animated.View style={enterStyle}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: space.xl,
              paddingTop: space.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <LogoMark size={32} color={c.link} />
              <Text variant="title" color={c.link} accessibilityRole="header">
                vybe
              </Text>
            </View>
            {!last && <Button title="Skip" kind="ghost" onPress={() => go(intro.length - 1)} />}
          </View>
          <AFlatList
            ref={list}
            data={intro}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(s) => s.title}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item, index: i }) => <Slide item={item} i={i} x={x} width={width} />}
          />
          <View style={{ paddingHorizontal: space.xl, gap: space.md, paddingBottom: space.lg }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                gap: space.sm,
                marginBottom: space.md,
              }}
              accessibilityLabel={`Step ${index + 1} of ${intro.length}`}
            >
              {intro.map((s, i) => (
                <Dot key={s.title} i={i} x={x} width={width} color={c.brand} />
              ))}
            </View>
            {last ? (
              <>
                <Button title="Create account" kind="action" onPress={() => finish('/sign-up')} />
                <Button
                  title="I already have an account"
                  kind="ghost"
                  onPress={() => finish('/sign-in')}
                />
              </>
            ) : (
              <Button title="Next" onPress={() => go(index + 1)} />
            )}
          </View>
        </Animated.View>
      </Screen>
      {opening && <Opening onFinished={() => setOpening(false)} />}
    </View>
  );
}
