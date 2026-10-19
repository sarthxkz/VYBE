import { useState } from 'react';
import { FlatList, Switch, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { errorText } from '@/copy';
import { useFriends } from '@/features/friends/hooks';
import { uploadImage } from '@/lib/images';
import { Avatar, Button, EmptyState, Input, ListItem, Screen, Text } from '@/ui';
import { radius, space, useColors } from '@/theme';

export default function SendPhoto() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { uri, w, h } = useLocalSearchParams<{ uri: string; w: string; h: string }>();
  const friends = useFriends();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState('');
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
      await api('/photos', { body: { mediaId: id, caption: caption.trim() || undefined, recipientIds: [...selected] } });
      void qc.invalidateQueries({ queryKey: ['photos'] });
      router.replace('/photos');
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
          <Input label="Caption (optional)" value={caption} onChangeText={setCaption} maxLength={200} />
        </View>
      </View>
      <Text variant="heading" style={{ marginBottom: space.sm }}>
        Send to
      </Text>
      <Text variant="caption" muted style={{ marginBottom: space.sm }}>
        Only the friends you pick can see this photo. Location data is removed before it’s sent.
      </Text>
      <FlatList
        style={{ flex: 1 }}
        data={friends.data?.friends ?? []}
        keyExtractor={(f) => f.id}
        ListEmptyComponent={friends.isSuccess ? <EmptyState emoji="🫂" title="No friends to send to yet" body="Add friends first, then share photos with them." /> : undefined}
        renderItem={({ item }) => (
          <ListItem
            title={item.displayName ?? item.username ?? ''}
            subtitle={`@${item.username}`}
            left={<Avatar mediaId={item.avatarMediaId} name={item.displayName ?? item.username} size={40} />}
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
    </Screen>
  );
}
