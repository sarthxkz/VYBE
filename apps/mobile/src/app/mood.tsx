import { useState } from 'react';
import { Alert, Pressable, Text as RNText, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api } from '@/api/client';
import { queryClient } from '@/lib/query';
import { useSession } from '@/stores/session';
import { Avatar, Button, Input, Screen, Text } from '@/ui';
import { radius, space, useColors } from '@/theme';

const MOODS = [
  '😎',
  '🥳',
  '😴',
  '☕',
  '🍕',
  '🎧',
  '📚',
  '💪',
  '🏖️',
  '🎮',
  '🚗',
  '✈️',
  '😍',
  '🤯',
  '😤',
  '🥱',
  '🙃',
  '🤒',
  '🔥',
  '✨',
  '🌧️',
  '🎬',
  '🛍️',
  '💼',
];

export default function MoodScreen() {
  const c = useColors();
  const router = useRouter();
  const me = useSession((s) => s.me);
  const [emoji, setEmoji] = useState(me?.mood?.emoji ?? null);
  const [text, setText] = useState(me?.mood?.text ?? '');
  const [busy, setBusy] = useState(false);

  const done = async (req: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await req();
      await useSession.getState().refreshMe();
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
      router.back();
    } catch {
      Alert.alert('Couldn’t update your mood', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ alignItems: 'center', gap: space.sm, marginTop: space.md }}>
        <View>
          <Avatar
            look={me?.avatarStyle}
            mediaId={me?.avatarMediaId}
            name={me?.displayName ?? me?.username}
            size={88}
          />
          {emoji && (
            <View
              style={{
                position: 'absolute',
                right: -8,
                top: -6,
                backgroundColor: c.surface,
                borderRadius: 20,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <RNText style={{ fontSize: 26 }}>{emoji}</RNText>
            </View>
          )}
        </View>
        <Text variant="title" accessibilityRole="header">
          What’s your vibe?
        </Text>
        <Text muted style={{ textAlign: 'center' }}>
          Friends see it on the map. It fades after 24 hours.
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: space.sm,
          marginTop: space.lg,
        }}
      >
        {MOODS.map((m) => (
          <Pressable
            key={m}
            accessibilityRole="radio"
            accessibilityState={{ selected: emoji === m }}
            accessibilityLabel={`Mood ${m}`}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => {});
              setEmoji(m);
            }}
            style={{
              width: 52,
              height: 52,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: emoji === m ? c.brand : c.surfaceAlt,
            }}
          >
            <RNText style={{ fontSize: 26 }}>{m}</RNText>
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: space.lg }}>
        <Input
          label="Add a line (optional)"
          value={text}
          onChangeText={setText}
          maxLength={40}
          placeholder="at the beach, studying, hungry…"
        />
      </View>

      <View style={{ flex: 1 }} />
      <View style={{ gap: space.sm }}>
        <Button
          title="Share my vibe"
          disabled={!emoji}
          loading={busy}
          onPress={() =>
            done(() =>
              api('/me/mood', { method: 'PUT', body: { emoji, text: text.trim() || null } }),
            )
          }
        />
        {me?.mood && (
          <Button
            title="Clear mood"
            kind="ghost"
            disabled={busy}
            onPress={() => done(() => api('/me/mood', { method: 'DELETE' }))}
          />
        )}
        <Button title="Cancel" kind="ghost" disabled={busy} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
