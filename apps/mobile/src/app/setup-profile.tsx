import { useEffect, useState } from 'react';
import { Modal, Switch, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { errorText } from '@/copy';
import { pickFromLibrary, uploadImage } from '@/lib/images';
import { useSession } from '@/stores/session';
import { Avatar, Button, Card, Input, randomLook, Row, Screen, Text, type AvatarLook } from '@/ui';
import { AvatarEditor } from '@/features/avatar/AvatarEditor';
import { space, useColors } from '@/theme';

const USERNAME = /^[a-z0-9_.]{3,20}$/;

export default function SetupProfile() {
  const c = useColors();
  const me = useSession((s) => s.me);
  const refreshMe = useSession((s) => s.refreshMe);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarId, setAvatarId] = useState<string | null>(me?.avatarMediaId ?? null);
  // Everyone starts with a character; a photo replaces it if they pick one.
  const [look, setLook] = useState<AvatarLook | null>(me?.avatarStyle ?? randomLook());
  const [editing, setEditing] = useState(false);
  const [showPresence, setShowPresence] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = username.trim().toLowerCase();
  const valid = USERNAME.test(name) && !/^\.|\.$|\.\./.test(name);

  // Debounced availability check.
  const [checked, setChecked] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setChecked(name), 400);
    return () => clearTimeout(t);
  }, [name]);
  const availability = useQuery({
    queryKey: ['username', checked],
    enabled: valid && checked === name,
    queryFn: () => api<{ available: boolean }>(`/username-available?username=${encodeURIComponent(checked)}`),
  });
  const available = checked === name ? (availability.data?.available ?? null) : null;

  const pickAvatar = async () => {
    const img = await pickFromLibrary(true);
    if (!img) return;
    setUploading(true);
    try {
      setAvatarId((await uploadImage(img, 'AVATAR')).id);
      setLook(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/me', { method: 'PATCH', body: { username: name, displayName: displayName.trim() || name, bio: bio.trim() || null, avatarMediaId: avatarId, avatarStyle: look, showPresence } });
      await refreshMe(); // username now set → the layout guard moves on to the app
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text variant="title" accessibilityRole="header" style={{ marginTop: space.xxl, marginBottom: space.sm }}>
        Make it yours
      </Text>
      <Text muted style={{ marginBottom: space.xl }}>
        Friends find you by your username.
      </Text>
      <View style={{ alignSelf: 'center', marginBottom: space.xl, alignItems: 'center', gap: space.sm }}>
        <Avatar look={look} mediaId={avatarId} name={displayName || name || '?'} size={132} ring={c.brand} />
        <Button title={look ? 'Create your avatar' : 'Make an avatar instead'} kind="secondary" onPress={() => setEditing(true)} />
        <Button title={uploading ? 'Uploading…' : look ? 'Use a photo instead' : 'Change photo'} kind="ghost" disabled={uploading} onPress={pickAvatar} />
      </View>
      <Modal visible={editing} animationType="slide" onRequestClose={() => setEditing(false)}>
        <Screen>
          <Text variant="title" accessibilityRole="header" style={{ marginTop: space.md }}>
            Your avatar
          </Text>
          <Text muted>This is you on the map. Change it any time.</Text>
          <AvatarEditor
            initial={look}
            footer={(l) => (
              <Button
                title="Done"
                kind="action"
                onPress={() => {
                  setLook(l);
                  setAvatarId(null);
                  setEditing(false);
                }}
              />
            )}
          />
        </Screen>
      </Modal>
      <Input
        label="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        hint="3–20 characters: letters, numbers, _ and ."
        error={username && !valid ? '3–20 characters: letters, numbers, _ and . (no dots at the start or end).' : available === false ? 'That username is taken. Try adding a number.' : null}
      />
      <Input label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} placeholder="What friends call you" />
      <Input label="Bio (optional)" value={bio} onChangeText={setBio} maxLength={160} multiline style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: space.md }} />
      <Card style={{ marginBottom: space.xl }}>
        <Row>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Show when I’m online</Text>
            <Text variant="caption" muted>
              Friends see “online” or your last active time. You can change this later.
            </Text>
          </View>
          <Switch value={showPresence} onValueChange={setShowPresence} accessibilityLabel="Show when I'm online" />
        </Row>
      </Card>
      <Text variant="caption" muted style={{ marginBottom: space.lg }}>
        Location sharing starts off. You can turn it on from the map whenever you like.
      </Text>
      {error && (
        <Text color={c.danger} style={{ marginBottom: space.md }}>
          {error}
        </Text>
      )}
      <Button title="Let’s go" kind="action" loading={busy} disabled={!valid || available === false || uploading} onPress={save} />
    </Screen>
  );
}
