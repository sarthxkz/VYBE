import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { palette } from '@/theme';

/** Expanding ring behind a pin. Static when the user prefers reduced motion. */
export function Pulse({ size, color, delay = 0 }: { size: number; color: string; delay?: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const id = setTimeout(() => {
      t.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false);
    }, delay);
    return () => clearTimeout(id);
  }, [reduced, delay, t]);
  const style = useAnimatedStyle(() => ({ opacity: reduced ? 0.25 : 0.5 * (1 - t.value), transform: [{ scale: reduced ? 1.2 : 0.6 + t.value * 1.2 }] }));
  return <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

function Pin({ x, y, color, delay }: { x: number; y: number; color: string; delay: number }) {
  return (
    <View style={{ position: 'absolute', left: x - 22, top: y - 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Pulse size={44} color={color} delay={delay} />
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color, borderWidth: 3, borderColor: '#fff' }} />
    </View>
  );
}

export function MapIllustration() {
  return (
    <View style={{ width: 280, height: 260 }}>
      <Svg width={280} height={260} viewBox="0 0 280 260">
        <Rect x={0} y={0} width={280} height={260} rx={36} fill={palette.grape50} />
        <Path d="M0 170 C70 140 110 210 180 180 S260 120 280 140 V260 H0Z" fill="#DCF7A4" />
        <Path d="M30 0 C60 80 20 120 70 260" stroke="#fff" strokeWidth={14} fill="none" />
        <Path d="M0 90 H280" stroke="#fff" strokeWidth={10} />
        <Path d="M190 0 C170 90 230 140 200 260" stroke="#fff" strokeWidth={8} fill="none" />
        <Circle cx={230} cy={60} r={26} fill="#BDEBFF" />
      </Svg>
      <Pin x={90} y={70} color={palette.coral500} delay={0} />
      <Pin x={200} y={150} color={palette.grape500} delay={500} />
      <Pin x={120} y={200} color={palette.sky500} delay={1000} />
    </View>
  );
}

export function PhotoIllustration() {
  return (
    <Svg width={280} height={260} viewBox="0 0 280 260">
      <G transform="rotate(-8 140 130)">
        <Rect x={50} y={40} width={150} height={180} rx={14} fill="#fff" stroke={palette.gray200} strokeWidth={2} />
        <Rect x={62} y={52} width={126} height={120} rx={8} fill={palette.coral400} />
        <Circle cx={150} cy={90} r={16} fill="#FFE08A" />
        <Path d="M62 172 L110 120 L150 160 L170 140 L188 160 V172 Z" fill={palette.grape500} />
      </G>
      <G transform="rotate(7 160 130)">
        <Rect x={95} y={55} width={150} height={180} rx={14} fill="#fff" stroke={palette.gray200} strokeWidth={2} />
        <Rect x={107} y={67} width={126} height={120} rx={8} fill={palette.sky500} />
        <Path d="M107 187 L150 140 L190 175 L233 150 V187 Z" fill={palette.lime400} />
      </G>
    </Svg>
  );
}

export function ChatIllustration() {
  return (
    <Svg width={280} height={260} viewBox="0 0 280 260">
      <Rect x={20} y={40} width={170} height={60} rx={30} fill={palette.grape100} />
      <Rect x={90} y={120} width={170} height={60} rx={30} fill={palette.grape500} />
      <Rect x={44} y={62} width={100} height={14} rx={7} fill={palette.grape500} opacity={0.35} />
      <Rect x={114} y={143} width={120} height={14} rx={7} fill="#fff" opacity={0.6} />
      <G transform="translate(100 190)">
        <Rect x={0} y={20} width={80} height={56} rx={14} fill={palette.coral500} />
        <Path d="M18 22 V10 a22 22 0 0 1 44 0 V22" stroke={palette.coral500} strokeWidth={10} fill="none" />
        <Circle cx={40} cy={46} r={8} fill="#fff" />
      </G>
    </Svg>
  );
}

export function ControlIllustration() {
  return (
    <Svg width={280} height={260} viewBox="0 0 280 260">
      <Rect x={40} y={60} width={200} height={84} rx={42} fill={palette.ink} />
      <Circle cx={198} cy={102} r={32} fill={palette.lime400} />
      <Path d="M110 190 c0-30 20-50 30-50 s30 20 30 50 v30 l-10-10 -10 10 -10-10 -10 10 -10-10 -10 10z" fill="#fff" stroke={palette.ink} strokeWidth={4} />
      <Circle cx={130} cy={180} r={5} fill={palette.ink} />
      <Circle cx={150} cy={180} r={5} fill={palette.ink} />
    </Svg>
  );
}
