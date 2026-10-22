import { Tabs, useRouter } from 'expo-router';
import { TabBar } from '@/features/TabBar';

export default function TabsLayout() {
  const router = useRouter();
  return (
    <Tabs
      screenOptions={{ headerShown: false, animation: 'shift' }}
      tabBar={(props) => <TabBar {...props} onCamera={() => router.push('/camera')} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Map' }} />
      <Tabs.Screen name="photos" options={{ title: 'Photos' }} />
      <Tabs.Screen name="snap" options={{ title: 'Camera' }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats' }} />
      <Tabs.Screen name="me" options={{ title: 'You' }} />
    </Tabs>
  );
}
