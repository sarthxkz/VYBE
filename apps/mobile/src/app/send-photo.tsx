import { useState, useEffect, useRef } from 'react';
import { FlatList, Switch, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { errorText } from '@/copy';
import { BlinkIntro, shouldIntroduceBlink } from '@/features/BlinkIntro';
import { useFriends } from '@/features/friends/hooks';
import { uploadImage } from '@/lib/images';
import { Avatar, Button, EmptyState, Input, ListItem, Screen, Text } from '@/ui';
import { radius, space, useColors } from '@/theme';

export default function SendPhoto() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { uri, w, h, blink } = useLocalSearchParams<{ uri: string; w: string; h: string; blink?: string }>();
  const friends = useFriends();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState('');
  const [instant, setInstant] = useState(blink === '1');
  const [introBlink, setIntroBlink] = useState(false);
  const allIds = (friends.data?.friends ?? []).map((f) => f.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const selectAll = (on: boolean) => setSelected(new Set(on ? allIds : []));
  // Started from "Send a Blink": everyone is selected once the friend list arrives.
  const preselected = useRef(false);
  useEffect(() => {
    if (blink === '1' && !preselected.current && allIds.length) {
      preselected.current = true;
      setSelected(new Set(allIds));
    }
  }, [blink, allIds]);
  const pickBlink = async (on: boolean) => {
    setInstant(on);
    if (on && selected.size === 0) selectAll(true); // Blinks go to everyone by default, like Instants

    if (on && (await shouldIntroduceBlink())) setIntroBlink(true);
  };
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null); // kept so a retry doesn't re-upload

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const send = async () => {
    setError(null);
    setProgress(0);
    try {
      const id = mediaId ?? (await uploadImage({ uri, width: Number(w), height: Number(h) }, 'PHOTO', setProgress)).id;
      setMediaId(id);
      await api('/photos', { body: { mediaId: id, caption: instant ? undefined : caption.trim() || undefined, recipientIds: [...selected], instant } });
      void qc.invalidateQueries({ queryKey: ['photos'] });
      router.replace({ pathname: '/photos', params: { tab: 'sent' } }); // show what you just sent
    } catch (e) {
      setError(errorText(e));
      setProgress(null);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.md, alignItems: 'center' }}>
        <Image source={{ uri }} style={{ width: 72, height: 96, borderRadius: radius.md }} contentFit="cover" accessibilityLabel="Photo to send" />
        <View style={{ flex: 1 }}>
          {instant ? (
            <Text muted>Blinks are just the moment: no caption.</Text>
          ) : (
            <Input label="Caption (optional)" value={caption} onChangeText={setCaption} maxLength={200} />
          )}
        </View>
      </View>
      <ListItem
        title="✨ Send as a Blink"
        subtitle="Each friend can open it once, then it’s gone. Unopened Blinks disappear after 24 hours."
        right={<Switch value={instant} onValueChange={pickBlink} accessibilityLabel="Send as a Blink" />}
      />
      <Text variant="heading" style={{ marginBottom: space.sm }}>
        Send to
      </Text>
      <Text variant="caption" muted style={{ marginBottom: space.sm }}>
        Only the friends you pick can see this photo. Location data is removed before it’s sent.
      </Text>
      {allIds.length > 1 && (
        <ListItem
          title="All friends"
          subtitle={`Send to all ${allIds.length} friends`}
          right={<Switch value={allSelected} onValueChange={selectAll} accessibilityLabel="Send to all friends" />}
        />
      )}
      <FlatList
        style={{ flex: 1 }}
        data={friends.data?.friends ?? []}
        keyExtractor={(f) => f.id}
        ListEmptyComponent={friends.isSuccess ? <EmptyState emoji="🫂" title="No friends to send to yet" body="Add friends first, then share photos with them." /> : undefined}
        renderItem={({ item }) => (
          <ListItem
            title={item.displayName ?? item.username ?? ''}
            subtitle={`@${item.username}`}
            left={<Avatar mediaId={item.avatarMediaId} look={item.avatarStyle} name={item.displayName ?? item.username} size={40} />}
            onPress={() => toggle(item.id)}
            right={<Switch value={selected.has(item.id)} onValueChange={() => toggle(item.id)} accessibilityLabel={`Send to ${item.displayName ?? item.username}`} />}
          />
        )}
      />
      {error && <Text color={c.danger}>{error}</Text>}
      {progress !== null && (
        <View style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceAlt, marginVertical: space.sm }} accessibilityLabel={`Uploading ${Math.round(progress * 100)} percent`}>
          <View style={{ height: 6, borderRadius: 3, width: `${Math.round(progress * 100)}%`, backgroundColor: c.brand }} />
        </View>
      )}
      <Button
        title={error ? 'Retry' : selected.size ? `Send to ${selected.size}` : 'Pick at least one friend'}
        kind="action"
        disabled={!selected.size}
        loading={progress !== null}
        onPress={send}
        style={{ marginVertical: space.md }}
      />
      <BlinkIntro
        visible={introBlink}
        onDone={(keep) => {
          setIntroBlink(false);
          setInstant(keep);
        }}
      />
    </Screen>
  );
}
