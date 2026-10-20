import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/api/client';
import { useSession } from '@/stores/session';
import { AvatarEditor } from '@/features/avatar/AvatarEditor';
import { Button, Screen, type AvatarLook } from '@/ui';
import { space } from '@/theme';

export default function AvatarSettings() {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const [saving, setSaving] = useState(false);

  const save = async (avatarStyle: AvatarLook | null) => {
    setSaving(true);
    try {
      await api('/me', { method: 'PATCH', body: { avatarStyle } });
      await useSession.getState().refreshMe();
      router.back();
    } catch {
      Alert.alert('Couldn’t save your avatar', 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <AvatarEditor
        initial={me?.avatarStyle}
        footer={(look) => (
          <View style={{ gap: space.sm }}>
            <Button title="Save avatar" loading={saving} onPress={() => save(look)} />
            {me?.avatarStyle && <Button title="Use my photo or initials instead" kind="ghost" disabled={saving} onPress={() => save(null)} />}
          </View>
        )}
      />
    </Screen>
  );
}
