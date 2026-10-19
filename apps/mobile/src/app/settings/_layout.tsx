import { Stack } from 'expo-router';
import { font, useColors } from '@/theme';

export default function SettingsLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerTintColor: c.text,
        headerTitleStyle: { fontFamily: font.display },
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Privacy & settings' }} />
      <Stack.Screen name="location" options={{ title: 'Location sharing' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="blocked" options={{ title: 'Blocked people' }} />
      <Stack.Screen name="security" options={{ title: 'Account security' }} />
      <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
      <Stack.Screen name="profile" options={{ title: 'Edit profile' }} />
      <Stack.Screen name="avatar" options={{ title: 'Your avatar' }} />
      <Stack.Screen name="backup" options={{ title: 'Chat backup' }} />
      <Stack.Screen name="about" options={{ title: 'About Vybe' }} />
    </Stack>
  );
}
