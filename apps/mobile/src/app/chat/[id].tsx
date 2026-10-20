import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
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
import { setActiveChat } from '@/features/alerts';
import { Sticker } from '@/features/chat/stickers';
import { pickFromLibrary } from '@/lib/images';
import { sendEvent, subscribe } from '@/lib/realtime';
import { useSession } from '@/stores/session';
import { Avatar, Row, Screen, Text, type AvatarLook } from '@/ui';
import { font, palette, radius, space, useColors } from '@/theme';

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
    setActiveChat(peerId);
    return () => setActiveChat(null);
  }, [peerId]);

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
  const rows = buildRows(messages);
  const lastMineId = [...messages].reverse().find((m) => m.fromMe && m.kind !== 'system')?.id;

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
          headerStyle: { backgroundColor: c.bg },
          headerShadowVisible: false,
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
          data={[...rows].reverse()}
          keyExtractor={(r) => r.m.id}
          contentContainerStyle={{ paddingHorizontal: space.md, paddingVertical: space.sm }}
          renderItem={({ item }) => (
            <Bubble
              row={item}
              quoted={item.m.replyTo ? byId.get(item.m.replyTo) : undefined}
              look={item.m.fromMe ? me?.avatarStyle : peer.data?.avatarStyle}
              peer={peer.data}
              isLastMine={item.m.id === lastMineId}
              onDoubleTap={() => {
                if (item.m.deleted || item.m.kind === 'system') return;
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                void sendReaction(peerId, item.m.id, '❤️');
              }}
              onLongPress={() => {
                if (item.m.deleted || item.m.kind === 'system') return;
                void Haptics.selectionAsync().catch(() => {});
                setSheet(item.m);
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
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, backgroundColor: c.bg, borderRadius: 26, padding: 4 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send a photo"
                onPress={async () => {
                  const img = await pickFromLibrary();
                  if (img) await sendImage(peerId, img.uri, img.width, img.height).catch(() => Alert.alert('Photo not sent', 'Check your connection and try again.'));
                }}
                style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}
              >
                <GradientFill />
                <Ionicons name="camera" size={20} color="#fff" />
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
                style={{ flex: 1, maxHeight: 120, minHeight: 40, color: c.text, paddingHorizontal: space.sm, paddingVertical: 9, fontFamily: font.body, fontSize: 16 }}
              />
              {text.trim() ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={send} hitSlop={8} style={{ height: 40, justifyContent: 'center', paddingHorizontal: space.md }}>
                  <Text variant="bodyStrong" color={c.link}>
                    Send
                  </Text>
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={tray ? 'Show keyboard' : 'Emoji, stickers and GIFs'} onPress={toggleTray} hitSlop={8} style={{ height: 40, justifyContent: 'center', paddingHorizontal: space.sm }}>
                  <Ionicons name={tray ? 'keypad-outline' : 'happy-outline'} size={26} color={c.text} />
                </Pressable>
              )}
            </View>
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

type ChatRow = { m: ChatMessage; first: boolean; last: boolean; day: string | null };
const GROUP_MS = 5 * 60_000;
const dayKey = (t: number) => new Date(t).toDateString();
function dayLabel(t: number) {
  const d = new Date(t);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `Today ${time}`;
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

/** Instagram-style grouping: consecutive messages from the same person within 5 minutes share a block. */
function buildRows(list: ChatMessage[]): ChatRow[] {
  const together = (a?: ChatMessage, b?: ChatMessage) =>
    !!a && !!b && a.fromMe === b.fromMe && a.kind !== 'system' && b.kind !== 'system' && Math.abs(b.createdAt - a.createdAt) < GROUP_MS && dayKey(a.createdAt) === dayKey(b.createdAt);
  return list.map((m, i) => {
    const prev = list[i - 1];
    const next = list[i + 1];
    const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt) || m.createdAt - prev.createdAt > 60 * 60_000;
    return { m, first: !together(prev, m), last: !together(m, next), day: newDay ? dayLabel(m.createdAt) : null };
  });
}

/** Brand gradient (grape → magenta) behind your own bubbles; white text keeps AA contrast on both ends. */
function GradientFill() {
  return (
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="mine" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={palette.grape600} />
          <Stop offset="1" stopColor="#C42F7F" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#mine)" />
    </Svg>
  );
}

function Bubble({
  row,
  quoted,
  look,
  peer,
  isLastMine,
  onLongPress,
  onDoubleTap,
}: {
  row: ChatRow;
  quoted?: ChatMessage;
  look?: AvatarLook | null;
  peer?: PublicUser;
  isLastMine: boolean;
  onLongPress: () => void;
  onDoubleTap: () => void;
}) {
  const { m, first, last, day } = row;
  const c = useColors();
  const [img, setImg] = useState<string | null>(null);
  const [heart, setHeart] = useState(false);
  const lastTap = useRef(0);
  useEffect(() => {
    if (m.kind === 'image' && m.image && !m.deleted) void openImage(JSON.parse(m.image)).then(setImg).catch(() => setImg(null));
  }, [m.kind, m.image, m.deleted]);

  const separator = day ? (
    <Text variant="caption" muted style={{ textAlign: 'center', marginTop: space.lg, marginBottom: space.sm }}>
      {day}
    </Text>
  ) : null;

  if (m.kind === 'system') {
    return (
      <View>
        {separator}
        <Text variant="caption" muted style={{ textAlign: 'center', marginVertical: space.sm }}>
          {m.body}
        </Text>
      </View>
    );
  }
  const mine = !!m.fromMe;
  const reactions = Object.values(JSON.parse(m.reactions ?? '{}') as Record<string, string>);
  const bigEmoji = m.kind === 'text' && !m.deleted && !quoted && !!m.body && onlyEmoji(m.body);
  const bare = !m.deleted && (m.kind === 'sticker' || m.kind === 'gif' || m.kind === 'image' || bigEmoji);
  const R = 20;
  const S = 6;
  const corners = mine
    ? { borderTopLeftRadius: R, borderBottomLeftRadius: R, borderTopRightRadius: first ? R : S, borderBottomRightRadius: last ? R : S }
    : { borderTopRightRadius: R, borderBottomRightRadius: R, borderTopLeftRadius: first ? R : S, borderBottomLeftRadius: last ? R : S };
  const fg = mine ? '#FFFFFF' : c.text;
  const statusText = { sending: 'Sending…', failed: 'Not sent · hold to retry', sent: 'Sent', delivered: 'Delivered', read: 'Seen', received: '' }[m.status];
  const status = mine && (isLastMine || m.status === 'failed') ? statusText : '';

  let content;
  if (m.deleted) {
    content = (
      <Text color={fg} style={{ fontStyle: 'italic', opacity: 0.8 }}>
        Message deleted
      </Text>
    );
  } else if (m.kind === 'image') {
    content = img ? (
      <Image source={{ uri: img }} style={{ width: 220, height: 280, borderRadius: R }} contentFit="cover" accessibilityLabel="Photo" />
    ) : (
      <View style={{ width: 220, height: 280, borderRadius: R, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Text muted>📷</Text>
      </View>
    );
  } else if (m.kind === 'gif' && m.image) {
    const g = JSON.parse(m.image) as { gifId: string; w: number; h: number };
    content = <Image source={gifSource(g.gifId, 'full')} style={{ width: 220, aspectRatio: g.w / g.h || 1, borderRadius: R, backgroundColor: c.surfaceAlt }} contentFit="cover" accessibilityLabel="GIF" />;
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

  const tap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      setHeart(true);
      setTimeout(() => setHeart(false), 700);
      onDoubleTap();
    } else lastTap.current = now;
  };

  return (
    <View style={{ marginTop: first ? space.sm : 2 }}>
      {separator}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: mine ? 'flex-end' : 'flex-start', gap: space.xs }}>
        {!mine && <View style={{ width: 28 }}>{last && <Avatar mediaId={peer?.avatarMediaId} look={peer?.avatarStyle} name={peer?.displayName ?? peer?.username} size={28} />}</View>}
        <Pressable onPress={tap} onLongPress={onLongPress} delayLongPress={300} accessibilityHint="Double tap to like, hold for more" style={{ maxWidth: '76%' }}>
          {bare ? (
            content
          ) : (
            <View style={[{ backgroundColor: mine ? palette.grape600 : c.surfaceAlt, paddingHorizontal: 14, paddingVertical: 9, overflow: 'hidden', gap: space.xs }, corners]}>
              {mine && <GradientFill />}
              {quoted && (
                <View style={{ borderLeftWidth: 3, borderColor: mine ? 'rgba(255,255,255,0.8)' : c.brand, paddingLeft: space.sm, opacity: 0.85 }}>
                  <Text variant="caption" color={fg} numberOfLines={2}>
                    {preview(quoted)}
                  </Text>
                </View>
              )}
              {content}
            </View>
          )}
          {heart && (
            <Animated.Text entering={ZoomIn.springify()} exiting={FadeOut} style={{ position: 'absolute', alignSelf: 'center', top: '20%', fontSize: 44 }}>
              ❤️
            </Animated.Text>
          )}
          {reactions.length > 0 && (
            <View style={[{ position: 'absolute', bottom: -10, backgroundColor: c.surface, borderRadius: radius.pill, borderWidth: 2, borderColor: c.bg, paddingHorizontal: 5, paddingVertical: 1 }, mine ? { left: -4 } : { right: -4 }]}>
              <RNText style={{ fontSize: 13 }}>{reactions.join('')}</RNText>
            </View>
          )}
        </Pressable>
      </View>
      {(status !== '' || reactions.length > 0) && (
        <Text variant="caption" color={m.status === 'failed' ? c.danger : c.textMuted} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: reactions.length ? 12 : 2, marginLeft: mine ? 0 : 34 }}>
          {status}
        </Text>
      )}
    </View>
  );
}
