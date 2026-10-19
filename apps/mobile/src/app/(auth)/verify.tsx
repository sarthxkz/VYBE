import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/api/client';
import type { AuthTokens } from '@/api/types';
import { errorText } from '@/copy';
import { deviceName, useSession } from '@/stores/session';
import { Button, Input, Screen, Text } from '@/ui';
import { space, useColors } from '@/theme';

export default function Verify() {
  const c = useColors();
  const { email } = useLocalSearchParams<{ email: string }>();
  const signIn = useSession((s) => s.signIn);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await signIn(await api<AuthTokens>('/auth/verify-email', { auth: false, body: { email, code, deviceName: deviceName() } }));
    } catch (e) {
      setMsg({ text: errorText(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text variant="title" accessibilityRole="header" style={{ marginTop: space.xxl, marginBottom: space.sm }}>
        Check your email
      </Text>
      <Text muted style={{ marginBottom: space.xl }}>
        We sent a 6-digit code to {email}. It expires in 15 minutes.
      </Text>
      <Input
        label="Verification code"
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }}
      />
      {msg && (
        <Text color={msg.error ? c.danger : c.success} style={{ marginBottom: space.md }} accessibilityLiveRegion="polite">
          {msg.text}
        </Text>
      )}
      <Button title="Verify and continue" loading={busy} disabled={code.length !== 6} onPress={submit} />
      <Button
        title="Send a new code"
        kind="ghost"
        style={{ marginTop: space.md }}
        onPress={async () => {
          await api('/auth/resend-verification', { auth: false, body: { email } }).catch(() => {});
          setMsg({ text: 'If that email is waiting for verification, a new code is on its way.', error: false });
        }}
      />
    </Screen>
  );
}
