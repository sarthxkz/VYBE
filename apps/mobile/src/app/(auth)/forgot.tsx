import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { api } from '@/api/client';
import { errorText } from '@/copy';
import { Button, Input, Screen, Text } from '@/ui';
import { space, useColors } from '@/theme';

/** Two steps on one screen: request a code, then set a new password with it. */
export default function Forgot() {
  const c = useColors();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/forgot-password', { auth: false, body: { email: email.trim() } });
      setSent(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/reset-password', { auth: false, body: { email: email.trim(), code, newPassword: password } });
      Alert.alert('Password updated', 'You’ve been signed out everywhere. Sign in with your new password.');
      router.replace('/sign-in');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text variant="title" accessibilityRole="header" style={{ marginTop: space.xxl, marginBottom: space.sm }}>
        Reset your password
      </Text>
      <Text muted style={{ marginBottom: space.xl }}>
        {sent ? `If ${email.trim()} has a Vybe account, we sent a 6-digit code to it.` : 'Enter your email and we’ll send you a code.'}
      </Text>
      <Input label="Email" value={email} onChangeText={setEmail} editable={!sent} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      {sent && (
        <>
          <Input label="Code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" />
          <Input label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" hint="At least 10 characters." />
        </>
      )}
      {error && (
        <Text color={c.danger} style={{ marginBottom: space.md }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      {sent ? (
        <Button title="Set new password" loading={busy} disabled={code.length !== 6 || password.length < 10} onPress={reset} />
      ) : (
        <Button title="Send code" loading={busy} disabled={!email.includes('@')} onPress={request} />
      )}
    </Screen>
  );
}
