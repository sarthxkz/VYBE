import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { Stack } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { answer, FAQ, supportMailto, type Faq } from '@/features/help/assistant';
import { LogoMark } from '@/features/brand/Logo';
import { useSession } from '@/stores/session';
import { Appear, Gradient, PressScale, Text, TypingDots } from '@/ui';
import { font, gradient, radius, space, useColors } from '@/theme';

type Msg = { id: number; fromMe: boolean; text: string; unknown?: boolean };
const STARTERS = ['not-sending', 'code', 'backup', 'ghost', 'blink', 'voice'];
const faq = (id: string) => FAQ.find((f) => f.id === id)!;

export default function Assistant() {
  const c = useColors();
  const me = useSession((s) => s.me);
  const first = (me?.displayName ?? me?.username ?? '').split(' ')[0];
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, fromMe: false, text: `Hi${first ? ` ${first}` : ''}! 👋 I’m the Vybe Assistant. Ask me anything about Vybe, or pick a topic below.` },
  ]);
  const [suggest, setSuggest] = useState<Faq[]>(STARTERS.map(faq));
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const nextId = useRef(1);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const version = String(Constants.expoConfig?.version ?? '');
  const emailSupport = () => void Linking.openURL(supportMailto(msgs, version));

  const ask = (q: string, picked?: Faq) => {
    const question = q.trim();
    if (!question || typing) return;
    void Haptics.selectionAsync().catch(() => {});
    setText('');
    setSuggest([]);
    setMsgs((m) => [...m, { id: nextId.current++, fromMe: true, text: question }]);
    setTyping(true);
    const hit = picked ?? answer(question);
    // A short "typing" pause reads as a reply rather than a page flip.
    timer.current = setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [
        ...m,
        hit
          ? { id: nextId.current++, fromMe: false, text: hit.a }
          : { id: nextId.current++, fromMe: false, unknown: true, text: 'I’m not sure about that one yet. Our team can help: tap “Email support” and your question goes along with it.' },
      ]);
      // Offer related topics next (excluding the one just answered).
      setSuggest(FAQ.filter((f) => f.id !== hit?.id).sort(() => Math.random() - 0.5).slice(0, 4));
    }, 650 + Math.min(900, (hit?.a.length ?? 60) * 4));
  };

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [msgs, typing, suggest]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="padding" keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Email support" onPress={emailSupport} hitSlop={12}>
              <Ionicons name="mail-outline" size={23} color={c.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.sm }} keyboardShouldPersistTaps="handled">
        <Appear>
          <View style={{ alignItems: 'center', marginBottom: space.md, gap: space.xs }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              <Gradient colors={gradient.aurora} />
              <LogoMark size={34} color="#fff" />
            </View>
            <Text variant="bodyStrong">Vybe Assistant</Text>
            <Text variant="caption" muted style={{ textAlign: 'center' }}>
              Instant answers. Replies are automatic; nothing you type leaves your phone unless you email us.
            </Text>
          </View>
        </Appear>

        {msgs.map((m) => (
          <Bubble key={m.id} m={m} onEmail={emailSupport} />
        ))}
        {typing && (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={{ alignSelf: 'flex-start', backgroundColor: c.surfaceAlt, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14 }}>
            <TypingDots color={c.textMuted} size={7} />
          </Animated.View>
        )}

        {suggest.length > 0 && !typing && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
            {suggest.map((f, i) => (
              <Appear key={f.id} index={i}>
                <PressScale
                  accessibilityRole="button"
                  onPress={() => ask(f.q, f)}
                  scaleTo={0.94}
                  style={{ paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.surface }}
                >
                  <Text variant="label" color={c.link}>
                    {f.q}
                  </Text>
                </PressScale>
              </Appear>
            ))}
            {msgs.length > 2 && (
              <Appear index={suggest.length}>
                <PressScale accessibilityRole="button" onPress={emailSupport} scaleTo={0.94} style={{ paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: c.surfaceAlt }}>
                  <Text variant="label">✉️ Email support</Text>
                </PressScale>
              </Appear>
            )}
          </View>
        )}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.sm, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => ask(text)}
          placeholder="Ask a question…"
          placeholderTextColor={c.textMuted}
          returnKeyType="send"
          maxLength={300}
          accessibilityLabel="Ask the assistant"
          style={{ flex: 1, minHeight: 44, maxHeight: 110, borderRadius: 22, paddingHorizontal: space.lg, backgroundColor: c.bg, color: c.text, fontFamily: font.body, fontSize: 16 }}
        />
        {!!text.trim() && (
          <Animated.View entering={ZoomIn.springify().damping(14)} exiting={FadeOut.duration(100)}>
            <PressScale accessibilityRole="button" accessibilityLabel="Send" onPress={() => ask(text)} scaleTo={0.85} style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              <Gradient colors={gradient.brand} />
              <Ionicons name="arrow-up" size={22} color="#fff" />
            </PressScale>
          </Animated.View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, onEmail }: { m: Msg; onEmail: () => void }) {
  const c = useColors();
  return (
    <Appear style={{ alignSelf: m.fromMe ? 'flex-end' : 'flex-start', maxWidth: '84%' }}>
      <View style={{ borderRadius: 20, borderBottomRightRadius: m.fromMe ? 6 : 20, borderBottomLeftRadius: m.fromMe ? 20 : 6, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: m.fromMe ? undefined : c.surfaceAlt, gap: space.sm }}>
        {m.fromMe && <Gradient colors={gradient.brand} />}
        <Text color={m.fromMe ? '#fff' : c.text}>{m.text}</Text>
        {m.unknown && (
          <PressScale accessibilityRole="button" onPress={onEmail} scaleTo={0.95} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: c.brand }}>
            <Ionicons name="mail" size={16} color={c.brandText} />
            <Text variant="label" color={c.brandText}>
              Email support
            </Text>
          </PressScale>
        )}
      </View>
    </Appear>
  );
}
