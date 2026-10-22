import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { LinearTransition, ZoomIn } from 'react-native-reanimated';
import { conversations, useChatVersion, type ChatMessage } from '@/features/chat/db';
import { useFriends } from '@/features/friends/hooks';
import { ago } from '@/features/location/tracking';
import { StoryTray } from '@/features/stories/StoryTray';
import { Appear, Avatar, Button, EmptyState, IconButton, PressScale, Row, Screen, ScreenHeader, Text } from '@/ui';
import { font, motion, radius, space, useColors } from '@/theme';
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
  const preview = (m: ChatMessage) => (m.deleted ? 'Message deleted' : m.kind === 'image' ? '📷 Photo' : m.kind === 'voice' ? `${m.fromMe ? 'You: ' : ''}🎙️ Voice message` : m.kind === 'system' ? m.body : `${m.fromMe ? 'You: ' : ''}${m.body ?? ''}`);

  return (
    <Screen edges={['top']}>
      <ScreenHeader
        title="Chats"
        subtitle={
          <Row gap={space.xs} style={{ marginTop: 2 }}>
            <Ionicons name="lock-closed" size={13} color={c.liveText} />
            <Text variant="caption" color={c.liveText}>
              End-to-end encrypted
            </Text>
          </Row>
        }
        right={<IconButton icon="create-outline" label="New chat" size={44} onPress={() => router.push('/friends')} />}
      />
      <Animated.FlatList
        data={rows}
        keyExtractor={(m) => m.peerId}
        itemLayoutAnimation={LinearTransition.springify().damping(motion.snappy.damping)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space.xl }}
        ListHeaderComponent={<StoryTray />}
        ListHeaderComponentStyle={{ marginBottom: space.sm }}
        ListEmptyComponent={
          <EmptyState
            emoji="💬"
            title="No chats yet"
            body="Start a conversation with a friend. Only the two of you can read it."
            action={<Button title="Pick a friend" onPress={() => router.push('/friends')} />}
          />
        }
        renderItem={({ item, index }) => {
          const f = byId.get(item.peerId);
          const name = f?.displayName ?? f?.username ?? 'Former friend';
          const unread = item.unread > 0;
          return (
            <Appear index={index}>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={`${name}. ${preview(item)}${unread ? `. ${item.unread} unread` : ''}`}
                scaleTo={0.98}
                onPress={() => router.push(`/chat/${item.peerId}`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, paddingHorizontal: space.sm, marginHorizontal: -space.sm, borderRadius: radius.md, backgroundColor: unread ? c.surface : 'transparent' }}
              >
                <View>
                  <Avatar mediaId={f?.avatarMediaId} look={f?.avatarStyle} name={name} size={54} />
                  {f?.online && <View style={{ position: 'absolute', right: 0, bottom: 0, width: 15, height: 15, borderRadius: 8, backgroundColor: c.live, borderWidth: 3, borderColor: unread ? c.surface : c.bg }} />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                      {name}
                    </Text>
                    <Text variant="caption" color={unread ? c.link : c.textMuted} style={unread && { fontFamily: font.bodySemi }}>
                      {ago(new Date(item.createdAt).toISOString())}
                    </Text>
                  </Row>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="label" color={unread ? c.text : c.textMuted} numberOfLines={1} style={{ flex: 1, fontFamily: unread ? font.bodySemi : font.body }}>
                      {preview(item)}
                    </Text>
                    {unread && (
                      <Animated.View entering={ZoomIn.springify().damping(motion.bouncy.damping)} style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
                        <Text variant="caption" color={c.brandText} style={{ fontFamily: font.bodySemi }}>
                          {item.unread > 99 ? '99+' : item.unread}
                        </Text>
                      </Animated.View>
                    )}
                  </Row>
                </View>
              </PressScale>
            </Appear>
          );
        }}
      />
    </Screen>
  );
}
