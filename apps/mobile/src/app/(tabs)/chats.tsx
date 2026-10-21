import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { conversations, useChatVersion, type ChatMessage } from '@/features/chat/db';
import { activeLabel, shortAgo } from '@/features/chat/look';
import { useFriends } from '@/features/friends/hooks';
import type { Friend } from '@/api/types';
import { Avatar, Button, EmptyState, Row, Screen, Text } from '@/ui';
import { font, radius, space, useColors } from '@/theme';
import { Ionicons } from '@expo/vector-icons';

const ONLINE = '#22C55E';

export default function ChatsScreen() {
  const c = useColors();
  const router = useRouter();
  const v = useChatVersion((s) => s.v);
  const friends = useFriends();
  const [rows, setRows] = useState<(ChatMessage & { unread: number })[]>([]);
  const [q, setQ] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    void conversations().then(setRows).catch(() => setRows([]));
  }, [v]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const list = friends.data?.friends ?? [];
  const byId = new Map(list.map((f) => [f.id, f]));
  const nameOf = (f?: Friend) => f?.displayName ?? f?.username ?? 'Former friend';
  const activeNow = list.filter((f) => f.online);
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter((m) => {
        const f = byId.get(m.peerId);
        return [f?.displayName, f?.username].some((s) => s?.toLowerCase().includes(needle));
      })
    : rows;

  const you = (m: ChatMessage) => (m.fromMe ? 'You: ' : '');
  const preview = (m: ChatMessage) =>
    m.deleted ? 'Message deleted' : m.kind === 'image' ? `${you(m)}📷 Photo` : m.kind === 'gif' ? `${you(m)}GIF` : m.kind === 'sticker' ? `${you(m)}✨ Sticker` : m.kind === 'system' ? m.body : `${you(m)}${m.body ?? ''}`;

  return (
    <Screen edges={['top']}>
      <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
        <Text variant="title" accessibilityRole="header">
          Chats
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="New chat" onPress={() => router.push('/friends')} hitSlop={10}>
          <Ionicons name="create-outline" size={26} color={c.text} />
        </Pressable>
      </Row>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: space.md, marginTop: space.md }}>
        <Ionicons name="search" size={18} color={c.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search"
          placeholderTextColor={c.textMuted}
          accessibilityLabel="Search chats"
          style={{ flex: 1, height: 40, color: c.text, fontFamily: font.body, fontSize: 16 }}
        />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(m) => m.peerId}
        style={{ marginTop: space.sm }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          activeNow.length > 0 && !needle ? (
            <View style={{ marginBottom: space.sm }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.lg, paddingVertical: space.sm }}>
                {activeNow.map((f) => (
                  <Pressable key={f.id} accessibilityRole="button" accessibilityLabel={`${nameOf(f)}, active now. Message`} onPress={() => router.push(`/chat/${f.id}`)} style={{ alignItems: 'center', width: 68 }}>
                    <View>
                      <Avatar mediaId={f.avatarMediaId} look={f.avatarStyle} name={nameOf(f)} size={60} />
                      <View style={{ position: 'absolute', right: 1, bottom: 1, width: 17, height: 17, borderRadius: 9, backgroundColor: ONLINE, borderWidth: 3, borderColor: c.bg }} />
                    </View>
                    <Text variant="caption" numberOfLines={1} style={{ marginTop: 4 }}>
                      {nameOf(f).split(' ')[0]}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text variant="label" muted>
                Messages
              </Text>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          needle ? (
            <Text muted style={{ textAlign: 'center', marginTop: space.xl }}>
              No chats match “{q.trim()}”.
            </Text>
          ) : (
            <EmptyState
              emoji="💬"
              title="No chats yet"
              body="Start a conversation with a friend. Only the two of you can read it."
              action={<Button title="Pick a friend" onPress={() => router.push('/friends')} />}
            />
          )
        }
        ListFooterComponent={
          rows.length > 0 ? (
            <Row gap={space.xs} style={{ justifyContent: 'center', paddingVertical: space.lg }}>
              <Ionicons name="lock-closed" size={12} color={c.textMuted} />
              <Text variant="caption" muted>
                Your chats are end-to-end encrypted
              </Text>
            </Row>
          ) : undefined
        }
        renderItem={({ item }) => {
          const f = byId.get(item.peerId);
          const name = nameOf(f);
          const unread = item.unread > 0;
          const status = activeLabel(f?.online, f?.lastActiveAt, now);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${name}${unread ? `, ${item.unread} unread` : ''}. ${preview(item)}`}
              onPress={() => router.push(`/chat/${item.peerId}`)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, backgroundColor: pressed ? c.surfaceAlt : 'transparent' })}
            >
              <View>
                <Avatar mediaId={f?.avatarMediaId} look={f?.avatarStyle} name={name} size={56} />
                {f?.online && <View style={{ position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, borderRadius: 8, backgroundColor: ONLINE, borderWidth: 3, borderColor: c.bg }} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {name}
                </Text>
                <Text variant={unread ? 'bodyStrong' : 'caption'} color={unread ? c.text : c.textMuted} numberOfLines={1} style={unread ? { fontSize: 14 } : undefined}>
                  {unread && item.unread > 1 ? `${item.unread} new messages` : preview(item)}
                  <Text variant="caption" muted>
                    {` · ${shortAgo(item.createdAt, now)}`}
                  </Text>
                </Text>
                {!unread && status === 'Active now' && (
                  <Text variant="caption" color={c.liveText}>
                    {status}
                  </Text>
                )}
              </View>
              {unread && <View accessibilityElementsHidden style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.brand }} />}
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
