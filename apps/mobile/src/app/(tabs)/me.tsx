import { Alert, View } from 'react-native';
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
        <Avatar mediaId={me?.avatarMediaId} look={me?.avatarStyle} name={me?.displayName ?? me?.username} size={96} ring={c.brand} />
        <Text variant="title">{me?.displayName ?? me?.username}</Text>
        <Text muted>@{me?.username}</Text>
        {me?.mood && (
          <Text muted>
            {me.mood.emoji} {me.mood.text ?? ''}
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
          <Button title="Edit avatar" kind="secondary" onPress={() => router.push('/settings/avatar')} />
          <Button title={me?.mood ? 'Change vibe' : 'Set vibe'} kind="secondary" onPress={() => router.push('/mood')} />
        </View>
        <Button title="Edit profile" kind="ghost" onPress={() => router.push('/settings/profile')} />
      </View>
      <SectionTitle>Your privacy</SectionTitle>
      <Card style={{ paddingVertical: 0 }}>
        {item('Privacy dashboard', 'Everything you share, in one place', '/settings', 'shield-checkmark')}
        {item('Location sharing', 'Who sees you, Ghost Mode, timers', '/settings/location', 'navigate')}
        {item('Friends', 'Requests, friends, search', '/friends', 'people')}
        {item('Invite friends', 'From your contacts or any app', '/friends/invite', 'paper-plane')}
        {item('Blocked people', 'People who can’t reach you', '/settings/blocked', 'hand-left')}
      </Card>
      <SectionTitle>Account</SectionTitle>
      <Card style={{ paddingVertical: 0 }}>
        {item('Chat backup', 'Keep your chats when you change phones', '/settings/backup', 'cloud-upload')}
        {item('Notifications', 'Choose what pings you', '/settings/notifications', 'notifications')}
        {item('Account security', 'Password and signed-in devices', '/settings/security', 'key')}
        {item('About & help', 'Support, legal, licenses', '/settings/about', 'information-circle')}
      </Card>
      <Button
        title="Sign out"
        kind="ghost"
        style={{ marginTop: space.xl }}
        onPress={() =>
          Alert.alert('Sign out of Vybe?', 'Signing out removes your chats from this phone. If chat backup is on, you can restore them when you sign back in.', [
            { text: 'Stay signed in', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
          ])
        }
      />
    </Screen>
  );
}
