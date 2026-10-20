import { Linking } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Card, ListItem, Screen, SectionTitle, Text } from '@/ui';
import { space } from '@/theme';
import { extraString } from '@/api/client';

// Set EXPO_PUBLIC_SUPPORT_EMAIL per build; hidden until a real inbox exists.
const support = extraString('supportEmail');

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
        <ListItem title="Help & support" subtitle="Common questions and how to reach us" onPress={() => router.push('/legal/help')} />
        {support ? <ListItem title="Contact support" subtitle={support} onPress={() => Linking.openURL(`mailto:${support}`)} /> : null}
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
