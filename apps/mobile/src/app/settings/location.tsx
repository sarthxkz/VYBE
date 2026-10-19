import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Switch, View } from 'react-native';
import * as Location from 'expo-location';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Friend, LocationSettings, SharingMode } from '@/api/types';
import { errorText, ghost, permission } from '@/copy';
import { permissionLevel, startTracking, stopTracking, TARGET_INTERVAL_MS, type PermissionLevel } from '@/features/location/tracking';
import { Avatar, Button, Card, ListItem, Row, Screen, SectionTitle, Skeleton, Text } from '@/ui';
import { radius, space, useColors } from '@/theme';

const DURATIONS = [
  { label: '1 hour', ms: 3600_000 },
  { label: '8 hours', ms: 8 * 3600_000 },
  { label: 'Until I turn it off', ms: 0 },
];

export default function LocationSettingsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const [perm, setPerm] = useState<PermissionLevel>('none');
  const settings = useQuery({ queryKey: ['locations', 'settings'], queryFn: () => api<LocationSettings>('/locations/settings') });
  const friends = useQuery({ queryKey: ['friends'], queryFn: () => api<{ friends: Friend[] }>('/friends') });

  useEffect(() => {
    void permissionLevel().then(setPerm);
  }, []);

  const save = useMutation({
    mutationFn: (body: Partial<{ mode: SharingMode; ghost: boolean; expiresAt: string | null; grants: string[] }>) =>
      api<LocationSettings>('/locations/settings', { method: 'PUT', body }),
    onSuccess: async (s) => {
      qc.setQueryData(['locations', 'settings'], s);
      void qc.invalidateQueries({ queryKey: ['locations'] });
      if (s.active) setPerm(await ensurePermissionThenTrack());
      else await stopTracking();
    },
    onError: (e) => Alert.alert('Couldn’t update sharing', errorText(e)),
  });

  /** Foreground first; background asked separately with its own explanation. */
  async function ensurePermissionThenTrack(): Promise<PermissionLevel> {
    let level = await permissionLevel();
    if (level === 'none') {
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert(permission.locationTitle, permission.locationBody, [
          { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
          { text: permission.locationCta, onPress: () => resolve(true) },
        ]),
      );
      if (!ok || !(await Location.requestForegroundPermissionsAsync()).granted) return 'none';
      level = 'foreground';
    }
    if (level === 'foreground') {
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert(permission.backgroundTitle, permission.backgroundBody, [
          { text: permission.backgroundSkip, style: 'cancel', onPress: () => resolve(false) },
          { text: permission.backgroundCta, onPress: () => resolve(true) },
        ]),
      );
      if (ok) await Location.requestBackgroundPermissionsAsync(); // opens system settings on Android 11+
    }
    if (!(await Location.hasServicesEnabledAsync())) Alert.alert('Location services are off', permission.servicesOff);
    return startTracking();
  }

  const s = settings.data;
  if (!s) return <Screen edges={['bottom']}>{settings.isError ? <Text>{errorText(settings.error)}</Text> : <Skeleton height={200} />}</Screen>;

  // Duration the user picked = expiry minus when the settings were saved (pure; no clock read during render).
  const expiresIn = s.expiresAt ? Date.parse(s.expiresAt) - Date.parse(s.updatedAt) : null;
  const modeOption = (mode: SharingMode, title: string, subtitle: string) => (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: s.mode === mode }}
      onPress={() => save.mutate({ mode, ...(mode === 'OFF' && { expiresAt: null }) })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
        {s.mode === mode && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.brand }} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" muted>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <Screen scroll edges={['bottom']}>
      <Card style={{ marginTop: space.md, backgroundColor: s.ghost ? c.surfaceAlt : c.surface }}>
        <Row>
          <Text style={{ fontSize: 32 }} importantForAccessibility="no">
            👻
          </Text>
          <View style={{ flex: 1 }}>
            <Text variant="heading">{ghost.title}</Text>
            <Text variant="caption" muted>
              {s.ghost ? ghost.on : 'Disappear from every map instantly. Your settings stay as they are.'}
            </Text>
          </View>
          <Switch value={s.ghost} onValueChange={(v) => save.mutate({ ghost: v })} accessibilityLabel="Ghost Mode" disabled={save.isPending} />
        </Row>
      </Card>

      <SectionTitle>Who can see my location</SectionTitle>
      <Card>
        {modeOption('OFF', 'Nobody', 'Location sharing is off.')}
        {modeOption('ALL', 'All my friends', 'Every accepted friend can see your spot.')}
        {modeOption('SELECTED', 'Only friends I choose', 'Pick exactly who sees you.')}
      </Card>

      {s.mode === 'SELECTED' && (
        <>
          <SectionTitle>Friends who can see me</SectionTitle>
          <Card>
            {(friends.data?.friends ?? []).map((f) => {
              const on = s.grants.includes(f.id);
              return (
                <ListItem
                  key={f.id}
                  title={f.displayName ?? f.username ?? ''}
                  subtitle={`@${f.username}`}
                  left={<Avatar mediaId={f.avatarMediaId} name={f.displayName ?? f.username} size={36} />}
                  right={
                    <Switch
                      value={on}
                      accessibilityLabel={`Share with ${f.displayName ?? f.username}`}
                      onValueChange={(v) => save.mutate({ grants: v ? [...s.grants, f.id] : s.grants.filter((g) => g !== f.id) })}
                    />
                  }
                />
              );
            })}
            {friends.data?.friends.length === 0 && <Text muted>Add friends first, then choose who can see you.</Text>}
          </Card>
        </>
      )}

      {s.mode !== 'OFF' && (
        <>
          <SectionTitle>For how long</SectionTitle>
          <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
            {DURATIONS.map((d) => {
              const active = d.ms === 0 ? !s.expiresAt : expiresIn !== null && Math.abs(expiresIn - d.ms) < 30 * 60_000;
              return (
                <Pressable
                  key={d.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => save.mutate({ expiresAt: d.ms ? new Date(Date.now() + d.ms).toISOString() : null })}
                  style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: active ? c.brand : c.surfaceAlt }}
                >
                  <Text variant="label" color={active ? c.brandText : c.link}>
                    {d.label}
                  </Text>
                </Pressable>
              );
            })}
          </Row>
          {s.expiresAt && (
            <Text variant="caption" muted style={{ marginTop: space.sm }}>
              Sharing stops automatically at {new Date(s.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
            </Text>
          )}
        </>
      )}

      <SectionTitle>How updates work</SectionTitle>
      <Card>
        <Text variant="bodyStrong">
          {perm === 'background' ? 'Background updates allowed' : perm === 'foreground' ? 'Updates only while Vybe is open' : 'Location permission not granted'}
        </Text>
        <Text variant="caption" muted style={{ marginTop: space.xs }}>
          Vybe asks Android for your spot about every {TARGET_INTERVAL_MS / 60_000} minutes while sharing. Battery saver and Doze can make updates less frequent, so friends always see when your spot was last updated, not a guess.
          We keep only your latest spot (no history) and delete it after 24 hours, or right away when you stop sharing.
        </Text>
        {perm !== 'background' && s.mode !== 'OFF' && (
          <Button title="Allow background updates" kind="secondary" style={{ marginTop: space.md }} onPress={async () => setPerm(await ensurePermissionThenTrack())} />
        )}
        {perm === 'none' && <Button title="Open app settings" kind="ghost" onPress={() => Linking.openSettings()} />}
      </Card>
      <Button title="Delete my current location now" kind="ghost" style={{ marginTop: space.lg }} onPress={() => api('/locations/me', { method: 'DELETE' }).then(() => qc.invalidateQueries({ queryKey: ['locations'] }))} />
    </Screen>
  );
}
