import { View } from 'react-native';
import { Appear, Glow, Text } from '@/ui';
import { palette, space, useColors } from '@/theme';
import { LogoMark } from './Logo';

/** Top of the sign-in / sign-up screens: the mark on a soft glow, then the title rising in. */
export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const c = useColors();
  return (
    <View style={{ marginTop: space.xxl, marginBottom: space.xl }}>
      <Glow color={palette.grape500} size={320} opacity={0.35} style={{ left: -140, top: -160 }} />
      <Glow color={palette.coral500} size={240} opacity={0.25} style={{ right: -120, top: -60 }} />
      <Appear>
        <LogoMark size={52} color={c.link} />
      </Appear>
      <Appear index={1}>
        <Text variant="hero" accessibilityRole="header" style={{ marginTop: space.lg }}>
          {title}
        </Text>
      </Appear>
      {subtitle ? (
        <Appear index={2}>
          <Text muted style={{ marginTop: space.sm }}>
            {subtitle}
          </Text>
        </Appear>
      ) : null}
    </View>
  );
}
