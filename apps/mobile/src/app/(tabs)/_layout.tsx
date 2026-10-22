import { useEffect, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { TabBar } from '@/features/TabBar';
import { WhatsNew } from '@/features/WhatsNew';
import { unreadPeople, useChatVersion } from '@/features/chat/db';

export default function TabsLayout() {
  const router = useRouter();
  const v = useChatVersion((s) => s.v);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    void unreadPeople()
      .then(setUnread)
      .catch(() => {});
  }, [v]);
  return (
    <>
      <Tabs
        screenOptions={{ headerShown: false, animation: 'shift' }}
        tabBar={(props) => <TabBar {...props} onCamera={() => router.push('/camera')} />}
      >
        <Tabs.Screen name="index" options={{ title: 'Map' }} />
        <Tabs.Screen name="photos" options={{ title: 'Blink' }} />
        <Tabs.Screen name="snap" options={{ title: 'Camera' }} />
        <Tabs.Screen
          name="chats"
          options={{ title: 'Chats', tabBarBadge: unread > 9 ? '9+' : unread || undefined }}
        />
        <Tabs.Screen name="me" options={{ title: 'You' }} />
      </Tabs>
      <WhatsNew />
    </>
  );
}
