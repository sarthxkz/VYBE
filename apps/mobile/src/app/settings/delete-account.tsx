import { useState } from 'react';
import { Alert } from 'react-native';
import { api } from '@/api/client';
import { errorText } from '@/copy';
import { useSession } from '@/stores/session';
import { Button, Card, Input, Screen, Text } from '@/ui';
import { space, useColors } from '@/theme';

export default function DeleteAccount() {
  const c = useColors();
  const me = useSession((s) => s.me);
  const signOut = useSession((s) => s.signOut);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const reauthGoogle = async () => {
    const { GoogleSignin, isSuccessResponse } = await import('@react-native-google-signin/google-signin');
    const r = await GoogleSignin.signIn();
    return isSuccessResponse(r) ? r.data.idToken : null;
  };

  const run = () =>
    Alert.alert('Delete your account forever?', 'This can’t be undone.', [
      { text: 'Keep my account', style: 'cancel' },
      {
        text: 'Delete account',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const body = me?.hasPassword ? { password } : { googleIdToken: (await reauthGoogle()) ?? undefined };
            await api('/me', { method: 'DELETE', body });
            await signOut({ remote: false });
            Alert.alert('Account deleted', 'Your account and data were deleted. Thanks for being part of Vybe.');
          } catch (e) {
            Alert.alert('Account not deleted', errorText(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <Screen scroll edges={['bottom']}>
      <Card style={{ marginTop: space.md }}>
        <Text variant="heading" style={{ marginBottom: space.sm }}>
          What gets deleted
        </Text>
        <Text muted>
          {'• Your profile, username and photo\n• Your friendships, requests and blocks\n• Your location and sharing settings\n• Photos you sent (friends lose access too)\n• Your encryption keys, undelivered messages and devices\n• Chat history on this phone'}
        </Text>
        <Text variant="caption" muted style={{ marginTop: space.md }}>
          Deletion is immediate in our live database. Encrypted backups roll off within 14 days. Copies friends already saved on their own phones can’t be recalled. Reports you filed are kept without your name.
        </Text>
      </Card>
      {me?.hasPassword && (
        <Input label="Confirm with your password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" style={{ marginTop: space.lg }} />
      )}
      <Button title="Delete my account" kind="danger" loading={busy} disabled={me?.hasPassword ? !password : false} onPress={run} style={{ marginTop: space.lg }} />
      <Text variant="caption" color={c.textMuted} style={{ marginTop: space.md, textAlign: 'center' }}>
        Just need a break? Turn on Ghost Mode instead.
      </Text>
    </Screen>
  );
}
