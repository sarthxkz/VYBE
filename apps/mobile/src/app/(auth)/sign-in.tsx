import { useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { api, ApiError } from '@/api/client';
import type { AuthTokens } from '@/api/types';
import { errorText } from '@/copy';
import { deviceName, useSession } from '@/stores/session';
import { Button, Input, Screen, Text } from '@/ui';
import { space, useColors } from '@/theme';
import { GoogleButton } from '@/features/auth/GoogleButton';

export default function SignIn() {
  const c = useColors();
  const router = useRouter();
  const signIn = useSession((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(await api<AuthTokens>('/auth/login', { auth: false, body: { email: email.trim(), password, deviceName: deviceName() } }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') {
        router.push({ pathname: '/verify', params: { email: email.trim().toLowerCase() } });
      } else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text variant="title" accessibilityRole="header" style={{ marginTop: space.xxl, marginBottom: space.xl }}>
        Welcome back
      </Text>
      <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
      {error && (
        <Text color={c.danger} style={{ marginBottom: space.md }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      <Button title="Sign in" loading={busy} disabled={!email || !password} onPress={submit} />
      <Link href="/forgot" style={{ color: c.link, textAlign: 'center', marginTop: space.lg, fontSize: 16 }}>
        Forgot password?
      </Link>
      <Text muted style={{ textAlign: 'center', marginVertical: space.lg }}>
        or
      </Text>
      <GoogleButton />
      <Link href="/sign-up" replace style={{ color: c.link, textAlign: 'center', marginTop: space.xl, fontSize: 16 }}>
        New here? Create an account
      </Link>
    </Screen>
  );
}
