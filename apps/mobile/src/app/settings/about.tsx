import { Linking } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Card, IconTile, ListItem, Screen, SectionTitle, Text } from '@/ui';
import { palette, space } from '@/theme';
import { SUPPORT_EMAIL } from '@/features/help/assistant';

export default function About() {
  const router = useRouter();
  return (
    <Screen scroll edges={['bottom']}>
      <Text variant="hero" style={{ marginTop: space.xl }}>
        vybe
      </Text>
      <Text muted>Version {Constants.expoConfig?.version}</Text>
      <Text style={{ marginTop: space.md }}>A private map for you and your friends: share your spot, snap photos, and chat with end-to-end encryption.</Text>
      <SectionTitle>Help</SectionTitle>
      <Card style={{ paddingVertical: 0 }}>
        <ListItem title="Chat with Vybe Assistant" subtitle="Instant answers, any time" left={<IconTile icon="sparkles" color={palette.grape500} />} onPress={() => router.push('/settings/assistant')} />
        <ListItem title="Email support" subtitle={SUPPORT_EMAIL} left={<IconTile icon="mail" color={palette.coral600} />} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Vybe support')}`)} />
        <ListItem title="Help articles" subtitle="Common questions, in one place" left={<IconTile icon="book" color={palette.sky500} />} onPress={() => router.push('/legal/help')} />
      </Card>
      <SectionTitle>Legal</SectionTitle>
      <Card style={{ paddingVertical: 0 }}>
        <ListItem title="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
        <ListItem title="Terms of Service" onPress={() => router.push('/legal/terms')} />
        <ListItem title="Community Guidelines" onPress={() => router.push('/legal/guidelines')} />
        <ListItem title="Open-source licenses" onPress={() => router.push('/legal/licenses')} />
      </Card>
    </Screen>
  );
}
