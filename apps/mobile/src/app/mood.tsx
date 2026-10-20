import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { api } from '@/api/client';
import { queryClient } from '@/lib/query';
import { useSession } from '@/stores/session';
import { Avatar, Button, Input, Screen, Text } from '@/ui';
import { palette, radius, shadow, space, useColors } from '@/theme';

const CATEGORIES = [
  { name: 'Chill', emoji: ['😎', '😌', '🥱', '😴', '🛋️', '🎧', '🎮', '🌙'], lines: ['just vibing', 'netflix & chill', 'lazy day', 'recharging'] },
  { name: 'Hype', emoji: ['🥳', '🔥', '🤩', '💃', '🕺', '🎉', '⚡', '✨'], lines: ['let’s go out!', 'party mode', 'feeling great', 'who’s up?'] },
  { name: 'Busy', emoji: ['📚', '💼', '💻', '🧠', '🏋️', '⏳', '🤯', '😤'], lines: ['studying', 'at work', 'do not disturb', 'at the gym'] },
  { name: 'Food', emoji: ['🍕', '🍔', '🍜', '🍣', '☕', '🧋', '🍩', '🍽️'], lines: ['hungry', 'coffee run', 'cooking', 'food coma'] },
  { name: 'Out', emoji: ['🏖️', '✈️', '🚗', '🏔️', '🛍️', '🎬', '🌧️', '🚶'], lines: ['on my way', 'at the beach', 'road trip', 'shopping'] },
];

export default function MoodScreen() {
  const c = useColors();
  const router = useRouter();
  const reduced = useReducedMotion();
  const me = useSession((s) => s.me);
  const [cat, setCat] = useState(0);
  const [emoji, setEmoji] = useState(me?.mood?.emoji ?? null);
  const [text, setText] = useState(me?.mood?.text ?? '');
  const [busy, setBusy] = useState(false);
  const pop = useSharedValue(1);
  useEffect(() => {
    if (emoji && !reduced) pop.value = withSequence(withSpring(1.35, { damping: 6 }), withSpring(1));
  }, [emoji, reduced, pop]);
  const bubble = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const done = async (req: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await req();
      await useSession.getState().refreshMe();
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
      router.back();
    } catch {
      Alert.alert('Couldn’t update your vibe', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  const pick = (e: string) => {
    void Haptics.selectionAsync().catch(() => {});
    setEmoji(e);
  };
  const category = CATEGORIES[cat]!;

  return (
    <Screen ambient edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginTop: space.lg }}>
          <View>
            <Avatar look={me?.avatarStyle} mediaId={me?.avatarMediaId} name={me?.displayName ?? me?.username} size={128} ring={palette.grape500} />
            {emoji && (
              <Animated.View style={[{ position: 'absolute', right: -14, top: -10, backgroundColor: c.surface, borderRadius: 28, paddingHorizontal: 8, paddingVertical: 4 }, shadow.float, bubble]}>
                <RNText style={{ fontSize: 34 }}>{emoji}</RNText>
              </Animated.View>
            )}
          </View>
          {/* Exactly what friends will see on the map */}
          <View style={[{ marginTop: space.md, backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: 6, minHeight: 32 }, shadow.card]}>
            <Text variant="label" numberOfLines={1}>
              {emoji ? `${emoji} ${text.trim() || 'vibing'}` : 'Pick your vibe ↓'}
            </Text>
          </View>
          <Text variant="title" accessibilityRole="header" style={{ marginTop: space.lg }}>
            What’s your vibe?
          </Text>
          <Text muted style={{ textAlign: 'center' }}>
            Friends see it on the map for 24 hours.
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.lg, flexGrow: 0 }} contentContainerStyle={{ gap: space.sm }}>
          {CATEGORIES.map((k, i) => (
            <Pressable
              key={k.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: cat === i }}
              onPress={() => setCat(i)}
              style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: cat === i ? c.brand : c.surface }}
            >
              <Text variant="label" color={cat === i ? c.brandText : c.text}>
                {k.emoji[0]} {k.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.sm, marginTop: space.md }}>
          {category.emoji.map((m) => (
            <Pressable
              key={m}
              accessibilityRole="radio"
              accessibilityState={{ selected: emoji === m }}
              accessibilityLabel={`Vibe ${m}`}
              onPress={() => pick(m)}
              style={({ pressed }) => [
                { width: '23%', aspectRatio: 1, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: emoji === m ? c.brand : c.surface },
                emoji === m && shadow.card,
                pressed && { transform: [{ scale: 0.94 }] },
              ]}
            >
              <RNText style={{ fontSize: 34 }}>{m}</RNText>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg }}>
          {category.lines.map((l) => (
            <Pressable key={l} accessibilityRole="button" accessibilityLabel={`Use “${l}”`} onPress={() => setText(l)} style={{ paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: text === l ? c.brand : c.border, backgroundColor: c.surface }}>
              <Text variant="caption" color={text === l ? c.link : c.text}>
                {l}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ marginTop: space.md }}>
          <Input label="Or say it your way" value={text} onChangeText={setText} maxLength={40} placeholder="at the beach, studying, hungry…" />
        </View>
      </ScrollView>

      <View style={{ gap: space.sm }}>
        <Button title={emoji ? `Share ${emoji} with friends` : 'Pick an emoji first'} kind="action" disabled={!emoji} loading={busy} onPress={() => done(() => api('/me/mood', { method: 'PUT', body: { emoji, text: text.trim() || null } }))} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {me?.mood && <Button title="Clear vibe" kind="ghost" style={{ flex: 1 }} disabled={busy} onPress={() => done(() => api('/me/mood', { method: 'DELETE' }))} />}
          <Button title="Cancel" kind="ghost" style={{ flex: 1 }} disabled={busy} onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}
