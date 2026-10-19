import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Pressable, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Signal from '@modules/vybe-signal';
import { api } from '@/api/client';
import type { PublicUser, Relationship } from '@/api/types';
import { chatDb, deleteConversation, messagesWith, useChatVersion, type ChatMessage } from '@/features/chat/db';
import { deleteForEveryone, openImage, retryUnsent, sendImage, sendReadReceipts, sendText } from '@/features/chat/service';
import { pickFromLibrary } from '@/lib/images';
import { sendEvent, subscribe } from '@/lib/realtime';
import { useSession } from '@/stores/session';
import { Avatar, Row, Screen, Text } from '@/ui';
import { font, radius, space, useColors } from '@/theme';

export default function ChatScreen() {
  const { id: peerId } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const router = useRouter();
  const me = useSession((s) => s.me);
  const v = useChatVersion((s) => s.v);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [typing, setTyping] = useState(false);
  const [identityChanged, setIdentityChanged] = useState(false);
  const lastTypingSent = useRef(0);
  const peer = useQuery({ queryKey: ['user', peerId], queryFn: () => api<PublicUser & { relationship: Relationship }>(`/users/${peerId}`) });
  const name = peer.data?.displayName ?? peer.data?.username ?? '…';
  const canChat = peer.data?.relationship === 'friends';

  const history = useQuery({ queryKey: ['chat', peerId, v], queryFn: () => messagesWith(peerId), placeholderData: (prev) => prev });
  const messages = history.data ?? [];

  // Mark received messages read locally and tell the sender (encrypted receipt).
  useEffect(() => {
    const unread = (history.data ?? []).filter((m) => !m.fromMe && m.status === 'received' && m.kind !== 'system').map((m) => m.id);
    if (!unread.length) return;
    void (async () => {
      const db = await chatDb();
      await db.runAsync(`UPDATE messages SET status = 'read' WHERE peerId = ? AND fromMe = 0 AND status = 'received'`, peerId);
      void sendReadReceipts(peerId, unread);
      useChatVersion.getState().bump();
    })();
  }, [history.data, peerId]);

  useEffect(() => {
    void Signal.identityChanged(peerId).then(setIdentityChanged).catch(() => {});
    let t: ReturnType<typeof setTimeout>;
    return subscribe((ev) => {
      if (ev.type === 'typing' && ev.data.userId === peerId) {
        setTyping(!!ev.data.on);
        clearTimeout(t);
        t = setTimeout(() => setTyping(false), 6000);
      }
    });
  }, [peerId]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    setReplyTo(null);
    sendEvent({ type: 'typing', data: { to: peerId, on: false } });
    await sendText(peerId, body, replyTo?.id);
  };

  const onType = (t: string) => {
    setText(t);
    if (Date.now() - lastTypingSent.current > 3000 && t) {
      lastTypingSent.current = Date.now();
      sendEvent({ type: 'typing', data: { to: peerId, on: true } });
    }
  };

  const menu = () =>
    Alert.alert(name, undefined, [
      {
        text: 'Verify safety number',
        onPress: async () => {
          try {
            const { identityKey } = await api<{ identityKey: string }>(`/keys/identity/${peerId}`);
            const num = await Signal.safetyNumber(me!.id, peerId, identityKey);
            await Signal.acknowledgeIdentity(peerId);
            setIdentityChanged(false);
            Alert.alert('Safety number', `${num.replace(/(\d{5})/g, '$1 ').trim()}\n\nCompare this with ${name} in person. If it matches on both phones, your chat is private.`);
          } catch {
            Alert.alert('Not available yet', `${name} needs to open Vybe once to set up encryption.`);
          }
        },
      },
      { text: 'Mute for 8 hours', onPress: () => api(`/me/mutes/${peerId}`, { method: 'PUT', body: { until: new Date(Date.now() + 8 * 3600_000).toISOString() } }) },
      { text: 'Unmute', onPress: () => api(`/me/mutes/${peerId}`, { method: 'DELETE' }) },
      {
        text: 'Clear chat on this phone',
        style: 'destructive',
        onPress: () => Alert.alert('Clear this chat?', 'Messages are removed from this phone only.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => deleteConversation(peerId) }]),
      },
      { text: 'View profile', onPress: () => router.push(`/user/${peerId}`) },
      { text: 'Close', style: 'cancel' },
    ]);

  const byId = new Map(messages.map((m) => [m.id, m]));

  return (
    <Screen padded={false} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => (
            <Row gap={space.sm}>
              <Avatar mediaId={peer.data?.avatarMediaId} name={name} size={32} />
              <View>
                <Text variant="bodyStrong">{name}</Text>
                <Text variant="caption" color={typing ? c.liveText : c.textMuted}>
                  {typing ? 'typing…' : '🔒 End-to-end encrypted'}
                </Text>
              </View>
            </Row>
          ),
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Chat options" onPress={menu} hitSlop={12}>
              <Ionicons name="ellipsis-vertical" size={22} color={c.text} />
            </Pressable>
          ),
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.text,
        }}
      />
      {identityChanged && (
        <Pressable onPress={menu} style={{ backgroundColor: c.surfaceAlt, padding: space.md }}>
          <Text variant="caption">Your safety number with {name} changed. This usually means they reinstalled Vybe. Tap to verify.</Text>
        </Pressable>
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={90}>
        <FlatList
          inverted
          data={[...messages].reverse()}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.md, gap: space.xs }}
          renderItem={({ item }) => <Bubble m={item} quoted={item.replyTo ? byId.get(item.replyTo) : undefined} onLongPress={() => actions(item, peerId, setReplyTo)} />}
        />
        {canChat ? (
          <View style={{ borderTopWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: space.sm }}>
            {replyTo && (
              <Row style={{ paddingHorizontal: space.sm, paddingBottom: space.xs }}>
                <Text variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
                  Replying to: {replyTo.body ?? 'Photo'}
                </Text>
                <Pressable accessibilityLabel="Cancel reply" onPress={() => setReplyTo(null)}>
                  <Ionicons name="close" size={18} color={c.textMuted} />
                </Pressable>
              </Row>
            )}
            <Row gap={space.sm}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send a photo"
                onPress={async () => {
                  const img = await pickFromLibrary();
                  if (img) await sendImage(peerId, img.uri, img.width, img.height).catch(() => Alert.alert('Photo not sent', 'Check your connection and try again.'));
                }}
              >
                <Ionicons name="image" size={26} color={c.link} />
              </Pressable>
              <TextInput
                value={text}
                onChangeText={onType}
                placeholder="Message"
                placeholderTextColor={c.textMuted}
                multiline
                maxLength={4000}
                accessibilityLabel="Message"
                style={{ flex: 1, maxHeight: 120, minHeight: 44, backgroundColor: c.bg, color: c.text, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.sm, fontFamily: font.body, fontSize: 16 }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                disabled={!text.trim()}
                onPress={send}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? c.brand : c.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="arrow-up" size={22} color="#fff" />
              </Pressable>
            </Row>
          </View>
        ) : (
          <View style={{ padding: space.lg, alignItems: 'center' }}>
            <Text muted style={{ textAlign: 'center' }}>
              {peer.isPending ? ' ' : 'You can only message friends. Your history stays on this phone.'}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function actions(m: ChatMessage, peerId: string, setReplyTo: (m: ChatMessage) => void) {
  if (m.deleted || m.kind === 'system') return;
  Alert.alert('Message', undefined, [
    { text: 'Reply', onPress: () => setReplyTo(m) },
    ...(m.fromMe ? [{ text: 'Delete for everyone', style: 'destructive' as const, onPress: () => void deleteForEveryone(peerId, m.id) }] : []),
    ...(m.status === 'failed' ? [{ text: 'Retry sending', onPress: () => void retryUnsent() }] : []),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

function Bubble({ m, quoted, onLongPress }: { m: ChatMessage; quoted?: ChatMessage; onLongPress: () => void }) {
  const c = useColors();
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    if (m.kind === 'image' && m.image && !m.deleted) void openImage(JSON.parse(m.image)).then(setImg).catch(() => setImg(null));
  }, [m.kind, m.image, m.deleted]);

  if (m.kind === 'system') {
    return (
      <Text variant="caption" muted style={{ textAlign: 'center', marginVertical: space.sm }}>
        {m.body}
      </Text>
    );
  }
  const mine = !!m.fromMe;
  const fg = mine ? c.brandText : c.text;
  const tick = { sending: '🕓', failed: '⚠️ Not sent · hold to retry', sent: '✓', delivered: '✓✓', read: 'Read', received: '' }[m.status];
  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <Pressable onLongPress={onLongPress} accessibilityHint="Long press for options" style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
      <View style={{ backgroundColor: mine ? c.brand : c.surface, borderRadius: radius.lg, borderBottomRightRadius: mine ? 6 : radius.lg, borderBottomLeftRadius: mine ? radius.lg : 6, padding: space.md, gap: space.xs }}>
        {quoted && (
          <View style={{ borderLeftWidth: 3, borderColor: mine ? '#fff' : c.brand, paddingLeft: space.sm, opacity: 0.8 }}>
            <Text variant="caption" color={fg} numberOfLines={2}>
              {quoted.deleted ? 'Deleted message' : (quoted.body ?? 'Photo')}
            </Text>
          </View>
        )}
        {m.deleted ? (
          <Text color={fg} style={{ fontStyle: 'italic', opacity: 0.8 }}>
            Message deleted
          </Text>
        ) : m.kind === 'image' ? (
          img ? <Image source={{ uri: img }} style={{ width: 220, height: 260, borderRadius: radius.md }} contentFit="cover" accessibilityLabel="Photo" /> : <Text color={fg}>📷 Loading photo…</Text>
        ) : (
          <Text color={fg} selectable>
            {m.body}
          </Text>
        )}
      </View>
      <Text variant="caption" muted style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: 2 }}>
        {time}
        {mine && tick ? ` · ${tick}` : ''}
      </Text>
    </Pressable>
  );
}
