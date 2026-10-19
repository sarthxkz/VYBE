import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { Text } from '@/ui';
import { palette } from '@/theme';

// Same geometry as scripts/make-icons.mjs (1024 canvas): two friends (dots) whose paths meet at one place.
const L = { x: 318, y: 318 };
const R = { x: 706, y: 318 };
const TIP = { x: 512, y: 742 };
const ARM = Math.hypot(TIP.x - L.x, TIP.y - L.y);
const VIEW = '150 180 724 680';

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);
const AEllipse = Animated.createAnimatedComponent(Ellipse);

/** Static mark, e.g. for headers. */
export function LogoMark({
  size = 40,
  color = palette.grape500,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox={VIEW} accessibilityLabel="Vybe">
      <Path
        d={`M${L.x} ${L.y} L${TIP.x} ${TIP.y} L${R.x} ${R.y}`}
        fill="none"
        stroke={color}
        strokeWidth={124}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={L.x} cy={L.y} r={96} fill={palette.coral500} stroke={color} strokeWidth={28} />
      <Circle cx={R.x} cy={R.y} r={96} fill={palette.lime400} stroke={color} strokeWidth={28} />
    </Svg>
  );
}

function Arm({
  from,
  draw,
  color,
}: {
  from: { x: number; y: number };
  draw: SharedValue<number>;
  color: string;
}) {
  const props = useAnimatedProps(() => ({ strokeDashoffset: ARM * (1 - draw.value) }));
  return (
    <APath
      d={`M${from.x} ${from.y} L${TIP.x} ${TIP.y}`}
      stroke={color}
      strokeWidth={124}
      strokeLinecap="round"
      strokeDasharray={`${ARM} ${ARM}`}
      animatedProps={props}
    />
  );
}

function Dot({
  at,
  fill,
  pop,
  stroke,
}: {
  at: { x: number; y: number };
  fill: string;
  pop: SharedValue<number>;
  stroke: string;
}) {
  const props = useAnimatedProps(() => ({ r: 96 * pop.value, strokeWidth: 28 * pop.value }));
  return <ACircle cx={at.x} cy={at.y} fill={fill} stroke={stroke} animatedProps={props} />;
}

function Letter({ ch, i, rise }: { ch: string; i: number; rise: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, rise.value * 4 - i * 0.6));
    return { opacity: t, transform: [{ translateY: (1 - t) * 18 }] };
  });
  return (
    <Animated.View style={style}>
      <Text variant="hero" color="#FFFFFF" style={{ fontSize: 56, lineHeight: 64 }}>
        {ch}
      </Text>
    </Animated.View>
  );
}

/**
 * The intro's opening: dots pop in, their paths draw down and meet, a ripple lands, "vybe" rises.
 * Calls onDone when finished (immediately, in its final state, under reduced motion).
 */
export function AnimatedLogo({ size = 180, onDone }: { size?: number; onDone?: () => void }) {
  const reduced = useReducedMotion();
  const pop = useSharedValue(reduced ? 1 : 0);
  const draw = useSharedValue(reduced ? 1 : 0);
  const ripple = useSharedValue(reduced ? 1 : 0);
  const rise = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      onDone?.();
      return;
    }
    pop.value = withSpring(1, { damping: 9, stiffness: 140 });
    draw.value = withDelay(
      320,
      withTiming(1, { duration: 620, easing: Easing.inOut(Easing.cubic) }),
    );
    ripple.value = withDelay(
      900,
      withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }),
    );
    rise.value = withDelay(
      1000,
      withTiming(
        1,
        { duration: 700, easing: Easing.out(Easing.cubic) },
        (ok) => ok && onDone && runOnJS(onDone)(),
      ),
    );
    // Shared values are stable refs; run the sequence once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const rippleProps = useAnimatedProps(() => ({
    rx: 60 + 120 * ripple.value,
    ry: 16 + 30 * ripple.value,
    strokeOpacity: reduced ? 0.35 : 0.7 * (1 - ripple.value) + 0.2,
  }));

  return (
    <View
      style={{ alignItems: 'center' }}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Vybe"
    >
      <Svg width={size} height={size} viewBox={VIEW}>
        <AEllipse
          cx={TIP.x}
          cy={TIP.y + 58}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={16}
          animatedProps={rippleProps}
        />
        <Arm from={L} draw={draw} color="#FFFFFF" />
        <Arm from={R} draw={draw} color="#FFFFFF" />
        <Dot at={L} fill={palette.coral500} pop={pop} stroke="#FFFFFF" />
        <Dot at={R} fill={palette.lime400} pop={pop} stroke="#FFFFFF" />
      </Svg>
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        {'vybe'.split('').map((ch, i) => (
          <Letter key={ch} ch={ch} i={i} rise={rise} />
        ))}
      </View>
    </View>
  );
}
