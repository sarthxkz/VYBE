import '@/features/location/tracking'; // registers the background task at startup (required for headless runs)
import '@/features/notifications';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useSession } from '@/stores/session';
import { useColors } from '@/theme';
import { queryClient } from '@/lib/query';
import { RealtimeBridge } from '@/features/RealtimeBridge';
import { OfflineBanner } from '@/features/OfflineBanner';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const c = useColors();
  const status = useSession((s) => s.status);
  const me = useSession((s) => s.me);
  const introSeen = useSession((s) => s.introSeen);
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    void useSession.getState().restore();
  }, []);

  const ready = fontsLoaded && status !== 'loading' && introSeen !== null;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  const signedIn = status === 'signedIn';
  const needsProfile = signedIn && !!me && !me.username;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        {signedIn && <RealtimeBridge />}
        <OfflineBanner />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }}>
          <Stack.Protected guard={!signedIn}>
            <Stack.Protected guard={!introSeen}>
              <Stack.Screen name="intro" options={{ animation: 'fade' }} />
            </Stack.Protected>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={needsProfile}>
            <Stack.Screen name="setup-profile" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && !needsProfile}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chat/[id]" />
            <Stack.Screen name="user/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="photo/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
            <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="send-photo" />
            <Stack.Screen name="friends" />
            <Stack.Screen name="settings" />
          </Stack.Protected>
          <Stack.Screen name="legal/[doc]" />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
