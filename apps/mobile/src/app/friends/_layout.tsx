import { Stack } from 'expo-router';
import { font, useColors } from '@/theme';

export default function FriendsLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Friends' }} />
      <Stack.Screen name="add" options={{ title: 'Add friends' }} />
    </Stack>
  );
}
