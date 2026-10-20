import { useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { api } from '@/api/client';
import { errorText } from '@/copy';
import { Button, Input, Screen, Text } from '@/ui';
import { space, useColors } from '@/theme';
import { GoogleButton } from '@/features/auth/GoogleButton';

export default function SignUp() {
  const c = useColors();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(false);
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const pwOk = password.length >= 10;

  const submit = async () => {
    setBusy(true);
    setError(null);
    setTaken(false);
    try {
      await api('/auth/register', { auth: false, body: { email: email.trim(), password } });
      router.push({ pathname: '/verify', params: { email: email.trim().toLowerCase() } });
    } catch (e) {
      setTaken((e as { code?: string }).code === 'EMAIL_TAKEN');
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen ambient scroll>
      <Text variant="title" accessibilityRole="header" style={{ marginTop: space.xxl, marginBottom: space.sm }}>
        Join Vybe
      </Text>
      <Text muted style={{ marginBottom: space.xl }}>
        Your location, photos and chats stay between you and your friends.
      </Text>
      <Input label="Email" value={email} onChangeText={(v) => { setEmail(v); setTaken(false); }} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint="At least 10 characters. A short phrase works great."
        error={password && !pwOk ? 'Use at least 10 characters.' : null}
      />
      {error && (
        <Text color={c.danger} style={{ marginBottom: space.md }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      {taken ? (
        <Button title="Sign in instead" kind="action" onPress={() => router.replace({ pathname: '/sign-in', params: { email: email.trim().toLowerCase() } })} />
      ) : (
        <Button title="Create account" kind="action" loading={busy} disabled={!emailOk || !pwOk} onPress={submit} />
      )}
      <Text variant="caption" muted style={{ marginTop: space.md, textAlign: 'center' }}>
        By continuing you agree to the{' '}
        <Link href="/legal/terms" style={{ color: c.link }}>
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/legal/privacy" style={{ color: c.link }}>
          Privacy Policy
        </Link>
        .
      </Text>
      <Text muted style={{ textAlign: 'center', marginVertical: space.lg }}>
        or
      </Text>
      <GoogleButton />
      <Link href="/sign-in" replace style={{ color: c.link, textAlign: 'center', marginTop: space.xl, fontSize: 16 }}>
        Already have an account? Sign in
      </Link>
    </Screen>
  );
}
