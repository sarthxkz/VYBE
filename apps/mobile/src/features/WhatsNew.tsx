import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Appear, Button, Gradient, Text } from '@/ui';
import { gradient, radius, space, useColors } from '@/theme';

/**
 * Release notes, shown once per update. Every OTA or APK that changes something users notice:
 * give it a new `id` and rewrite `items`.
 */
export const RELEASE = {
  id: '0.1.5-2',
  items: [
    {
      emoji: '🔔',
      title: 'Notifications that reach you',
      body: 'Messages, friend requests and new friends now ping you even when Vybe is closed.',
    },
    {
      emoji: '🔴',
      title: 'Unread badge on Chats',
      body: 'See at a glance how many friends are waiting on a reply.',
    },
    {
      emoji: '🗺️',
      title: 'Stories on the map',
      body: 'Your friends’ stories now float right on top of the map.',
    },
    {
      emoji: '📸',
      title: 'A snappier camera',
      body: 'New shutter, flash and flip, plus a slow zoom on stories.',
    },
    {
      emoji: '💬',
      title: 'Vybe Assistant',
      body: 'Quick answers in You → About & help, or email us from there.',
    },
  ],
};
const SEEN_KEY = 'vybe.whatsNew';

/** "What's new" sheet: slides up once after an update, then never again until the next release. */
export function WhatsNew() {
  const c = useColors();
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const y = useSharedValue(reduced ? 0 : 500);

  useEffect(() => {
    void SecureStore.getItemAsync(SEEN_KEY)
      .then((seen) => seen !== RELEASE.id && setVisible(true))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (visible) y.value = reduced ? 0 : withSpring(0, { damping: 18, stiffness: 150 });
  }, [visible, reduced, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  const close = () => {
    void SecureStore.setItemAsync(SEEN_KEY, RELEASE.id).catch(() => {});
    setVisible(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(20,18,31,0.55)', justifyContent: 'flex-end' }}
        onPress={close}
        accessibilityLabel="Close"
      >
        <Animated.View style={style}>
          <Pressable
            accessibilityViewIsModal
            style={{
              backgroundColor: c.surface,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              padding: space.xl,
              paddingBottom: space.xxl,
              gap: space.md,
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 72,
                height: 72,
                borderRadius: 36,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Gradient colors={gradient.sunset} />
              <Text style={{ fontSize: 36, lineHeight: 44 }}>🎉</Text>
            </View>
            <Text variant="label" color={c.link} style={{ textAlign: 'center' }}>
              JUST UPDATED
            </Text>
            <Text variant="hero" style={{ textAlign: 'center' }} accessibilityRole="header">
              What’s new in Vybe
            </Text>
            <View style={{ gap: space.md, marginTop: space.xs }}>
              {RELEASE.items.map((it, i) => (
                <Appear key={it.title} index={i + 1}>
                  <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: c.surfaceAlt,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 20, lineHeight: 26 }}>{it.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{it.title}</Text>
                      <Text variant="caption" muted>
                        {it.body}
                      </Text>
                    </View>
                  </View>
                </Appear>
              ))}
            </View>
            <Button
              title="Let’s go"
              kind="action"
              style={{ marginTop: space.sm }}
              onPress={close}
            />
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
