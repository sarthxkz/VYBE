import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  useColorScheme,
  View,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { interpolate, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import { font, gradient, motion, palette, radius, shadow, space, type as typeScale, useColors, type TypeVariant } from '@/theme';
import { Character, type AvatarLook } from './character';
import { Ambient } from './Ambient';
import { Appear, Float, Gradient, PressScale, Shimmer } from './motion';
import { mediaSource } from '@/api/client';

export function Text({ variant = 'body', muted, color, style, ...p }: TextProps & { variant?: TypeVariant; muted?: boolean; color?: string }) {
  const c = useColors();
  return <RNText {...p} maxFontSizeMultiplier={1.6} style={[typeScale[variant], { color: color ?? (muted ? c.textMuted : c.text) }, style]} />;
}

export function Screen({
  children,
  scroll,
  edges = ['top', 'bottom'],
  style,
  padded = true,
  ambient,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  /** Soft drifting brand glows behind the content (decorative). */
  ambient?: boolean;
}) {
  const c = useColors();
  const inner = [padded && { paddingHorizontal: space.xl }, style];
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {ambient && <Ambient />}
      {scroll ? (
        <ScrollView contentContainerStyle={[{ paddingBottom: space.xxxl }, inner]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** Big tab-screen title with an optional subtitle and trailing action; slides in when the screen mounts. */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <Appear style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.md, gap: space.md }}>
      <View style={{ flex: 1 }}>
        <Text variant="hero" accessibilityRole="header" style={{ fontSize: 34, lineHeight: 40 }}>
          {title}
        </Text>
        {typeof subtitle === 'string' ? <Text muted>{subtitle}</Text> : subtitle}
      </View>
      {right}
    </Appear>
  );
}

type ButtonKind = 'primary' | 'action' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  kind = 'primary',
  loading,
  disabled,
  icon,
  onPress,
  style,
  ...p
}: Omit<PressableProps, 'style'> & { title: string; kind?: ButtonKind; loading?: boolean; icon?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const bg = { primary: c.brand, action: c.action, secondary: c.surfaceAlt, ghost: 'transparent', danger: c.danger }[kind];
  const fg = { primary: c.brandText, action: c.actionText, secondary: c.link, ghost: c.link, danger: '#FFFFFF' }[kind];
  const fill = kind === 'primary' ? gradient.brand : kind === 'action' ? gradient.action : null;
  const off = disabled || loading;
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={(e) => {
        void Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={[styles.button, { backgroundColor: bg, opacity: off ? 0.5 : 1 }, fill && !off && shadow.card, style]}
      {...p}
    >
      {fill && <Gradient colors={fill} angle="horizontal" />}
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <RNText style={[typeScale.bodyStrong, { color: fg }]} maxFontSizeMultiplier={1.4}>
        {title}
      </RNText>
    </PressScale>
  );
}

/** Round icon-only button (map controls, headers). */
export function IconButton({ icon, label, onPress, color, size = 48, style }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void; color?: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      scaleTo={0.9}
      hitSlop={6}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }, shadow.card, style]}
    >
      <Ionicons name={icon} size={size * 0.46} color={color ?? c.link} />
    </PressScale>
  );
}

export function Input({ label, error, hint, style, secureTextEntry, onFocus, onBlur, ...p }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const c = useColors();
  const reduced = useReducedMotion();
  const focus = useSharedValue(0);
  const [hidden, setHidden] = useState(true);
  const frame = useAnimatedStyle(() => ({
    borderColor: error ? c.danger : interpolateColor(focus.value, [0, 1], [c.border, c.brand]),
    transform: [{ scale: interpolate(focus.value, [0, 1], [1, 1.01]) }],
  }));
  const set = (v: number) => focus.set(reduced ? v : withTiming(v, { duration: motion.fast }));
  return (
    <View style={{ gap: space.xs, marginBottom: space.lg }}>
      <Text variant="label">{label}</Text>
      <Animated.View style={[styles.input, { backgroundColor: c.surface }, frame]}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={c.textMuted}
          secureTextEntry={secureTextEntry && hidden}
          onFocus={(e) => {
            set(1);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            set(0);
            onBlur?.(e);
          }}
          style={[{ flex: 1, minHeight: 52, color: c.text, fontFamily: font.body, fontSize: 16 }, style]}
          {...p}
        />
        {secureTextEntry && (
          <Pressable accessibilityRole="button" accessibilityLabel={hidden ? 'Show password' : 'Hide password'} hitSlop={10} onPress={() => setHidden((h) => !h)}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={c.textMuted} />
          </Pressable>
        )}
      </Animated.View>
      {error ? (
        <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(14)}>
          <Text variant="caption" color={c.danger} accessibilityLiveRegion="polite">
            {error}
          </Text>
        </Animated.View>
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const c = useColors();
  const base = [styles.card, { backgroundColor: c.surface, borderColor: c.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <PressScale accessibilityRole="button" onPress={onPress} scaleTo={0.98} style={base}>
      {children}
    </PressScale>
  );
}

const avatarColors = ['#6C4CF5', '#FF6B4A', '#1F9D57', '#3EC6FF', '#E5512F', '#5536DB'];

export function Avatar({ mediaId, name, size = 44, ring, look }: { mediaId?: string | null; name?: string | null; size?: number; ring?: string; look?: AvatarLook | null }) {
  const label = (name ?? '?').trim();
  const initials = label.slice(0, 1).toUpperCase();
  const bg = avatarColors[(label.charCodeAt(0) || 0) % avatarColors.length]!;
  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      accessibilityLabel={`${label} avatar`}
      style={[box, { backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, ring && { borderWidth: 3, borderColor: ring }]}
    >
      {look ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.grape100 }]}>
          <Character look={look} size={size} />
        </View>
      ) : mediaId ? (
        <Image source={mediaSource(mediaId)} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <>
          <Gradient colors={[bg, palette.grape900]} style={{ opacity: 0.35 }} />
          <RNText style={{ color: '#fff', fontFamily: font.display, fontSize: size * 0.42 }}>{initials}</RNText>
        </>
      )}
    </View>
  );
}

export function EmptyState({ emoji, title, body, action }: { emoji: string; title: string; body?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', padding: space.xxl, gap: space.md }}>
      <Appear>
        <Float>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
            <RNText style={{ fontSize: 44 }} accessibilityElementsHidden importantForAccessibility="no">
              {emoji}
            </RNText>
          </View>
        </Float>
      </Appear>
      <Appear index={1} style={{ alignItems: 'center', gap: space.sm }}>
        <Text variant="heading" style={{ textAlign: 'center' }}>
          {title}
        </Text>
        {body ? (
          <Text muted style={{ textAlign: 'center', maxWidth: 300 }}>
            {body}
          </Text>
        ) : null}
      </Appear>
      {action ? <Appear index={2}>{action}</Appear> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      emoji="🌧️"
      title="Something went sideways"
      body={message ?? 'Check your connection and try again.'}
      action={onRetry ? <Button title="Try again" kind="secondary" onPress={onRetry} /> : undefined}
    />
  );
}

/** Loading placeholder that breathes, so a wait reads as "working" rather than "broken". */
export function Skeleton({ height = 64, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const dark = useColorScheme() === 'dark';
  return (
    <View accessibilityElementsHidden style={[{ height, borderRadius: radius.md, backgroundColor: c.surfaceAlt, marginBottom: space.md, overflow: 'hidden' }, style]}>
      <Shimmer color={dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)'} />
    </View>
  );
}

export function Row({ children, style, gap = space.md }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function ListItem({
  title,
  subtitle,
  left,
  right,
  onPress,
  destructive,
}: {
  title: string;
  subtitle?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const c = useColors();
  const body = (
    <>
      {left}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" color={destructive ? c.danger : undefined} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" muted numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={c.textMuted} /> : null)}
    </>
  );
  if (!onPress) return <View style={[styles.listItem, { borderColor: c.border }]}>{body}</View>;
  return (
    <PressScale accessibilityRole="button" onPress={onPress} scaleTo={0.98} style={[styles.listItem, { borderColor: c.border }]}>
      {body}
    </PressScale>
  );
}

/** Rounded, tinted square behind a settings icon (the iOS-settings look). */
export function IconTile({ icon, color }: { icon: keyof typeof Ionicons.glyphMap; color: string }) {
  return (
    <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={19} color="#fff" />
    </View>
  );
}

export function Pill({ label, color, textColor }: { label: string; color: string; textColor: string }) {
  return (
    <View style={{ backgroundColor: color, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, minWidth: 22, alignItems: 'center' }}>
      <Text variant="caption" color={textColor} style={{ fontFamily: font.bodySemi }}>
        {label}
      </Text>
    </View>
  );
}

/** Pill-shaped tab switcher whose highlight glides between options. */
export function Segmented<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const c = useColors();
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useSharedValue(0);
  const seg = w / options.length;
  useEffect(() => {
    x.value = reduced ? i * seg : withSpring(i * seg, motion.snappy);
  }, [i, seg, x, reduced]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width - 8)}
      style={{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.pill, padding: 4 }}
    >
      {w > 0 && <Animated.View style={[{ position: 'absolute', top: 4, bottom: 4, left: 4, width: seg, borderRadius: radius.pill, backgroundColor: c.surface }, shadow.card, thumb]} />}
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.value === value }}
          onPress={() => {
            if (o.value !== value) void Haptics.selectionAsync().catch(() => {});
            onChange(o.value);
          }}
          style={{ flex: 1, paddingVertical: space.sm + 2, alignItems: 'center' }}
        >
          <Text variant="label" color={o.value === value ? c.text : c.textMuted} style={o.value === value && { fontFamily: font.bodySemi }}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="label" muted style={{ marginTop: space.xl, marginBottom: space.sm, marginLeft: space.xs, textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 }}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    overflow: 'hidden',
  },
  input: { minHeight: 54, borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  card: { borderRadius: radius.lg, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, ...shadow.card },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    minHeight: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
export { Character, randomLook, PART_COUNTS, type AvatarLook } from './character';
export { Appear, Float, Glow, Gradient, HeartBurst, PressScale, PulseRing, Shimmer, SpinningGradient, TypingDots, useBreathe } from './motion';
