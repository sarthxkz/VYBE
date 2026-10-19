import { useState } from 'react';
import { Alert } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { backupEnabledHere, backupInfo, backupNow, disableBackup, enableBackup, MIN_PASSWORD } from '@/features/chat/backup';
import { ago } from '@/features/location/tracking';
import { Button, Card, Input, ListItem, Screen, SectionTitle, Skeleton, Text } from '@/ui';
import { space, useColors } from '@/theme';

export default function BackupSettings() {
  const c = useColors();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['backup'], queryFn: async () => ({ server: await backupInfo(), here: await backupEnabledHere() }) });
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['backup'] });
    } catch {
      Alert.alert('That didn’t work', 'Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run('save', async () => {
      await enableBackup(pw);
      setPw('');
      setPw2('');
      setEditing(false);
    });

  if (!status.data) return <Screen><Skeleton height={200} style={{ marginTop: space.md }} /></Screen>;
  const { server, here } = status.data;
  const on = here && server.exists;
  const pwError = pw.length > 0 && pw.length < MIN_PASSWORD ? `At least ${MIN_PASSWORD} characters` : pw2.length > 0 && pw2 !== pw ? 'Passwords don’t match' : null;

  return (
    <Screen scroll edges={['bottom']}>
      <Text style={{ marginTop: space.md }}>
        Your chats are end-to-end encrypted, so they live on your phone. Turn on backup to keep them when you change phones or log in again.
      </Text>
      <Text variant="caption" muted style={{ marginTop: space.sm }}>
        The backup is locked with a password only you know. Vybe can’t read it and can’t reset the password: if you forget it, the backup can’t be opened.
      </Text>

      {on && server.exists && (
        <Card style={{ marginTop: space.lg, paddingVertical: 0 }}>
          <ListItem title="Last backup" subtitle={`${ago(server.updatedAt)} · ${(server.size / 1024).toFixed(0)} KB`} />
        </Card>
      )}
      {!here && server.exists && (
        <Text variant="caption" color={c.stale} style={{ marginTop: space.md }}>
          There’s a backup from another phone. Restore it from the prompt after signing in, or set a new password here to replace it.
        </Text>
      )}

      {!on || editing ? (
        <>
          <SectionTitle>{on ? 'New backup password' : 'Turn on chat backup'}</SectionTitle>
          <Input label="Backup password" value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" hint={`At least ${MIN_PASSWORD} characters. A sentence is easy to remember and hard to guess.`} />
          <Input label="Type it again" value={pw2} onChangeText={setPw2} secureTextEntry autoCapitalize="none" error={pwError} />
          <Button title={on ? 'Change password' : 'Turn on and back up now'} loading={busy === 'save'} disabled={pw.length < MIN_PASSWORD || pw !== pw2} onPress={save} />
          {editing && <Button title="Cancel" kind="ghost" onPress={() => setEditing(false)} />}
        </>
      ) : (
        <>
          <Button title="Back up now" style={{ marginTop: space.lg }} loading={busy === 'now'} onPress={() => run('now', backupNow)} />
          <Button title="Change backup password" kind="secondary" style={{ marginTop: space.sm }} onPress={() => setEditing(true)} />
          <Button
            title="Turn off and delete backup"
            kind="danger"
            style={{ marginTop: space.sm }}
            loading={busy === 'off'}
            onPress={() =>
              Alert.alert('Delete your chat backup?', 'Chats stay on this phone, but a new phone won’t be able to restore them.', [
                { text: 'Keep backup', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => run('off', disableBackup) },
              ])
            }
          />
        </>
      )}
    </Screen>
  );
}
