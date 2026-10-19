import { useEffect } from 'react';
import { Modal, Pressable, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { Button, Text } from '@/ui';
import { palette, radius, space, useColors } from '@/theme';

const SEEN_KEY = 'vybe.intro.blink';

/** True the first time someone picks Blink on this phone. */
export const shouldIntroduceBlink = async () => !(await SecureStore.getItemAsync(SEEN_KEY).catch(() => '1'));

/** "Introducing Blink" sheet, shown the first time the Blink option is switched on. */
export function BlinkIntro({ visible, onDone }: { visible: boolean; onDone: (keepBlink: boolean) => void }) {
  const c = useColors();
  const reduced = useReducedMotion();
  const y = useSharedValue(reduced ? 0 : 400);

  useEffect(() => {
    if (visible) y.value = reduced ? 0 : withSpring(0, { damping: 16, stiffness: 140 });
    else y.value = reduced ? 0 : 400;
  }, [visible, reduced, y]);

  const close = (keep: boolean) => {
    void SecureStore.setItemAsync(SEEN_KEY, '1').catch(() => {});
    onDone(keep);
  };
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => close(false)} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,18,31,0.55)', justifyContent: 'flex-end' }} onPress={() => close(true)} accessibilityLabel="Close">
        <Animated.View style={style}>
          <Pressable
            accessibilityViewIsModal
            style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.xl, paddingBottom: space.xxl, gap: space.md }}
          >
            <View style={{ alignSelf: 'center', width: 88, height: 88, borderRadius: 44, backgroundColor: palette.grape500, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 44, lineHeight: 52 }}>✨</Text>
            </View>
            <Text variant="label" color={c.link} style={{ textAlign: 'center' }}>
              NEW ON VYBE
            </Text>
            <Text variant="hero" style={{ textAlign: 'center' }} accessibilityRole="header">
              Introducing Blink
            </Text>
            <Text variant="heading" style={{ textAlign: 'center' }}>
              Your every moment, captured once.
            </Text>
            <Text muted style={{ textAlign: 'center' }}>
              Each friend can open your Blink once, then it’s gone. Unopened Blinks disappear after 24 hours. No captions, no edits, just the moment.
            </Text>
            <Button title="Got it, send as a Blink" kind="action" style={{ marginTop: space.sm }} onPress={() => close(true)} />
            <Button title="Send a normal photo" kind="ghost" onPress={() => close(false)} />
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
