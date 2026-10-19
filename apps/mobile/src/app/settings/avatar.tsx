import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { api } from '@/api/client';
import { useSession } from '@/stores/session';
import { Button, Character, PART_COUNTS, randomLook, Screen, Text, type AvatarLook } from '@/ui';
import { HAIR_COLOR, OUTFIT, SKIN } from '@/ui/character';
import { palette, radius, space, useColors } from '@/theme';

type Part = keyof AvatarLook;
const TABS: { part: Part; label: string; swatches?: string[] }[] = [
  { part: 'skin', label: 'Skin', swatches: SKIN },
  { part: 'face', label: 'Face' },
  { part: 'hair', label: 'Hair' },
  { part: 'hairColor', label: 'Hair colour', swatches: HAIR_COLOR },
  { part: 'eyes', label: 'Eyes' },
  { part: 'mouth', label: 'Mouth' },
  { part: 'accessory', label: 'Extras' },
  { part: 'outfit', label: 'Outfit', swatches: OUTFIT },
];

export default function AvatarEditor() {
  const c = useColors();
  const router = useRouter();
  const me = useSession((s) => s.me);
  const [look, setLook] = useState<AvatarLook>(me?.avatarStyle ?? randomLook());
  const [tab, setTab] = useState<Part>('skin');
  const [saving, setSaving] = useState(false);
  const current = TABS.find((t) => t.part === tab)!;

  const set = (part: Part, i: number) => {
    void Haptics.selectionAsync().catch(() => {});
    setLook((l) => ({ ...l, [part]: i }));
  };
  const save = async (avatarStyle: AvatarLook | null) => {
    setSaving(true);
    try {
      await api('/me', { method: 'PATCH', body: { avatarStyle } });
      await useSession.getState().refreshMe();
      router.back();
    } catch {
      Alert.alert('Couldn’t save your avatar', 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <View style={{ alignItems: 'center', gap: space.md, marginTop: space.md }}>
        <View
          style={{
            width: 200,
            height: 200,
            borderRadius: 100,
            backgroundColor: palette.grape100,
            overflow: 'hidden',
          }}
          accessibilityLabel="Your avatar preview"
        >
          <Character look={look} size={200} />
        </View>
        <Button
          title="Surprise me"
          kind="secondary"
          icon={<Ionicons name="shuffle" size={18} color={c.link} />}
          onPress={() => setLook(randomLook())}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginTop: space.lg }}
        contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.xs }}
      >
        {TABS.map((t) => (
          <Pressable
            key={t.part}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.part }}
            onPress={() => setTab(t.part)}
            style={{
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              borderRadius: radius.pill,
              backgroundColor: tab === t.part ? c.brand : c.surfaceAlt,
            }}
          >
            <Text variant="label" color={tab === t.part ? c.brandText : c.text}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={{ flex: 1, marginTop: space.md }}
        contentContainerStyle={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: space.md,
          justifyContent: 'center',
          paddingBottom: space.lg,
        }}
      >
        {Array.from({ length: PART_COUNTS[tab] }, (_, i) => {
          const on = look[tab] === i;
          return (
            <Pressable
              key={i}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${current.label} option ${i + 1}`}
              onPress={() => set(tab, i)}
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                borderWidth: 3,
                borderColor: on ? c.brand : 'transparent',
                overflow: 'hidden',
                backgroundColor: current.swatches ? current.swatches[i] : palette.grape100,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {!current.swatches && <Character look={{ ...look, [tab]: i }} size={66} />}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ gap: space.sm }}>
        <Button title="Save avatar" loading={saving} onPress={() => save(look)} />
        {me?.avatarStyle && (
          <Button
            title="Use my photo or initials instead"
            kind="ghost"
            disabled={saving}
            onPress={() => save(null)}
          />
        )}
      </View>
    </Screen>
  );
}
