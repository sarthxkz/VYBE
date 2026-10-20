import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { RESTORE_SKIPPED, restoreBackup } from '@/features/chat/backup';
import { Button, Input, Screen, Text } from '@/ui';
import { space } from '@/theme';

// Shown once after signing in on a phone with no chats when the account has a backup on the server.
export default function RestoreChats() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      setDone(await restoreBackup(pw));
    } catch (e) {
      setError((e as Error).message === 'WRONG_PASSWORD' ? 'That password doesn’t open this backup. Try again.' : 'Couldn’t restore right now. Check your connection.');
    } finally {
      setBusy(false);
    }
  };
  const skip = async () => {
    await SecureStore.setItemAsync(RESTORE_SKIPPED, '1');
    router.back();
  };

  return (
    <Screen ambient edges={['top', 'bottom']}>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
        <Text variant="hero" accessibilityRole="header">
          {done === null ? 'Restore your chats' : 'Welcome back'}
        </Text>
        {done === null ? (
          <>
            <Text muted>Your account has an encrypted chat backup. Enter your backup password to bring your messages and chat photos back.</Text>
            <Input label="Backup password" value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" error={error} onSubmitEditing={restore} />
            <Text variant="caption" muted>
              Unlocking takes a second: the password is stretched on purpose so it’s hard to guess.
            </Text>
          </>
        ) : (
          <Text muted>
            {done} message{done === 1 ? '' : 's'} restored. New messages from friends need a fresh secure connection; Vybe sets that up automatically.
          </Text>
        )}
      </View>
      <View style={{ gap: space.sm }}>
        {done === null ? (
          <>
            <Button title="Restore chats" loading={busy} disabled={!pw} onPress={restore} />
            <Button title="Skip: start with empty chats" kind="ghost" disabled={busy} onPress={skip} />
          </>
        ) : (
          <Button title="Done" onPress={() => router.back()} />
        )}
      </View>
    </Screen>
  );
}
