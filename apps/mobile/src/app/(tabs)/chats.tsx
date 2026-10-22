import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { LinearTransition, ZoomIn } from 'react-native-reanimated';
import { conversations, useChatVersion, type ChatMessage } from '@/features/chat/db';
import { shortAgo } from '@/features/chat/look';
import { useFriends } from '@/features/friends/hooks';
import type { Friend } from '@/api/types';
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
    m.deleted
      ? 'Message deleted'
      : m.kind === 'image'
        ? `${you(m)}📷 Photo`
        : m.kind === 'gif'
          ? `${you(m)}GIF`
          : m.kind === 'sticker'
            ? `${you(m)}✨ Sticker`
            : m.kind === 'voice'
              ? `${you(m)}🎙️ Voice message`
              : m.kind === 'system'
                ? m.body
                : `${you(m)}${m.body ?? ''}`;

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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: space.md, marginBottom: space.sm }}>
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
      <Animated.FlatList
        data={shown}
        keyExtractor={(m) => m.peerId}
        itemLayoutAnimation={LinearTransition.springify().damping(motion.snappy.damping)}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.xl }}
        ListHeaderComponent={
          needle ? undefined : (
            <View style={{ marginBottom: space.sm }}>
              <StoryTray />
              {activeNow.length > 0 && (
                <>
                  <Text variant="label" muted style={{ marginTop: space.sm }}>
                    Active now
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.lg, paddingVertical: space.sm }}>
                    {activeNow.map((f) => (
                      <Pressable key={f.id} accessibilityRole="button" accessibilityLabel={`${nameOf(f)}, active now. Message`} onPress={() => router.push(`/chat/${f.id}`)} style={{ alignItems: 'center', width: 64 }}>
                        <View>
                          <Avatar mediaId={f.avatarMediaId} look={f.avatarStyle} name={nameOf(f)} size={56} />
                          <View style={{ position: 'absolute', right: 1, bottom: 1, width: 16, height: 16, borderRadius: 8, backgroundColor: c.live, borderWidth: 3, borderColor: c.bg }} />
                        </View>
                        <Text variant="caption" numberOfLines={1} style={{ marginTop: 4 }}>
                          {nameOf(f).split(' ')[0]}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}
            </View>
          )
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
        renderItem={({ item, index }) => {
          const f = byId.get(item.peerId);
          const name = nameOf(f);
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
                      {shortAgo(item.createdAt, now)}
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
