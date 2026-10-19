import { useEffect, useState } from 'react';
import { Switch } from 'react-native';
import * as Notifications from 'expo-notifications';
import { nearbyEnabled, setNearbyEnabled, NEARBY_M } from '@/features/location/nearby';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { NotificationPrefs } from '@/api/types';
import { registerPush } from '@/features/notifications';
import { Button, Card, ListItem, Screen, Skeleton, Text } from '@/ui';
import { space } from '@/theme';

const ROWS: { key: keyof NotificationPrefs; title: string; subtitle: string }[] = [
  { key: 'friendRequests', title: 'Friend requests', subtitle: 'New requests and accepted requests' },
  { key: 'photos', title: 'Photos', subtitle: 'When a friend sends you a photo' },
  { key: 'messages', title: 'Messages', subtitle: 'Shows “New message”, never the content' },
  { key: 'security', title: 'Security alerts', subtitle: 'Sign-ins and password changes' },
];

export default function NotificationSettings() {
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: ['notif'], queryFn: () => api<NotificationPrefs>('/me/notifications') });
  const save = useMutation({
    mutationFn: (body: Partial<NotificationPrefs>) => api<NotificationPrefs>('/me/notifications', { method: 'PUT', body }),
    onSuccess: (d) => qc.setQueryData(['notif'], d),
  });
  const [nearby, setNearby] = useState<boolean | null>(null);
  useEffect(() => void nearbyEnabled().then(setNearby), []);
  const toggleNearby = async (on: boolean) => {
    if (on && (await Notifications.getPermissionsAsync()).status !== 'granted') await Notifications.requestPermissionsAsync();
    await setNearbyEnabled(on);
    setNearby(on);
  };
  return (
    <Screen scroll edges={['bottom']}>
      {!prefs.data ? (
        <Skeleton height={240} style={{ marginTop: space.md }} />
      ) : (
        <Card style={{ marginTop: space.md, paddingVertical: 0 }}>
          {ROWS.map((r) => (
            <ListItem
              key={r.key}
              title={r.title}
              subtitle={r.subtitle}
              right={<Switch value={prefs.data[r.key]} onValueChange={(v) => save.mutate({ [r.key]: v })} accessibilityLabel={r.title} />}
            />
          ))}
        </Card>
      )}
      <Card style={{ marginTop: space.md, paddingVertical: 0 }}>
        <ListItem
          title="Friends nearby"
          subtitle={`Buzz when a friend you can see on the map comes within ${NEARBY_M} m. Worked out on this phone; needs your location sharing on.`}
          right={<Switch value={!!nearby} disabled={nearby === null} onValueChange={toggleNearby} accessibilityLabel="Friends nearby alerts" />}
        />
      </Card>
      <Text variant="caption" muted style={{ marginVertical: space.lg }}>
        Encrypted chats always use generic notifications: the server never has your message text, so it can’t put it in a notification.
      </Text>
      <Button title="Turn on phone notifications" kind="secondary" onPress={() => registerPush(true)} />
    </Screen>
  );
}
