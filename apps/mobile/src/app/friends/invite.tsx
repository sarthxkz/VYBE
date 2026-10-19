import { useMemo, useState } from 'react';
import { FlatList, Linking, Share, View } from 'react-native';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/stores/session';
import { inviteMessage, inviteUrl, mailLink, smsLink } from '@/features/invite';
import { Avatar, Button, Card, EmptyState, Input, ListItem, Screen, Text } from '@/ui';
import { space, useColors } from '@/theme';

type Person = { id: string; name: string; phone?: string; email?: string };

export default function InviteScreen() {
  const c = useColors();
  const username = useSession((s) => s.me?.username) ?? '';
  const [people, setPeople] = useState<Person[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [q, setQ] = useState('');

  const share = () =>
    void Share.share({ message: inviteMessage(username), url: inviteUrl(username) }).catch(
      () => {},
    );

  const loadContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') return setDenied(true);
    setDenied(false);
    // Read on this phone only: nothing from your address book is uploaded.
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
      sort: Contacts.SortTypes.FirstName,
    });
    setPeople(
      data
        .map((p) => ({
          id: p.id ?? p.name,
          name: p.name ?? 'Unknown',
          phone: p.phoneNumbers?.[0]?.number,
          email: p.emails?.[0]?.email,
        }))
        .filter((p) => p.phone || p.email),
    );
  };

  const invite = async (p: Person) => {
    const link = p.phone
      ? smsLink(p.phone, username)
      : p.email
        ? mailLink(p.email, username)
        : null;
    if (
      !link ||
      !(await Linking.openURL(link).then(
        () => true,
        () => false,
      ))
    )
      share();
  };

  const shown = useMemo(
    () => (people ?? []).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())),
    [people, q],
  );

  return (
    <Screen edges={['bottom']}>
      <Card style={{ gap: space.sm }}>
        <Text variant="heading">Bring your people</Text>
        <Text muted>Send your invite link. When they join, they can add you as @{username}.</Text>
        <Button
          title="Share invite link"
          icon={<Ionicons name="share-social" size={18} color={c.brandText} />}
          onPress={share}
        />
      </Card>

      {people === null ? (
        <Card style={{ marginTop: space.lg, gap: space.sm }}>
          <Text variant="heading">Invite from contacts</Text>
          <Text muted>
            Pick someone and we’ll open a text with your invite. Your contacts stay on this phone;
            Vybe never uploads them.
          </Text>
          <Button title="Choose from contacts" kind="secondary" onPress={loadContacts} />
          {denied && (
            <Text variant="caption" muted>
              Contacts access is off. You can turn it on in Android settings, or just share your
              link above.
            </Text>
          )}
        </Card>
      ) : (
        <View style={{ flex: 1, marginTop: space.lg }}>
          <Input
            label="Search contacts"
            value={q}
            onChangeText={setQ}
            placeholder="Name"
            autoCorrect={false}
          />
          <FlatList
            data={shown}
            keyExtractor={(p) => p.id}
            ListEmptyComponent={
              <EmptyState
                emoji="📇"
                title="No contacts to show"
                body="Only contacts with a phone number or email appear here."
              />
            }
            renderItem={({ item }) => (
              <ListItem
                title={item.name}
                subtitle={item.phone ?? item.email}
                left={<Avatar name={item.name} size={40} />}
                right={<Button title="Invite" kind="secondary" onPress={() => invite(item)} />}
                onPress={() => invite(item)}
              />
            )}
          />
        </View>
      )}
    </Screen>
  );
}
