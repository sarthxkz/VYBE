import { Switch } from 'react-native';
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
      <Text variant="caption" muted style={{ marginVertical: space.lg }}>
        Encrypted chats always use generic notifications: the server never has your message text, so it can’t put it in a notification.
      </Text>
      <Button title="Turn on phone notifications" kind="secondary" onPress={() => registerPush(true)} />
    </Screen>
  );
}
