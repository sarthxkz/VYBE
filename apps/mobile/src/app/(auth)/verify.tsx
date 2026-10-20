import { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/api/client';
import type { AuthTokens } from '@/api/types';
import { errorText } from '@/copy';
import { deviceName, useSession } from '@/stores/session';
import { Button, Input, Screen, Text } from '@/ui';
import { space, useColors } from '@/theme';

// Shown so people know which sender to look for in Spam/Promotions (codes come from a Gmail account for now).
const SENDER = 'supportadmin.vybe@gmail.com';

export default function Verify() {
  const c = useColors();
  const { email } = useLocalSearchParams<{ email: string }>();
  const signIn = useSession((s) => s.signIn);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
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
    <Screen ambient scroll>
      <Text variant="title" accessibilityRole="header" style={{ marginTop: space.xxl, marginBottom: space.sm }}>
        Check your email
      </Text>
      <Text muted style={{ marginBottom: space.xl }}>
        We sent a 6-digit code to {email}. It expires in 15 minutes.
        {'\n\n'}Not there? Check Spam, Promotions and Updates: it comes from {SENDER}.
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
        title={wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
        kind="ghost"
        disabled={wait > 0}
        style={{ marginTop: space.md }}
        onPress={async () => {
          setWait(60); // the server rate-limits codes too; this keeps people from tripping it
          await api('/auth/resend-verification', { auth: false, body: { email } }).catch(() => {});
          setMsg({ text: 'A new code is on its way. Check Spam and Promotions too.', error: false });
        }}
      />
    </Screen>
  );
}
