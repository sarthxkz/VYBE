import { useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import { api } from '@/api/client';
import { errorText } from '@/copy';
import { pickFromLibrary, uploadImage } from '@/lib/images';
import { useSession } from '@/stores/session';
import { Avatar, Button, Card, Input, Row, Screen, Text } from '@/ui';
import { space, useColors } from '@/theme';

export default function EditProfile() {
  const c = useColors();
  const me = useSession((s) => s.me);
  const refreshMe = useSession((s) => s.refreshMe);
  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [username, setUsername] = useState(me?.username ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');
  const [avatarId, setAvatarId] = useState(me?.avatarMediaId ?? null);
  const [showPresence, setShowPresence] = useState(me?.showPresence ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api('/me', { method: 'PATCH', body: { displayName: displayName.trim(), username: username.trim().toLowerCase(), bio: bio.trim() || null, avatarMediaId: avatarId, showPresence } });
      await refreshMe();
      Alert.alert('Saved', 'Your profile is updated.');
    } catch (e) {
      Alert.alert('Not saved', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll edges={['bottom']}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change profile photo"
        style={{ alignSelf: 'center', alignItems: 'center', gap: space.sm, marginVertical: space.xl }}
        onPress={async () => {
          const img = await pickFromLibrary(true);
          if (img) setAvatarId((await uploadImage(img, 'AVATAR').catch((e) => (Alert.alert('Upload failed', errorText(e)), { id: avatarId }))).id);
        }}
      >
        <Avatar mediaId={avatarId} name={displayName || username} size={96} ring={c.brand} />
        <Text variant="label" color={c.link}>
          Change photo
        </Text>
      </Pressable>
      <Input label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} />
      <Input label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
      <Input label="Bio" value={bio} onChangeText={setBio} maxLength={160} multiline />
      <Card style={{ marginBottom: space.lg }}>
        <Row>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Show when I’m online</Text>
            <Text variant="caption" muted>
              Off means friends see neither “online” nor your last active time.
            </Text>
          </View>
          <Switch value={showPresence} onValueChange={setShowPresence} accessibilityLabel="Show when I'm online" />
        </Row>
      </Card>
      <Button title="Save" loading={busy} onPress={save} />
    </Screen>
  );
}
