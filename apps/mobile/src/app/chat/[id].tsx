import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import Animated, { cancelAnimation, FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Signal from '@modules/vybe-signal';
import { api, gifSource } from '@/api/client';
import type { PublicUser, Relationship } from '@/api/types';
import { chatDb, deleteConversation, messagesWith, useChatVersion, type ChatMessage } from '@/features/chat/db';
import { chatTheme, deleteForEveryone, openImage, retryUnsent, sendGif, sendImage, sendReaction, sendReadReceipts, sendSticker, sendText, sendTheme, type Voice } from '@/features/chat/service';
import { MicButton, RecordingBar, useVoiceRecorder, VoiceBubble } from '@/features/chat/Voice';
import { activeLabel, THEMES, type ChatTheme } from '@/features/chat/look';
import { useFriends } from '@/features/friends/hooks';
import { ChatTray } from '@/features/chat/ChatTray';
import { setActiveChat } from '@/features/alerts';
import { Sticker } from '@/features/chat/stickers';
import { pickFromLibrary } from '@/lib/images';
import { sendEvent, subscribe } from '@/lib/realtime';
import { useSession } from '@/stores/session';
import { Avatar, HeartBurst, Row, Screen, Text, type AvatarLook } from '@/ui';
import { font, palette, radius, space, useColors, type ColorScheme } from '@/theme';

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
  !m ? '' : m.deleted ? 'Deleted message' : m.kind === 'image' ? 'Photo' : m.kind === 'gif' ? 'GIF' : m.kind === 'sticker' ? 'Sticker' : m.kind === 'voice' ? 'Voice message' : (m.body ?? '');

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
  const [picker, setPicker] = useState(false);
  const rec = useVoiceRecorder(peerId);
  const [now, setNow] = useState(() => Date.now());
  const lastTypingSent = useRef(0);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const peer = useQuery({ queryKey: ['user', peerId], queryFn: () => api<PublicUser & { relationship: Relationship }>(`/users/${peerId}`) });
  const name = peer.data?.displayName ?? peer.data?.username ?? '…';
  const canChat = peer.data?.relationship === 'friends';

  const friend = useFriends().data?.friends.find((f) => f.id === peerId);
  const theme = useQuery({ queryKey: ['chatTheme', peerId, v], queryFn: () => chatTheme(peerId), placeholderData: (prev) => prev });
  const look = lookFor(theme.data ?? null, c);
  const online = !!friend?.online;
  const presence = activeLabel(friend?.online, friend?.lastActiveAt, now);

  const history = useQuery({ queryKey: ['chat', peerId, v], queryFn: () => messagesWith(peerId), placeholderData: (prev) => prev });
  const messages = history.data ?? [];

  // Mark received messages read locally and tell the sender (encrypted receipt).
  useEffect(() => {
    const fresh = (history.data ?? []).filter((m) => !m.fromMe && m.status === 'received');
    if (!fresh.length) return;
    const unread = fresh.filter((m) => m.kind !== 'system').map((m) => m.id);
    void (async () => {
      const db = await chatDb();
      await db.runAsync(`UPDATE messages SET status = 'read' WHERE peerId = ? AND fromMe = 0 AND status = 'received'`, peerId);
      if (unread.length) void sendReadReceipts(peerId, unread);
      useChatVersion.getState().bump();
    })();
  }, [history.data, peerId]);

  // Keeps "Active 5m ago" current.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

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
            <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${typing ? 'typing' : (presence ?? '')}. View profile`} onPress={() => router.push(`/user/${peerId}`)}>
              <Row gap={space.sm}>
                <View>
                  <Avatar mediaId={peer.data?.avatarMediaId} look={peer.data?.avatarStyle} name={name} size={36} />
                  {online && <View style={{ position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, backgroundColor: '#22C55E', borderWidth: 2, borderColor: look.header }} />}
                </View>
                <View>
                  <Text variant="bodyStrong" color={look.ink} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text variant="caption" color={typing ? look.accent : look.muted} numberOfLines={1}>
                    {typing ? 'typing…' : (presence ?? '🔒 End-to-end encrypted')}
                  </Text>
                </View>
              </Row>
            </Pressable>
          ),
          headerRight: () => (
            <Row gap={space.lg}>
              {canChat && (
                <Pressable accessibilityRole="button" accessibilityLabel="Chat theme" onPress={() => setPicker(true)} hitSlop={10}>
                  <Ionicons name="color-palette-outline" size={23} color={look.ink} />
                </Pressable>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel="Chat options" onPress={menu} hitSlop={12}>
                <Ionicons name="ellipsis-vertical" size={22} color={look.ink} />
              </Pressable>
            </Row>
          ),
          headerStyle: { backgroundColor: look.header },
          headerShadowVisible: false,
          headerTintColor: look.ink,
        }}
      />
      {look.bg && <ChatBackground colors={look.bg} />}
      {theme.data && <StatusBar style={theme.data.dark ? 'light' : 'dark'} />}
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
          ListHeaderComponent={typing ? <TypingBubble peer={peer.data} look={look} /> : undefined}
          renderItem={({ item }) => (
            <Bubble
              row={item}
              look={look}
              quoted={item.m.replyTo ? byId.get(item.m.replyTo) : undefined}
              avatar={item.m.fromMe ? me?.avatarStyle : peer.data?.avatarStyle}
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
          <View style={{ borderTopWidth: look.bg ? 0 : 1, borderColor: c.border, backgroundColor: look.bar, padding: space.sm }}>
            {replyTo && (
              <Row style={{ paddingHorizontal: space.sm, paddingBottom: space.xs }}>
                <Text variant="caption" color={look.muted} numberOfLines={1} style={{ flex: 1 }}>
                  Replying to: {preview(replyTo)}
                </Text>
                <Pressable accessibilityLabel="Cancel reply" onPress={() => setReplyTo(null)}>
                  <Ionicons name="close" size={18} color={look.muted} />
                </Pressable>
              </Row>
            )}
            <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, backgroundColor: look.field, borderRadius: 26, padding: 4 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send a photo"
                onPress={async () => {
                  const img = await pickFromLibrary();
                  if (img) await sendImage(peerId, img.uri, img.width, img.height).catch(() => Alert.alert('Photo not sent', 'Check your connection and try again.'));
                }}
                style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}
              >
                <GradientFill colors={look.mine} />
                <Ionicons name="camera" size={20} color="#fff" />
              </Pressable>
              <TextInput
                ref={input}
                value={text}
                onChangeText={onType}
                onFocus={() => setTray(false)}
                placeholder={rec.recording ? '' : 'Message'}
                placeholderTextColor={look.muted}
                multiline
                maxLength={4000}
                accessibilityLabel="Message"
                style={{ flex: 1, maxHeight: 120, minHeight: 40, color: look.fieldText, paddingHorizontal: space.sm, paddingVertical: 9, fontFamily: font.body, fontSize: 16 }}
              />
              {text.trim() ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={send} hitSlop={8} style={{ height: 40, justifyContent: 'center', paddingHorizontal: space.md }}>
                  <Text variant="bodyStrong" color={look.send}>
                    Send
                  </Text>
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={tray ? 'Show keyboard' : 'Emoji, stickers and GIFs'} onPress={toggleTray} hitSlop={8} style={{ height: 40, justifyContent: 'center', paddingHorizontal: space.sm }}>
                  <Ionicons name={tray ? 'keypad-outline' : 'happy-outline'} size={26} color={look.fieldText} />
                </Pressable>
              )}
              <RecordingBar rec={rec} />
            </View>
            {!text.trim() && <MicButton rec={rec} />}
            </Row>
          </View>
        ) : (
          <View style={{ padding: space.lg, alignItems: 'center' }}>
            <Text color={look.muted} style={{ textAlign: 'center' }}>
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
      <ThemePicker
        visible={picker}
        current={theme.data?.id ?? null}
        onClose={() => setPicker(false)}
        onPick={(id) => {
          setPicker(false);
          if (id !== (theme.data?.id ?? null)) void sendTheme(peerId, id);
        }}
      />
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

type Look = {
  bg: [string, string] | null;
  mine: [string, string];
  theirs: string;
  ink: string;
  muted: string;
  accent: string;
  header: string;
  bar: string;
  field: string;
  fieldText: string;
  send: string;
};

/** Colours for the whole chat: the app's own when no theme is set, else derived from the theme. */
function lookFor(t: ChatTheme | null, c: ColorScheme): Look {
  if (!t) {
    return {
      bg: null, mine: [palette.grape600, '#C42F7F'], theirs: c.surfaceAlt, ink: c.text, muted: c.textMuted, accent: c.liveText,
      header: c.bg, bar: c.surface, field: c.bg, fieldText: c.text, send: c.link,
    };
  }
  const ink = t.dark ? '#FFFFFF' : '#14121F';
  return {
    bg: t.bg, mine: t.mine, theirs: t.theirs, ink, muted: t.dark ? 'rgba(255,255,255,0.72)' : 'rgba(20,18,31,0.68)', accent: t.dark ? palette.lime400 : t.mine[0],
    header: t.bg[0], bar: t.dark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.5)', field: t.dark ? 'rgba(255,255,255,0.13)' : '#FFFFFF',
    fieldText: ink, send: t.dark ? '#FFFFFF' : t.mine[0],
  };
}

let gradientIds = 0;
/** Gradient behind your own bubbles (and theme swatches); white text stays readable on both stops. */
function GradientFill({ colors, vertical }: { colors: [string, string]; vertical?: boolean }) {
  const [id] = useState(() => `g${gradientIds++}`);
  return (
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2="1">
          <Stop offset="0" stopColor={colors[0]} />
          <Stop offset="1" stopColor={colors[1]} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** Themed wallpaper: the gradient plus a few soft glows for depth. */
function ChatBackground({ colors }: { colors: [string, string] }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <GradientFill colors={colors} vertical />
      <Svg style={StyleSheet.absoluteFill}>
        <Circle cx="88%" cy="12%" r="140" fill="#FFFFFF" opacity={0.07} />
        <Circle cx="8%" cy="55%" r="110" fill="#FFFFFF" opacity={0.05} />
        <Circle cx="75%" cy="92%" r="160" fill="#FFFFFF" opacity={0.06} />
      </Svg>
    </View>
  );
}

/** Instagram-style "…" bubble while the other person types. */
function TypingBubble({ peer, look }: { peer?: PublicUser; look: Look }) {
  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      accessibilityLabel={`${peer?.displayName ?? peer?.username ?? 'Friend'} is typing`}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, marginTop: space.sm }}
    >
      <Avatar mediaId={peer?.avatarMediaId} look={peer?.avatarStyle} name={peer?.displayName ?? peer?.username} size={28} />
      <View style={{ backgroundColor: look.theirs, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', gap: 5 }}>
        {[0, 1, 2].map((i) => (
          <Dot key={i} delay={i * 160} color={look.muted} />
        ))}
      </View>
    </Animated.View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (!reduced) y.value = withDelay(delay, withRepeat(withSequence(withTiming(-5, { duration: 280 }), withTiming(0, { duration: 280 }), withTiming(0, { duration: 360 })), -1));
    return () => cancelAnimation(y);
  }, [delay, reduced, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, style]} />;
}

/** Bottom sheet of chat themes. The choice is sent (encrypted) so both people see the same theme. */
function ThemePicker({ visible, current, onClose, onPick }: { visible: boolean; current: string | null; onClose: () => void; onPick: (id: string | null) => void }) {
  const c = useColors();
  if (!visible) return null;
  const options: (ChatTheme | null)[] = [null, ...THEMES];
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,18,31,0.45)', justifyContent: 'flex-end' }} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, paddingBottom: space.xxl }}>
          <Text variant="heading" accessibilityRole="header">
            Chat theme
          </Text>
          <Text variant="caption" muted style={{ marginBottom: space.md }}>
            You both see the theme you pick.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.md }}>
            {options.map((t) => {
              const l = lookFor(t, c);
              const selected = (t?.id ?? null) === current;
              return (
                <Pressable
                  key={t?.id ?? 'default'}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${t?.name ?? 'Default'} theme`}
                  onPress={() => onPick(t?.id ?? null)}
                  style={{ width: '31%', alignItems: 'center', gap: space.xs }}
                >
                  <View
                    style={{
                      width: '100%', aspectRatio: 0.8, borderRadius: radius.md, overflow: 'hidden', borderWidth: selected ? 3 : 1,
                      borderColor: selected ? c.brand : c.border, backgroundColor: c.bg, padding: 8, justifyContent: 'center', gap: 6,
                    }}
                  >
                    {l.bg && <GradientFill colors={l.bg} vertical />}
                    <View style={{ alignSelf: 'flex-start', width: '62%', height: 16, borderRadius: 8, backgroundColor: l.theirs }} />
                    <View style={{ alignSelf: 'flex-end', width: '58%', height: 16, borderRadius: 8, overflow: 'hidden' }}>
                      <GradientFill colors={l.mine} />
                    </View>
                    <View style={{ alignSelf: 'flex-start', width: '40%', height: 16, borderRadius: 8, backgroundColor: l.theirs }} />
                  </View>
                  <Text variant="caption" color={selected ? c.link : c.text}>
                    {t?.name ?? 'Default'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Bubble({
  row,
  look,
  quoted,
  avatar,
  peer,
  isLastMine,
  onLongPress,
  onDoubleTap,
}: {
  row: ChatRow;
  look: Look;
  quoted?: ChatMessage;
  avatar?: AvatarLook | null;
  peer?: PublicUser;
  isLastMine: boolean;
  onLongPress: () => void;
  onDoubleTap: () => void;
}) {
  const { m, first, last, day } = row;
  const c = useColors();
  const [img, setImg] = useState<string | null>(null);
  const [heart, setHeart] = useState(false);
  const endHeart = useCallback(() => setHeart(false), []);
  const lastTap = useRef(0);
  const [fresh] = useState(() => Date.now() - m.createdAt < 4000);
  useEffect(() => {
    if (m.kind === 'image' && m.image && !m.deleted) void openImage(JSON.parse(m.image)).then(setImg).catch(() => setImg(null));
  }, [m.kind, m.image, m.deleted]);

  const separator = day ? (
    <Text variant="caption" color={look.muted} style={{ textAlign: 'center', marginTop: space.lg, marginBottom: space.sm }}>
      {day}
    </Text>
  ) : null;

  if (m.kind === 'system') {
    return (
      <View>
        {separator}
        <Text variant="caption" color={look.muted} style={{ textAlign: 'center', marginVertical: space.sm }}>
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
  const fg = mine ? '#FFFFFF' : look.ink;
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
  } else if (m.kind === 'voice' && m.image) {
    content = <VoiceBubble voice={JSON.parse(m.image) as Voice} mine={mine} />;
  } else if (m.kind === 'gif' && m.image) {
    const g = JSON.parse(m.image) as { gifId: string; w: number; h: number };
    content = <Image source={gifSource(g.gifId, 'full')} style={{ width: 220, aspectRatio: g.w / g.h || 1, borderRadius: R, backgroundColor: c.surfaceAlt }} contentFit="cover" accessibilityLabel="GIF" />;
  } else if (m.kind === 'sticker') {
    content = <Sticker id={m.body ?? ''} look={avatar} size={148} />;
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
      onDoubleTap();
    } else lastTap.current = now;
  };

  return (
    // Only brand-new messages animate in; older ones mounting while scrolling should not.
    <Animated.View entering={fresh ? FadeInDown.springify().damping(16) : undefined} style={{ marginTop: first ? space.sm : 2 }}>
      {separator}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: mine ? 'flex-end' : 'flex-start', gap: space.xs }}>
        {!mine && <View style={{ width: 28 }}>{last && <Avatar mediaId={peer?.avatarMediaId} look={peer?.avatarStyle} name={peer?.displayName ?? peer?.username} size={28} />}</View>}
        <Pressable onPress={tap} onLongPress={onLongPress} delayLongPress={300} accessibilityHint="Double tap to like, hold for more" style={{ maxWidth: '76%' }}>
          {bare ? (
            content
          ) : (
            <View style={[{ backgroundColor: mine ? look.mine[0] : look.theirs, paddingHorizontal: 14, paddingVertical: 9, overflow: 'hidden', gap: space.xs }, corners]}>
              {mine && <GradientFill colors={look.mine} />}
              {quoted && (
                <View style={{ borderLeftWidth: 3, borderColor: mine ? 'rgba(255,255,255,0.8)' : look.accent, paddingLeft: space.sm, opacity: 0.85 }}>
                  <Text variant="caption" color={fg} numberOfLines={2}>
                    {preview(quoted)}
                  </Text>
                </View>
              )}
              {content}
            </View>
          )}
          {heart && <HeartBurst size={64} onDone={endHeart} />}
          {reactions.length > 0 && (
            <View style={[{ position: 'absolute', bottom: -10, backgroundColor: c.surface, borderRadius: radius.pill, borderWidth: 2, borderColor: look.bg ? 'transparent' : c.bg, paddingHorizontal: 5, paddingVertical: 1 }, mine ? { left: -4 } : { right: -4 }]}>
              <RNText style={{ fontSize: 13 }}>{reactions.join('')}</RNText>
            </View>
          )}
        </Pressable>
      </View>
      {(status !== '' || reactions.length > 0) && (
        <Text variant="caption" color={m.status === 'failed' ? c.danger : look.muted} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: reactions.length ? 12 : 2, marginLeft: mine ? 0 : 34 }}>
          {status}
        </Text>
      )}
    </Animated.View>
  );
}
