import { Pressable, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { font, palette, shadow, useColors } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName, active: IconName) =>
  function TabIcon({ color, focused }: { color: unknown; focused: boolean }) {
    return <Ionicons name={focused ? active : name} size={24} color={color as string} />;
  };

export default function TabsLayout() {
  const c = useColors();
  const router = useRouter();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.link,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: font.bodyMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Map', tabBarIcon: icon('map-outline', 'map') }} />
      <Tabs.Screen name="photos" options={{ title: 'Blink', tabBarIcon: icon('flash-outline', 'flash') }} />
      <Tabs.Screen
        name="snap"
        options={{
          title: '',
          tabBarAccessibilityLabel: 'Open camera',
          tabBarButton: () => (
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open camera"
                onPress={() => router.push('/camera')}
                style={({ pressed }) => [
                  { top: -18, width: 62, height: 62, borderRadius: 31, backgroundColor: palette.coral500, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: c.surface },
                  shadow.float,
                  pressed && { transform: [{ scale: 0.95 }] },
                ]}
              >
                <Ionicons name="camera" size={28} color={palette.ink} />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: icon('chatbubbles-outline', 'chatbubbles') }} />
      <Tabs.Screen name="me" options={{ title: 'You', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
