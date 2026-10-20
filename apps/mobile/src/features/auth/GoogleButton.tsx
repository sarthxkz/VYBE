import { useState } from 'react';
import { Alert } from 'react-native';
import { api, extraString } from '@/api/client';
import type { AuthTokens } from '@/api/types';
import { errorText } from '@/copy';
import { deviceName, useSession } from '@/stores/session';
import { Button } from '@/ui';

const webClientId = extraString('googleWebClientId');

/** Rendered only when a Google OAuth client is configured for this build. The server verifies the ID token. */
export function GoogleButton() {
  const [busy, setBusy] = useState(false);
  const signIn = useSession((s) => s.signIn);
  if (!webClientId) return null;
  return (
    <Button
      title="Continue with Google"
      kind="secondary"
      loading={busy}
      onPress={async () => {
        setBusy(true);
        try {
          const { GoogleSignin, isSuccessResponse } = await import('@react-native-google-signin/google-signin');
          GoogleSignin.configure({ webClientId });
          await GoogleSignin.hasPlayServices();
          const r = await GoogleSignin.signIn();
          if (!isSuccessResponse(r) || !r.data.idToken) return;
          await signIn(await api<AuthTokens>('/auth/google', { auth: false, body: { idToken: r.data.idToken, deviceName: deviceName() } }));
        } catch (e) {
          Alert.alert('Google sign-in failed', errorText(e));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
