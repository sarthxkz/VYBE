import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import { permission } from '@/copy';
import { pickFromLibrary, prepareImage, type Prepared } from '@/lib/images';
import { Button, EmptyState, PressScale, Screen, Text, useBreathe } from '@/ui';
import { motion, palette, space } from '@/theme';

export default function CameraScreen() {
  const router = useRouter();
  const { blink } = useLocalSearchParams<{ blink?: string }>(); // forwarded so "Send a Blink" starts in Blink mode
  const cam = useRef<CameraView>(null);
  const { to } = useLocalSearchParams<{ to?: string }>(); // 'story' when opened from the story tray
  const [perm, requestPerm] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [shot, setShot] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const [active, setActive] = useState(AppState.currentState === 'active');
  const reduced = useReducedMotion();
  const flashOp = useSharedValue(0);
  const spin = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOp.value }));
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  // Release the camera when backgrounded or navigated away (Android lifecycle).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  if (!perm) return <Screen><View /></Screen>;
  if (!perm.granted) {
    return (
      <Screen>
        <EmptyState
          emoji="📸"
          title={permission.cameraTitle}
          body={permission.cameraBody}
          action={
            perm.canAskAgain ? (
              <Button title={permission.cameraCta} onPress={requestPerm} />
            ) : (
              <Button title="Open settings" onPress={() => Linking.openSettings()} />
            )
          }
        />
        <Button title="Pick from gallery instead" kind="ghost" onPress={async () => { const img = await pickFromLibrary(); if (img) router.replace({ pathname: '/send-photo', params: { uri: img.uri, w: img.width, h: img.height, blink, ...(to && { to }) } }); }} />
        <Button title="Close" kind="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const take = async () => {
    if (!cam.current || busy) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // White flash the moment the shutter fires, like Snapchat.
    if (!reduced) flashOp.set(withSequence(withTiming(0.85, { duration: 50 }), withTiming(0, { duration: 320 })));
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.9, exif: false, shutterSound: false });
      if (pic) setShot(await prepareImage(pic.uri));
    } finally {
      setBusy(false);
    }
  };

  const send = (img: Prepared) => router.replace({ pathname: '/send-photo', params: { uri: img.uri, w: img.width, h: img.height, blink, ...(to && { to }) } });

  if (shot) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(18).stiffness(220)} style={StyleSheet.absoluteFill}>
          <Image source={{ uri: shot.uri }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel="Photo preview" />
        </Animated.View>
        <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: space.md, padding: space.xl }}>
          <Button title="Retake" kind="secondary" style={{ flex: 1 }} onPress={() => setShot(null)} />
          <Button title="Send to…" kind="action" style={{ flex: 1 }} onPress={() => send(shot)} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {focused && active && <CameraView ref={cam} style={StyleSheet.absoluteFill} facing={facing} flash={flash} />}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', zIndex: 5 }, flashStyle]} />
      <SafeAreaView edges={['top']} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space.lg }}>
        <Round icon="close" label="Close camera" onPress={() => router.back()} />
        <Round icon={flash === 'on' ? 'flash' : flash === 'auto' ? 'flash-outline' : 'flash-off'} label={`Flash ${flash}`} onPress={() => setFlash(flash === 'off' ? 'on' : flash === 'on' ? 'auto' : 'off')} />
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: space.xl }}>
        <Round icon="images" label="Pick from gallery" onPress={async () => { const img = await pickFromLibrary(); if (img) send(img); }} />
        <Shutter onPress={take} busy={busy} />
        <Round
          icon="camera-reverse"
          label="Switch camera"
          spin={spinStyle}
          onPress={() => {
            spin.set(reduced ? 0 : withSpring(spin.get() + 180, motion.snappy));
            setFacing(facing === 'back' ? 'front' : 'back');
          }}
        />
      </SafeAreaView>
      {busy && (
        <Animated.View entering={FadeIn.delay(250)} style={{ position: 'absolute', alignSelf: 'center', top: '50%', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
          <Text color="#fff">Processing…</Text>
        </Animated.View>
      )}
    </View>
  );
}

function Round({ icon, label, onPress, spin }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; spin?: ReturnType<typeof useAnimatedStyle> }) {
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={0.86} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={spin}>
        <Ionicons name={icon} size={24} color="#fff" />
      </Animated.View>
    </PressScale>
  );
}

/** Snapchat-style shutter: the ring tightens under your thumb and springs back; it breathes while processing. */
function Shutter({ onPress, busy }: { onPress: () => void; busy: boolean }) {
  const press = useSharedValue(0);
  const breathe = useBreathe(600);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: (1 - 0.1 * press.value) * (busy ? 1 - 0.06 * breathe.value : 1) }] }));
  const core = useAnimatedStyle(() => ({ transform: [{ scale: 0.84 - 0.1 * press.value }], opacity: 0.35 + 0.65 * press.value }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Take photo"
      accessibilityState={{ busy }}
      onPress={onPress}
      onPressIn={() => press.set(withSpring(1, motion.press))}
      onPressOut={() => press.set(withSpring(0, motion.bouncy))}
      hitSlop={10}
    >
      <Animated.View style={[{ width: 84, height: 84, borderRadius: 42, borderWidth: 6, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }, ring]}>
        <Animated.View style={[{ width: 72, height: 72, borderRadius: 36, backgroundColor: busy ? palette.coral500 : '#fff' }, core]} />
      </Animated.View>
    </Pressable>
  );
}
