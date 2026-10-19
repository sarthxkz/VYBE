import { Alert, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { LocationSettings, NotificationPrefs, Session } from '@/api/types';
import { useFriends } from '@/features/friends/hooks';
import { Button, Card, ListItem, Screen, SectionTitle, Text } from '@/ui';
import { space } from '@/theme';

/** One page that answers "who can see what about me?" with links to change each answer. */
export default function PrivacyDashboard() {
  const router = useRouter();
  const loc = useQuery({ queryKey: ['locations', 'settings'], queryFn: () => api<LocationSettings>('/locations/settings') });
  const friends = useFriends();
  const blocks = useQuery({ queryKey: ['blocks'], queryFn: () => api<{ blocked: unknown[] }>('/blocks') });
  const notif = useQuery({ queryKey: ['notif'], queryFn: () => api<NotificationPrefs>('/me/notifications') });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<{ sessions: Session[] }>('/auth/sessions') });

  const l = loc.data;
  const who = !l ? '…' : l.ghost ? 'Nobody (Ghost Mode)' : !l.active ? 'Nobody (sharing is off)' : l.mode === 'ALL' ? `All ${friends.data?.friends.length ?? ''} friends` : `${l.grants.length} chosen friends`;

  const exportData = async () => {
    try {
      const data = await api<unknown>('/me/export');
      await Share.share({ title: 'My Vybe data', message: JSON.stringify(data, null, 2) });
    } catch {
      Alert.alert('Export failed', 'Check your connection and try again.');
    }
  };

  return (
    <Screen scroll edges={['bottom']}>
      <SectionTitle>Location</SectionTitle>
      <Card style={{ paddingVertical: 0 }}>
        <ListItem title="Who can see my location" subtitle={who} onPress={() => router.push('/settings/location')} />
        <ListItem title="What we keep" subtitle="Only your latest spot, deleted after 24 h or when you stop sharing. No location history." />
      </Card>
      <SectionTitle>Photos</SectionTitle>
      <Card style={{ paddingVertical: 0 }}>
        <ListItem title="Who can see my photos" subtitle="Only the friends you pick for each photo. Photos are never public." />
        <ListItem title="Photo location data" subtitle="Removed on your phone before upload, and again on our server." />
      </Card>
      <SectionTitle>Chats</SectionTitle>
      <Card style={{ paddingVertical: 0 }}>
        <ListItem title="End-to-end encrypted" subtitle="Vybe can’t read your messages or chat photos. History lives only on your phone." />
        <ListItem title="What Vybe can see" subtitle="Who messaged whom and when, until the message is delivered. Never the content." />
      </Card>
      <SectionTitle>People & notifications</SectionTitle>
      <Card style={{ paddingVertical: 0 }}>
        <ListItem title="Blocked people" subtitle={`${blocks.data?.blocked.length ?? '…'} blocked`} onPress={() => router.push('/settings/blocked')} />
        <ListItem
          title="Notifications"
          subtitle={notif.data ? 'Previews never show message content' : '…'}
          onPress={() => router.push('/settings/notifications')}
        />
        <ListItem title="Signed-in devices" subtitle={`${sessions.data?.sessions.length ?? '…'} active`} onPress={() => router.push('/settings/security')} />
      </Card>
      <SectionTitle>Your data</SectionTitle>
      <Card>
        <Text variant="caption" muted style={{ marginBottom: space.md }}>
          Download a copy of what our server stores about you, or delete your account and data.
        </Text>
        <Button title="Export my data" kind="secondary" onPress={exportData} />
        <Button title="Delete my account" kind="ghost" style={{ marginTop: space.sm }} onPress={() => router.push('/settings/delete-account')} />
      </Card>
    </Screen>
  );
}
