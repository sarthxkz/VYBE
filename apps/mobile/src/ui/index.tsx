import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { font, palette, radius, shadow, space, type as typeScale, useColors, type TypeVariant } from '@/theme';
import { Character, type AvatarLook } from './character';
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
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const c = useColors();
  const inner = [padded && { paddingHorizontal: space.xl }, style];
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[{ paddingBottom: space.xxxl }, inner]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
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
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={(e) => {
        void Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}
      {...p}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <RNText style={[typeScale.bodyStrong, { color: fg }]} maxFontSizeMultiplier={1.4}>
        {title}
      </RNText>
    </Pressable>
  );
}

export function Input({ label, error, hint, style, ...p }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs, marginBottom: space.lg }}>
      <Text variant="label">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.textMuted}
        style={[
          styles.input,
          { backgroundColor: c.surface, color: c.text, borderColor: error ? c.danger : c.border, fontFamily: font.body },
          style,
        ]}
        {...p}
      />
      {error ? (
        <Text variant="caption" color={c.danger} accessibilityLiveRegion="polite">
          {error}
        </Text>
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
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.9 }]}>
      {children}
    </Pressable>
  );
}

const avatarColors = ['#6C4CF5', '#FF6B4A', '#1F9D57', '#3EC6FF', '#E5512F', '#5536DB'];

export function Avatar({ mediaId, name, size = 44, ring, look }: { mediaId?: string | null; name?: string | null; size?: number; ring?: string; look?: AvatarLook | null }) {
  const label = (name ?? '?').trim();
  const initials = label.slice(0, 1).toUpperCase();
  const bg = avatarColors[(label.charCodeAt(0) || 0) % avatarColors.length];
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
        <Image source={mediaSource(mediaId)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <RNText style={{ color: '#fff', fontFamily: font.display, fontSize: size * 0.42 }}>{initials}</RNText>
      )}
    </View>
  );
}

export function EmptyState({ emoji, title, body, action }: { emoji: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: space.xxl, gap: space.md }}>
      <RNText style={{ fontSize: 48 }} accessibilityElementsHidden importantForAccessibility="no">
        {emoji}
      </RNText>
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text muted style={{ textAlign: 'center' }}>
          {body}
        </Text>
      ) : null}
      {action}
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

export function Skeleton({ height = 64, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View accessibilityElementsHidden style={[{ height, borderRadius: radius.md, backgroundColor: c.surfaceAlt, marginBottom: space.md }, style]} />;
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
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.listItem, { borderColor: c.border, backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}
    >
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
      {right}
    </Pressable>
  );
}

export function Pill({ label, color, textColor }: { label: string; color: string; textColor: string }) {
  return (
    <View style={{ backgroundColor: color, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 }}>
      <Text variant="caption" color={textColor} style={{ fontFamily: font.bodySemi }}>
        {label}
      </Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="label" muted style={{ marginTop: space.xl, marginBottom: space.sm, textTransform: 'uppercase', letterSpacing: 0.8 }}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  input: { minHeight: 52, borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: space.lg, fontSize: 16 },
  card: { borderRadius: radius.lg, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, ...shadow.card },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
export { Character, randomLook, PART_COUNTS, type AvatarLook } from './character';
