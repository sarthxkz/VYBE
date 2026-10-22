import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Pressable, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Signal from '@modules/vybe-signal';
import { api } from '@/api/client';
import type { PublicUser, Relationship } from '@/api/types';
import { chatDb, deleteConversation, messagesWith, useChatVersion, type ChatMessage } from '@/features/chat/db';
import { deleteForEveryone, openImage, retryUnsent, sendImage, sendReadReceipts, sendText, type Voice } from '@/features/chat/service';
import { MicButton, RecordingBar, useVoiceRecorder, VoiceBubble } from '@/features/chat/Voice';
import { pickFromLibrary } from '@/lib/images';
import { sendEvent, subscribe } from '@/lib/realtime';
import { useSession } from '@/stores/session';
import { Avatar, PressScale, Row, Screen, Text, TypingDots } from '@/ui';
import { font, motion, radius, shadow, space, useColors } from '@/theme';

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
  const rec = useVoiceRecorder(peerId);
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
  const reversed = [...messages].reverse();
  const hasText = !!text.trim();
  // The seen/delivered label sits under my newest message only, like most messengers.
  const lastMine = reversed.find((m) => m.fromMe && m.kind !== 'system' && !m.deleted)?.id;

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
                {typing ? (
                  <Animated.View key="typing" entering={FadeInDown.duration(motion.fast)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                    <TypingDots color={c.liveText} size={5} />
                    <Text variant="caption" color={c.liveText}>
                      typing
                    </Text>
                  </Animated.View>
                ) : (
                  <Text variant="caption" color={c.textMuted}>
                    🔒 End-to-end encrypted
                  </Text>
                )}
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
          headerShadowVisible: false,
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
          data={reversed}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.md, gap: 3 }}
          renderItem={({ item, index }) => {
            // Inverted list: the message drawn just below this one is the previous item.
            const below = reversed[index - 1];
            const tail = !below || below.fromMe !== item.fromMe || below.kind === 'system' || below.createdAt - item.createdAt > 3 * 60_000;
            return <Bubble m={item} tail={tail} receipt={item.id === lastMine} quoted={item.replyTo ? byId.get(item.replyTo) : undefined} onLongPress={() => actions(item, peerId, setReplyTo)} />;
          }}
        />
        {canChat ? (
          <View style={{ backgroundColor: c.bg, paddingHorizontal: space.sm, paddingTop: space.xs, paddingBottom: space.sm }}>
            {replyTo && (
              <Animated.View entering={FadeInDown.springify().damping(motion.snappy.damping)} exiting={FadeOutDown.duration(motion.fast)}>
                <Row style={{ marginHorizontal: space.xs, marginBottom: space.xs, padding: space.sm, borderRadius: radius.md, backgroundColor: c.surface, borderLeftWidth: 3, borderLeftColor: c.brand }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="caption" color={c.link} style={{ fontFamily: font.bodySemi }}>
                      Replying to {replyTo.fromMe ? 'yourself' : name}
                    </Text>
                    <Text variant="caption" muted numberOfLines={1}>
                      {replyTo.kind === 'voice' ? '🎙️ Voice message' : (replyTo.body ?? '📷 Photo')}
                    </Text>
                  </View>
                  <Pressable accessibilityLabel="Cancel reply" hitSlop={10} onPress={() => setReplyTo(null)}>
                    <Ionicons name="close-circle" size={20} color={c.textMuted} />
                  </Pressable>
                </Row>
              </Animated.View>
            )}
            <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
              <View style={[{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, paddingLeft: space.xs, minHeight: 46 }, shadow.card]}>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel="Send a photo"
                  scaleTo={0.85}
                  style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}
                  onPress={async () => {
                    const img = await pickFromLibrary();
                    if (img) await sendImage(peerId, img.uri, img.width, img.height).catch(() => Alert.alert('Photo not sent', 'Check your connection and try again.'));
                  }}
                >
                  <Ionicons name="image-outline" size={24} color={c.link} />
                </PressScale>
                <TextInput
                  value={text}
                  onChangeText={onType}
                  placeholder={rec.recording ? '' : 'Message'}
                  placeholderTextColor={c.textMuted}
                  multiline
                  maxLength={4000}
                  accessibilityLabel="Message"
                  style={{ flex: 1, maxHeight: 120, minHeight: 44, color: c.text, paddingHorizontal: space.sm, paddingVertical: space.sm + 2, fontFamily: font.body, fontSize: 16 }}
                />
                <RecordingBar rec={rec} />
              </View>
              {hasText && !rec.recording ? (
                <Animated.View key="send" entering={ZoomIn.springify().damping(motion.bouncy.damping)} exiting={ZoomOut.duration(motion.fast)}>
                  <PressScale
                    accessibilityRole="button"
                    accessibilityLabel="Send"
                    scaleTo={0.85}
                    onPress={send}
                    style={[{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }, shadow.glow]}
                  >
                    <Ionicons name="arrow-up" size={22} color="#fff" />
                  </PressScale>
                </Animated.View>
              ) : (
                <Animated.View key="mic" entering={ZoomIn.springify().damping(motion.bouncy.damping)} exiting={ZoomOut.duration(motion.fast)}>
                  <MicButton rec={rec} />
                </Animated.View>
              )}
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

function Bubble({ m, quoted, tail, receipt, onLongPress }: { m: ChatMessage; quoted?: ChatMessage; tail: boolean; receipt?: boolean; onLongPress: () => void }) {
  const c = useColors();
  const reduced = useReducedMotion();
  // Pop in only messages that just arrived or were just sent, not history scrolled into view.
  const [fresh] = useState(() => Date.now() - m.createdAt < 5000 && !reduced);
  const pop = useSharedValue(fresh ? 0 : 1);
  useEffect(() => {
    if (fresh) pop.set(withSpring(1, motion.snappy));
  }, [fresh, pop]);
  const popStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, pop.value * 2), transform: [{ scale: 0.85 + 0.15 * pop.value }] }));
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
  const tick = ({ sending: 'time-outline', failed: 'alert-circle', sent: 'checkmark', delivered: 'checkmark-done', read: 'checkmark-done', received: null } as const)[m.status];
  const tickColor = m.status === 'read' ? c.link : m.status === 'failed' ? c.danger : c.textMuted;
  const corner = tail ? 6 : radius.lg;
  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <Animated.View style={[{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', marginBottom: tail ? space.sm : 0, transformOrigin: mine ? 'right bottom' : 'left bottom' }, popStyle]}>
    <Pressable onLongPress={onLongPress} delayLongPress={300} accessibilityHint="Long press for options">
      <View style={[{ backgroundColor: mine ? c.brand : c.surface, borderRadius: radius.lg, borderBottomRightRadius: mine ? corner : radius.lg, borderBottomLeftRadius: mine ? radius.lg : corner, paddingHorizontal: space.md, paddingVertical: space.sm + 2, gap: space.xs }, !mine && { borderWidth: 1, borderColor: c.border }]}>
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
        ) : m.kind === 'voice' && m.image ? (
          <VoiceBubble voice={JSON.parse(m.image) as Voice} mine={mine} />
        ) : m.kind === 'image' ? (
          img ? <Image source={{ uri: img }} style={{ width: 220, height: 260, borderRadius: radius.md }} contentFit="cover" accessibilityLabel="Photo" /> : <Text color={fg}>📷 Loading photo…</Text>
        ) : (
          <Text color={fg} selectable>
            {m.body}
          </Text>
        )}
      </View>
      {tail && (
        <Row gap={3} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: 3, marginHorizontal: space.xs }}>
          <Text variant="caption" muted style={{ fontSize: 11 }}>
            {m.status === 'failed' ? 'Not sent · hold to retry' : time}
          </Text>
          {mine && tick && <Ionicons name={tick} size={14} color={tickColor} accessibilityLabel={m.status} />}
        </Row>
      )}
      {receipt && <Receipt status={m.status} />}
    </Pressable>
    </Animated.View>
  );
}

/** "Seen" under my newest message. It appears once the friend’s encrypted read receipt arrives. */
function Receipt({ status }: { status: ChatMessage['status'] }) {
  const c = useColors();
  const label = { sending: 'Sending…', sent: 'Sent', delivered: 'Delivered', read: 'Seen', failed: null, received: null }[status];
  if (!label) return null;
  return (
    <Animated.View key={status} entering={FadeInDown.springify().damping(motion.snappy.damping)} style={{ alignSelf: 'flex-end', marginTop: 2, marginHorizontal: space.xs, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {status === 'read' && <Ionicons name="eye" size={12} color={c.link} />}
      <Text variant="caption" color={status === 'read' ? c.link : c.textMuted} style={{ fontSize: 11, fontFamily: status === 'read' ? font.bodySemi : font.body }} accessibilityLiveRegion="polite">
        {label}
      </Text>
    </Animated.View>
  );
}
