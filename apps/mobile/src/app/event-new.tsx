import { useState } from 'react';
import { Alert, Pressable, Text as RNText, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '@/api/client';
import { errorText } from '@/copy';
import { queryClient } from '@/lib/query';
import { Button, Input, Row, Screen, Text } from '@/ui';
import { radius, space, useColors } from '@/theme';

const EMOJI = ['🎉', '🎂', '🍕', '☕', '🎮', '🎬', '⚽', '🏀', '🎶', '🍻', '📚', '🏖️'];
const HOUR = 3600_000;

function at8pm(daysAhead: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(20, 0, 0, 0);
  return d;
}
const STARTS = [
  { label: 'Now', at: () => new Date() },
  { label: 'In 1 hour', at: () => new Date(Date.now() + HOUR) },
  { label: 'Tonight 8 PM', at: () => (at8pm(0).getTime() > Date.now() ? at8pm(0) : at8pm(1)) },
  { label: 'Tomorrow 8 PM', at: () => at8pm(1) },
];
const LENGTHS = [
  { label: '1 h', ms: HOUR },
  { label: '2 h', ms: 2 * HOUR },
  { label: '4 h', ms: 4 * HOUR },
  { label: 'All night', ms: 10 * HOUR },
];

/** Drop an event pin where the map is centred. Friends see it until it ends. */
export default function NewEvent() {
  const c = useColors();
  const router = useRouter();
  const { lat, lng } = useLocalSearchParams<{ lat: string; lng: string }>();
  const [emoji, setEmoji] = useState('🎉');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(0);
  const [length, setLength] = useState(1);
  const [busy, setBusy] = useState(false);

  const chip = (on: boolean) => ({ paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: on ? c.brand : c.surfaceAlt });
  const create = async () => {
    setBusy(true);
    try {
      const startsAt = STARTS[start]!.at();
      await api('/events', { body: { title: title.trim(), emoji, lat: Number(lat), lng: Number(lng), startsAt, endsAt: new Date(startsAt.getTime() + LENGTHS[length]!.ms) } });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      router.back();
    } catch (e) {
      Alert.alert('Couldn’t create the event', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen ambient edges={['top', 'bottom']}>
      <Text variant="title" accessibilityRole="header" style={{ marginTop: space.md }}>
        New event
      </Text>
      <Text muted style={{ marginBottom: space.lg }}>
        It goes where your map is centred. Your friends see it until it ends.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg }}>
        {EMOJI.map((e) => (
          <Pressable key={e} accessibilityRole="radio" accessibilityState={{ selected: emoji === e }} accessibilityLabel={`Emoji ${e}`} onPress={() => setEmoji(e)} style={{ width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: emoji === e ? c.brand : c.surfaceAlt }}>
            <RNText style={{ fontSize: 24 }}>{e}</RNText>
          </Pressable>
        ))}
      </View>
      <Input label="What’s happening?" value={title} onChangeText={setTitle} maxLength={40} placeholder="Movie night at mine" />
      <Text variant="label" style={{ marginBottom: space.sm }}>
        Starts
      </Text>
      <Row gap={space.sm} style={{ flexWrap: 'wrap', marginBottom: space.lg }}>
        {STARTS.map((s, i) => (
          <Pressable key={s.label} accessibilityRole="radio" accessibilityState={{ selected: start === i }} onPress={() => setStart(i)} style={chip(start === i)}>
            <Text variant="label" color={start === i ? c.brandText : c.text}>{s.label}</Text>
          </Pressable>
        ))}
      </Row>
      <Text variant="label" style={{ marginBottom: space.sm }}>
        How long
      </Text>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {LENGTHS.map((l, i) => (
          <Pressable key={l.label} accessibilityRole="radio" accessibilityState={{ selected: length === i }} onPress={() => setLength(i)} style={chip(length === i)}>
            <Text variant="label" color={length === i ? c.brandText : c.text}>{l.label}</Text>
          </Pressable>
        ))}
      </Row>
      <View style={{ flex: 1 }} />
      <Button title={`Drop ${emoji} on the map`} kind="action" loading={busy} disabled={!title.trim() || !lat} onPress={create} />
      <Button title="Cancel" kind="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
