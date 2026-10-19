import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { conversations, useChatVersion, type ChatMessage } from '@/features/chat/db';
import { useFriends } from '@/features/friends/hooks';
import { ago } from '@/features/location/tracking';
import { Avatar, Button, EmptyState, ListItem, Pill, Row, Screen, Text } from '@/ui';
import { space, useColors } from '@/theme';
import { Ionicons } from '@expo/vector-icons';

export default function ChatsScreen() {
  const c = useColors();
  const router = useRouter();
  const v = useChatVersion((s) => s.v);
  const friends = useFriends();
  const [rows, setRows] = useState<(ChatMessage & { unread: number })[]>([]);
  useEffect(() => {
    void conversations().then(setRows).catch(() => setRows([]));
  }, [v]);

  const byId = new Map((friends.data?.friends ?? []).map((f) => [f.id, f]));
  const preview = (m: ChatMessage) => (m.deleted ? 'Message deleted' : m.kind === 'image' ? '📷 Photo' : m.kind === 'system' ? m.body : `${m.fromMe ? 'You: ' : ''}${m.body ?? ''}`);

  return (
    <Screen edges={['top']}>
      <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
        <Text variant="title" accessibilityRole="header">
          Chats
        </Text>
        <Row gap={space.xs}>
          <Ionicons name="lock-closed" size={14} color={c.liveText} />
          <Text variant="caption" color={c.liveText}>
            End-to-end encrypted
          </Text>
        </Row>
      </Row>
      <FlatList
        data={rows}
        keyExtractor={(m) => m.peerId}
        style={{ marginTop: space.md }}
        ListEmptyComponent={
          <EmptyState
            emoji="💬"
            title="No chats yet"
            body="Start a conversation with a friend. Only the two of you can read it."
            action={<Button title="Pick a friend" onPress={() => router.push('/friends')} />}
          />
        }
        renderItem={({ item }) => {
          const f = byId.get(item.peerId);
          const name = f?.displayName ?? f?.username ?? 'Former friend';
          return (
            <ListItem
              title={name}
              subtitle={preview(item)}
              left={<Avatar mediaId={f?.avatarMediaId} look={f?.avatarStyle} name={name} />}
              onPress={() => router.push(`/chat/${item.peerId}`)}
              right={
                <View style={{ alignItems: 'flex-end', gap: space.xs }}>
                  <Text variant="caption" muted>
                    {ago(new Date(item.createdAt).toISOString())}
                  </Text>
                  {item.unread > 0 && <Pill label={String(item.unread)} color={c.brand} textColor={c.brandText} />}
                </View>
              }
            />
          );
        }}
      />
    </Screen>
  );
}
