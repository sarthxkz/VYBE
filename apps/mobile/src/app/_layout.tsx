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
import { AppUpdateBanner } from '@/features/appUpdate';

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
  // Explicit redirect for any guarded screen. Without it the router falls back to the first unguarded
  // route alphabetically, "(auth)", which has no index screen, so users landed on "Unmatched route".
  const target = signedIn ? (needsProfile ? '/setup-profile' : '/') : introSeen ? '/sign-in' : '/intro';

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        {signedIn && <RealtimeBridge />}
        <OfflineBanner />
        <AppUpdateBanner />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }}>
          <Stack.Protected guard={!signedIn} redirectTo={target}>
            <Stack.Protected guard={!introSeen} redirectTo={target}>
              <Stack.Screen name="intro" options={{ animation: 'fade' }} />
            </Stack.Protected>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={needsProfile} redirectTo={target}>
            <Stack.Screen name="setup-profile" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && !needsProfile} redirectTo={target}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chat/[id]" />
            <Stack.Screen name="user/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="photo/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
            <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="send-photo" />
            <Stack.Screen name="mood" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="invite/[username]" />
            <Stack.Screen name="friends" />
            <Stack.Screen name="settings" />
          </Stack.Protected>
          <Stack.Screen name="legal/[doc]" />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
