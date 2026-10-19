import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/stores/session';
import { Avatar, Button, Card, ListItem, Screen, SectionTitle, Text } from '@/ui';
import { space, useColors } from '@/theme';

export default function MeScreen() {
  const c = useColors();
  const router = useRouter();
  const me = useSession((s) => s.me);
  const signOut = useSession((s) => s.signOut);
  const chevron = <Ionicons name="chevron-forward" size={18} color={c.textMuted} />;
  const item = (title: string, subtitle: string, href: Parameters<typeof router.push>[0], icon: keyof typeof Ionicons.glyphMap) => (
    <ListItem title={title} subtitle={subtitle} onPress={() => router.push(href)} right={chevron} left={<Ionicons name={icon} size={22} color={c.link} />} />
  );

  return (
    <Screen scroll edges={['top']}>
      <View style={{ alignItems: 'center', gap: space.xs, marginTop: space.xl }}>
        <Avatar mediaId={me?.avatarMediaId} name={me?.displayName ?? me?.username} size={96} ring={c.brand} />
        <Text variant="title">{me?.displayName ?? me?.username}</Text>
        <Text muted>@{me?.username}</Text>
        <Button title="Edit profile" kind="secondary" style={{ marginTop: space.sm }} onPress={() => router.push('/settings/profile')} />
      </View>
      <SectionTitle>Your privacy</SectionTitle>
      <Card style={{ paddingVertical: 0 }}>
        {item('Privacy dashboard', 'Everything you share, in one place', '/settings', 'shield-checkmark')}
        {item('Location sharing', 'Who sees you, Ghost Mode, timers', '/settings/location', 'navigate')}
        {item('Friends', 'Requests, friends, search', '/friends', 'people')}
        {item('Blocked people', 'People who can’t reach you', '/settings/blocked', 'hand-left')}
      </Card>
      <SectionTitle>Account</SectionTitle>
      <Card style={{ paddingVertical: 0 }}>
        {item('Notifications', 'Choose what pings you', '/settings/notifications', 'notifications')}
        {item('Account security', 'Password and signed-in devices', '/settings/security', 'key')}
        {item('About & help', 'Support, legal, licenses', '/settings/about', 'information-circle')}
      </Card>
      <Button title="Sign out" kind="ghost" style={{ marginTop: space.xl }} onPress={() => signOut()} />
    </Screen>
  );
}
