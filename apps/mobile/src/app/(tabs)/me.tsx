import { Alert, Linking, StyleSheet, View } from 'react-native';
import { API_URL } from '@/api/client';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSession } from '@/stores/session';
import { useFriends } from '@/features/friends/hooks';
import { Appear, Avatar, Card, Glow, Gradient, IconTile, ListItem, PressScale, Row, Screen, SectionTitle, Text } from '@/ui';
import { gradient, motion, palette, radius, shadow, space, useColors } from '@/theme';

type Href = Parameters<ReturnType<typeof useRouter>['push']>[0];

export default function MeScreen() {
  const c = useColors();
  const router = useRouter();
  const me = useSession((s) => s.me);
  const signOut = useSession((s) => s.signOut);
  const friends = useFriends();
  const item = (title: string, subtitle: string, href: Href, icon: keyof typeof Ionicons.glyphMap, tint: string) => (
    <ListItem title={title} subtitle={subtitle} onPress={() => router.push(href)} left={<IconTile icon={icon} color={tint} />} />
  );
  const name = me?.displayName ?? me?.username;

  return (
    <Screen scroll edges={['top']}>
      <Appear style={{ marginTop: space.lg }}>
        <View style={[{ borderRadius: radius.xl, overflow: 'hidden', padding: space.xl, alignItems: 'center', gap: space.xs }, shadow.glow]}>
          <Gradient colors={gradient.aurora} />
          <Glow color={palette.coral500} size={260} opacity={0.55} style={{ left: -90, top: -110 }} />
          <Glow color={palette.lime400} size={220} opacity={0.35} style={{ right: -80, bottom: -100 }} />
          <Animated.View entering={ZoomIn.delay(120).springify().damping(motion.bouncy.damping)}>
            <View style={{ padding: 4, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.25)' }}>
              <Avatar mediaId={me?.avatarMediaId} look={me?.avatarStyle} name={name} size={104} ring="#fff" />
            </View>
          </Animated.View>
          <Text variant="title" color="#fff" style={{ marginTop: space.sm }}>
            {name}
          </Text>
          <Text color="rgba(255,255,255,0.85)">@{me?.username}</Text>
          <Row gap={space.sm} style={{ marginTop: space.md }}>
            <Chip label={me?.mood ? `${me.mood.emoji} ${me.mood.text ?? 'vibing'}` : '＋ Set vibe'} onPress={() => router.push('/mood')} />
            <Chip label={`${friends.data?.friends.length ?? '–'} friends`} onPress={() => router.push('/friends')} />
          </Row>
        </View>
      </Appear>
      <Appear index={1}>
        <Row style={{ marginTop: space.md }} gap={space.sm}>
          <QuickAction icon="happy" label="Avatar" onPress={() => router.push('/settings/avatar')} />
          <QuickAction icon="create" label="Profile" onPress={() => router.push('/settings/profile')} />
          <QuickAction icon="paper-plane" label="Invite" onPress={() => router.push('/friends/invite')} />
        </Row>
      </Appear>
      <Appear index={2}>
        <SectionTitle>Your privacy</SectionTitle>
        <Card style={{ paddingVertical: 0 }}>
          {item('Privacy dashboard', 'Everything you share, in one place', '/settings', 'shield-checkmark', palette.green600)}
          {item('Location sharing', 'Who sees you, Ghost Mode, timers', '/settings/location', 'navigate', palette.sky500)}
          {item('Friends', 'Requests, friends, search', '/friends', 'people', palette.grape500)}
          {item('Blocked people', 'People who can’t reach you', '/settings/blocked', 'hand-left', palette.gray600)}
        </Card>
      </Appear>
      <Appear index={3}>
        <SectionTitle>Account</SectionTitle>
        <Card style={{ paddingVertical: 0 }}>
          {item('Chat backup', 'Keep your chats when you change phones', '/settings/backup', 'cloud-upload', palette.grape600)}
          {item('Notifications', 'Choose what pings you', '/settings/notifications', 'notifications', palette.coral600)}
          {item('Account security', 'Password and signed-in devices', '/settings/security', 'key', palette.amber700)}
          {item('About & help', 'Support, legal, licenses', '/settings/about', 'information-circle', palette.gray600)}
        </Card>
      </Appear>
      {me?.role === 'ADMIN' && (
        <Appear index={4}>
          <PressScale
            accessibilityRole="link"
            accessibilityLabel="Open the admin dashboard in your browser"
            onPress={() => void Linking.openURL(`${API_URL}/admin/`)}
            scaleTo={0.94}
            style={{ marginTop: space.lg, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: c.surfaceAlt }}
          >
            <Ionicons name="speedometer-outline" size={16} color={c.link} />
            <Text variant="label" color={c.link}>
              Admin dashboard
            </Text>
            <Ionicons name="open-outline" size={13} color={c.textMuted} />
          </PressScale>
        </Appear>
      )}
      <Appear index={5}>
        <PressScale accessibilityRole="button" onPress={() =>
            Alert.alert('Sign out of Vybe?', 'Signing out removes your chats from this phone. If chat backup is on, you can restore them when you sign back in.', [
              { text: 'Stay signed in', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
            ])
          } style={{ marginTop: space.xl, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md }}>
          <Ionicons name="log-out-outline" size={20} color={c.danger} />
          <Text variant="bodyStrong" color={c.danger}>
            Sign out
          </Text>
        </PressScale>
      </Appear>
    </Screen>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressScale accessibilityRole="button" onPress={onPress} scaleTo={0.94} style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.4)' }}>
      <Text variant="label" color="#fff" numberOfLines={1}>
        {label}
      </Text>
    </PressScale>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={`Edit ${label.toLowerCase()}`}
      onPress={onPress}
      scaleTo={0.94}
      style={[{ flex: 1, alignItems: 'center', gap: space.xs, paddingVertical: space.md, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }, shadow.card]}
    >
      <Ionicons name={icon} size={22} color={c.link} />
      <Text variant="label">{label}</Text>
    </PressScale>
  );
}
