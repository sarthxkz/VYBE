import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { permission } from '@/copy';
import { pickFromLibrary, prepareImage, type Prepared } from '@/lib/images';
import { Button, EmptyState, Screen, Text } from '@/ui';
import { palette, space } from '@/theme';

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
        <Image source={{ uri: shot.uri }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel="Photo preview" />
        <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: space.md, padding: space.xl }}>
          <Button title="Retake" kind="secondary" style={{ flex: 1 }} onPress={() => setShot(null)} />
          <Button title="Send to…" kind="action" style={{ flex: 1 }} onPress={() => send(shot)} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {focused && active && <CameraView ref={cam} style={StyleSheet.absoluteFill} facing={facing} flash={flash} animateShutter />}
      <SafeAreaView edges={['top']} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space.lg }}>
        <Round icon="close" label="Close camera" onPress={() => router.back()} />
        <Round icon={flash === 'on' ? 'flash' : flash === 'auto' ? 'flash-outline' : 'flash-off'} label={`Flash ${flash}`} onPress={() => setFlash(flash === 'off' ? 'on' : flash === 'on' ? 'auto' : 'off')} />
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: space.xl }}>
        <Round icon="images" label="Pick from gallery" onPress={async () => { const img = await pickFromLibrary(); if (img) send(img); }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          onPress={take}
          style={({ pressed }) => ({ width: 82, height: 82, borderRadius: 41, borderWidth: 6, borderColor: '#fff', backgroundColor: pressed || busy ? palette.coral500 : 'rgba(255,255,255,0.25)' })}
        />
        <Round icon="camera-reverse" label="Switch camera" onPress={() => setFacing(facing === 'back' ? 'front' : 'back')} />
      </SafeAreaView>
      {busy && <Text color="#fff" style={{ position: 'absolute', alignSelf: 'center', top: '50%' }}>Processing…</Text>}
    </View>
  );
}

function Round({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={24} color="#fff" />
    </Pressable>
  );
}
