import { useState } from 'react';
import { Alert } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Session } from '@/api/types';
import { errorText } from '@/copy';
import { ago } from '@/features/location/tracking';
import { useSession } from '@/stores/session';
import { Button, Card, Input, ListItem, Screen, SectionTitle, Text } from '@/ui';
import { space, useColors } from '@/theme';

export default function Security() {
  const c = useColors();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<{ sessions: Session[] }>('/auth/sessions') });
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  const change = async () => {
    setBusy(true);
    try {
      await api('/auth/change-password', { body: { currentPassword: current, newPassword: next } });
      setCurrent('');
      setNext('');
      Alert.alert('Password changed', 'Other devices were signed out.');
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    } catch (e) {
      Alert.alert('Password not changed', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll edges={['bottom']}>
      <SectionTitle>Signed-in devices</SectionTitle>
      <Card style={{ paddingVertical: 0 }}>
        {(sessions.data?.sessions ?? []).map((s) => (
          <ListItem
            key={s.id}
            title={s.deviceName ?? 'Unknown device'}
            subtitle={s.current ? 'This device' : `Last active ${ago(s.lastUsedAt)}`}
            right={
              !s.current && (
                <Button
                  title="Sign out"
                  kind="ghost"
                  style={{ minHeight: 40 }}
                  onPress={() => api(`/auth/sessions/${s.id}`, { method: 'DELETE' }).then(() => qc.invalidateQueries({ queryKey: ['sessions'] }))}
                />
              )
            }
          />
        ))}
      </Card>
      <SectionTitle>Password</SectionTitle>
      {me?.hasPassword ? (
        <Card>
          <Input label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
          <Input label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" hint="At least 10 characters." />
          <Button title="Change password" loading={busy} disabled={!current || next.length < 10} onPress={change} />
        </Card>
      ) : (
        <Text muted>You sign in with Google. To add a password, use “Forgot password” on the sign-in screen with your email.</Text>
      )}
      <Text variant="caption" color={c.textMuted} style={{ marginTop: space.lg }}>
        Your encryption keys stay on this phone. If you sign out or reinstall, friends will see that your safety number changed, and old messages stay only on the old device.
      </Text>
    </Screen>
  );
}
