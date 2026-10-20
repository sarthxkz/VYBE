import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Button, Character, PART_COUNTS, randomLook, Text, type AvatarLook } from '@/ui';
import { EYE_COLOR, HAIR_COLOR, OUTFIT, SKIN } from '@/ui/character';
import { palette, radius, space, useColors } from '@/theme';

type Part = keyof AvatarLook;
const TABS: { part: Part; label: string; swatches?: string[]; face?: boolean }[] = [
  { part: 'skin', label: 'Skin', swatches: SKIN },
  { part: 'face', label: 'Face shape' },
  { part: 'hair', label: 'Hair' },
  { part: 'hairColor', label: 'Hair colour', swatches: HAIR_COLOR },
  { part: 'brows', label: 'Brows', face: true },
  { part: 'eyes', label: 'Eyes', face: true },
  { part: 'eyeColor', label: 'Eye colour', swatches: EYE_COLOR },
  { part: 'nose', label: 'Nose', face: true },
  { part: 'mouth', label: 'Mouth', face: true },
  { part: 'facialHair', label: 'Facial hair', face: true },
  { part: 'top', label: 'Clothes' },
  { part: 'outfit', label: 'Clothes colour', swatches: OUTFIT },
  { part: 'accessory', label: 'Extras' },
];

/** Live preview + one tab per part. Used in settings and during account setup. */
export function AvatarEditor({ initial, footer, onChange }: { initial?: AvatarLook | null; footer: (look: AvatarLook) => ReactNode; onChange?: (look: AvatarLook) => void }) {
  const c = useColors();
  const [look, setLookState] = useState<AvatarLook>(initial ?? randomLook());
  const [tab, setTab] = useState<Part>('skin');
  const current = TABS.find((t) => t.part === tab)!;
  const setLook = (l: AvatarLook) => {
    setLookState(l);
    onChange?.(l);
  };
  const pick = (i: number) => {
    void Haptics.selectionAsync().catch(() => {});
    setLook({ ...look, [tab]: i });
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ alignItems: 'center', gap: space.md, marginTop: space.md }}>
        <View style={{ width: 180, height: 180, borderRadius: 90, backgroundColor: palette.grape100, overflow: 'hidden' }} accessibilityLabel="Your avatar preview">
          <Character look={look} size={180} />
        </View>
        <Button title="Surprise me" kind="secondary" icon={<Ionicons name="shuffle" size={18} color={c.link} />} onPress={() => setLook(randomLook())} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginTop: space.lg }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.xs }}>
        {TABS.map((t) => (
          <Pressable
            key={t.part}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.part }}
            onPress={() => setTab(t.part)}
            style={{ paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: tab === t.part ? c.brand : c.surfaceAlt }}
          >
            <Text variant="label" color={tab === t.part ? c.brandText : c.text}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1, marginTop: space.md }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'center', paddingBottom: space.lg }}>
        {Array.from({ length: PART_COUNTS[tab] }, (_, i) => {
          const on = (look[tab] ?? 0) === i;
          return (
            <Pressable
              key={i}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${current.label} option ${i + 1}`}
              onPress={() => pick(i)}
              style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: on ? c.brand : 'transparent', overflow: 'hidden', backgroundColor: current.swatches ? current.swatches[i] : palette.grape100, alignItems: 'center', justifyContent: 'center' }}
            >
              {!current.swatches && <Character look={{ ...look, [tab]: i }} size={66} focus={current.face ? 'face' : undefined} />}
            </Pressable>
          );
        })}
      </ScrollView>

      {footer(look)}
    </View>
  );
}
