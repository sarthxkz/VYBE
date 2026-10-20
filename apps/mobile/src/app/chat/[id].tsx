import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Pressable, Text as RNText, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Signal from '@modules/vybe-signal';
import { api, gifSource } from '@/api/client';
import type { PublicUser, Relationship } from '@/api/types';
import { chatDb, deleteConversation, messagesWith, useChatVersion, type ChatMessage } from '@/features/chat/db';
import { deleteForEveryone, openImage, retryUnsent, sendGif, sendImage, sendReaction, sendReadReceipts, sendSticker, sendText } from '@/features/chat/service';
import { ChatTray } from '@/features/chat/ChatTray';
import { Sticker } from '@/features/chat/stickers';
import { pickFromLibrary } from '@/lib/images';
import { sendEvent, subscribe } from '@/lib/realtime';
import { useSession } from '@/stores/session';
import { Avatar, Row, Screen, Text, type AvatarLook } from '@/ui';
import { font, radius, space, useColors } from '@/theme';

const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

// "Only 1–3 emoji" messages are shown big. Built at runtime inside try: if the JS engine lacks Unicode property
// escapes, we just skip big emoji instead of failing to load the screen.
const onlyEmoji = (() => {
  try {
    const all = new RegExp('^(?:\\p{Extended_Pictographic}|\\p{Emoji_Component}|\\u200d|\\ufe0f|\\s)+$', 'u');
    const one = new RegExp('\\p{Extended_Pictographic}', 'gu');
    return (s: string) => all.test(s) && !/^[\d#*\s]+$/.test(s) && (s.match(one)?.length ?? 0) <= 3;
  } catch {
    return () => false;
  }
})();

const preview = (m?: ChatMessage) =>
  !m ? '' : m.deleted ? 'Deleted message' : m.kind === 'image' ? 'Photo' : m.kind === 'gif' ? 'GIF' : m.kind === 'sticker' ? 'Sticker' : (m.body ?? '');

export default function ChatScreen() {
  const { id: peerId } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const router = useRouter();
  const me = useSession((s) => s.me);
  const v = useChatVersion((s) => s.v);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [typing, setTyping] = useState(false);
  const [tray, setTray] = useState(false);
  const [sheet, setSheet] = useState<ChatMessage | null>(null);
  const [identityChanged, setIdentityChanged] = useState(false);
  const lastTypingSent = useRef(0);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
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

  const afterSend = () => {
    setReplyTo(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    const reply = replyTo?.id;
    afterSend();
    sendEvent({ type: 'typing', data: { to: peerId, on: false } });
    await sendText(peerId, body, reply);
  };

  const onType = (t: string) => {
    setText(t);
    if (Date.now() - lastTypingSent.current > 3000 && t) {
      lastTypingSent.current = Date.now();
      sendEvent({ type: 'typing', data: { to: peerId, on: true } });
    }
  };

  const toggleTray = () => {
    if (tray) {
      setTray(false);
      input.current?.focus();
    } else {
      Keyboard.dismiss();
      setTray(true);
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
      {
        text: 'More…',
        onPress: () =>
          Alert.alert(name, undefined, [
            { text: 'Mute for 8 hours', onPress: () => api(`/me/mutes/${peerId}`, { method: 'PUT', body: { until: new Date(Date.now() + 8 * 3600_000).toISOString() } }) },
            {
              text: 'Clear chat on this phone',
              style: 'destructive',
              onPress: () => Alert.alert('Clear this chat?', 'Messages are removed from this phone only.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => deleteConversation(peerId) }]),
            },
            { text: 'View profile', onPress: () => router.push(`/user/${peerId}`) },
          ]),
      },
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
              <Avatar mediaId={peer.data?.avatarMediaId} look={peer.data?.avatarStyle} name={name} size={32} />
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
          renderItem={({ item }) => (
            <Bubble
              m={item}
              quoted={item.replyTo ? byId.get(item.replyTo) : undefined}
              look={item.fromMe ? me?.avatarStyle : peer.data?.avatarStyle}
              onLongPress={() => {
                if (item.deleted || item.kind === 'system') return;
                void Haptics.selectionAsync().catch(() => {});
                setSheet(item);
              }}
            />
          )}
        />
        {canChat ? (
          <View style={{ borderTopWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: space.sm }}>
            {replyTo && (
              <Row style={{ paddingHorizontal: space.sm, paddingBottom: space.xs }}>
                <Text variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
                  Replying to: {preview(replyTo)}
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
              <Pressable accessibilityRole="button" accessibilityLabel={tray ? 'Show keyboard' : 'Emoji, stickers and GIFs'} onPress={toggleTray}>
                <Ionicons name={tray ? 'keypad' : 'happy'} size={26} color={c.link} />
              </Pressable>
              <TextInput
                ref={input}
                value={text}
                onChangeText={onType}
                onFocus={() => setTray(false)}
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
        {canChat && tray && (
          <ChatTray
            onEmoji={(e) => setText((t) => t + e)}
            onSticker={(id) => {
              const reply = replyTo?.id;
              afterSend();
              void sendSticker(peerId, id, reply);
            }}
            onGif={(g) => {
              const reply = replyTo?.id;
              afterSend();
              void sendGif(peerId, g, reply);
            }}
          />
        )}
      </KeyboardAvoidingView>
      <MessageSheet m={sheet} peerId={peerId} onClose={() => setSheet(null)} onReply={setReplyTo} />
    </Screen>
  );
}

/** Long-press sheet: quick reactions plus actions (Android alerts only fit 3 buttons). */
function MessageSheet({ m, peerId, onClose, onReply }: { m: ChatMessage | null; peerId: string; onClose: () => void; onReply: (m: ChatMessage) => void }) {
  const c = useColors();
  if (!m) return null;
  const mine = (JSON.parse(m.reactions ?? '{}') as { mine?: string }).mine;
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,18,31,0.45)', justifyContent: 'flex-end' }} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, paddingBottom: space.xxl, gap: space.md }}>
          <Row style={{ justifyContent: 'space-around' }}>
            {REACTIONS.map((e) => (
              <Pressable
                key={e}
                accessibilityRole="button"
                accessibilityLabel={mine === e ? `Remove reaction ${e}` : `React ${e}`}
                onPress={act(() => void sendReaction(peerId, m.id, mine === e ? null : e))}
                style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: mine === e ? c.brand : c.surfaceAlt }}
              >
                <RNText style={{ fontSize: 26 }}>{e}</RNText>
              </Pressable>
            ))}
          </Row>
          <SheetItem icon="arrow-undo" label="Reply" onPress={act(() => onReply(m))} />
          {m.status === 'failed' && <SheetItem icon="refresh" label="Retry sending" onPress={act(() => void retryUnsent())} />}
          {!!m.fromMe && <SheetItem icon="trash" label="Delete for everyone" danger onPress={act(() => void deleteForEveryone(peerId, m.id))} />}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetItem({ icon, label, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
      <Ionicons name={icon} size={22} color={danger ? c.danger : c.link} />
      <Text variant="bodyStrong" color={danger ? c.danger : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

function Bubble({ m, quoted, look, onLongPress }: { m: ChatMessage; quoted?: ChatMessage; look?: AvatarLook | null; onLongPress: () => void }) {
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
  const reactions = Object.values(JSON.parse(m.reactions ?? '{}') as Record<string, string>);
  const bigEmoji = m.kind === 'text' && !m.deleted && !quoted && !!m.body && onlyEmoji(m.body);
  const bare = !m.deleted && (m.kind === 'sticker' || m.kind === 'gif' || bigEmoji); // no bubble behind it

  let content;
  if (m.deleted) {
    content = (
      <Text color={fg} style={{ fontStyle: 'italic', opacity: 0.8 }}>
        Message deleted
      </Text>
    );
  } else if (m.kind === 'image') {
    content = img ? <Image source={{ uri: img }} style={{ width: 220, height: 260, borderRadius: radius.md }} contentFit="cover" accessibilityLabel="Photo" /> : <Text color={fg}>📷 Loading photo…</Text>;
  } else if (m.kind === 'gif' && m.image) {
    const g = JSON.parse(m.image) as { gifId: string; w: number; h: number };
    content = <Image source={gifSource(g.gifId, 'full')} style={{ width: 220, aspectRatio: g.w / g.h || 1, borderRadius: radius.lg, backgroundColor: c.surfaceAlt }} contentFit="cover" accessibilityLabel="GIF" />;
  } else if (m.kind === 'sticker') {
    content = <Sticker id={m.body ?? ''} look={look} size={148} />;
  } else if (bigEmoji) {
    content = <RNText style={{ fontSize: 52, lineHeight: 64 }}>{m.body}</RNText>;
  } else {
    content = (
      <Text color={fg} selectable>
        {m.body}
      </Text>
    );
  }

  return (
    <Pressable onLongPress={onLongPress} accessibilityHint="Long press to react or reply" style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
      {bare ? (
        content
      ) : (
        <View style={{ backgroundColor: mine ? c.brand : c.surface, borderRadius: radius.lg, borderBottomRightRadius: mine ? 6 : radius.lg, borderBottomLeftRadius: mine ? radius.lg : 6, padding: space.md, gap: space.xs }}>
          {quoted && (
            <View style={{ borderLeftWidth: 3, borderColor: mine ? '#fff' : c.brand, paddingLeft: space.sm, opacity: 0.8 }}>
              <Text variant="caption" color={fg} numberOfLines={2}>
                {preview(quoted)}
              </Text>
            </View>
          )}
          {content}
        </View>
      )}
      {reactions.length > 0 && (
        <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: -8, marginHorizontal: space.sm, backgroundColor: c.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, paddingHorizontal: 6, paddingVertical: 1 }}>
          <RNText style={{ fontSize: 14 }}>{reactions.join(' ')}</RNText>
        </View>
      )}
      <Text variant="caption" muted style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: 2 }}>
        {time}
        {mine && tick ? ` · ${tick}` : ''}
      </Text>
    </Pressable>
  );
}
