import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, Text as RNText, useColorScheme, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Camera, Map, UserLocation, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import type { FriendLocation, LocationSettings, Mood, PublicUser } from '@/api/types';
import { useSession } from '@/stores/session';
import { ago, freshness, permissionLevel, startTracking, type PermissionLevel } from '@/features/location/tracking';
import { cluster } from '@/features/location/cluster';
import { Avatar, Button, Card, EmptyState, ErrorState, Row, Skeleton, Text } from '@/ui';
import { palette, radius, shadow, space, useColors } from '@/theme';

// Free, keyless vector tiles (OpenFreeMap / OpenStreetMap). Attribution stays visible as the license requires.
const MAP_STYLE = { light: 'https://tiles.openfreemap.org/styles/liberty', dark: 'https://tiles.openfreemap.org/styles/dark' };
const MAP_THEME_KEY = 'vybe.map.theme';

export default function MapScreen() {
  const c = useColors();
  const router = useRouter();
  const camera = useRef<CameraRef>(null);
  const [zoom, setZoom] = useState(3);
  const [selected, setSelected] = useState<string | null>(null);
  const [perm, setPerm] = useState<PermissionLevel>('none');
  const [, tick] = useState(0);
  const me = useSession((st) => st.me);
  const [myPos, setMyPos] = useState<[number, number] | null>(null);
  // Map theme: follows the phone until you pick one with the moon/sun button.
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [mapTheme, setMapTheme] = useState<'light' | 'dark' | null>(null);
  useEffect(() => {
    void SecureStore.getItemAsync(MAP_THEME_KEY).then((v) => (v === 'light' || v === 'dark') && setMapTheme(v)).catch(() => {});
  }, []);
  const theme = mapTheme ?? system;
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setMapTheme(next);
    void SecureStore.setItemAsync(MAP_THEME_KEY, next).catch(() => {});
  };

  const friends = useQuery({ queryKey: ['locations', 'friends'], queryFn: () => api<{ friends: FriendLocation[] }>('/locations/friends'), refetchInterval: 60_000 });
  const settings = useQuery({ queryKey: ['locations', 'settings'], queryFn: () => api<LocationSettings>('/locations/settings') });

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000); // keep "x min ago" honest
    return () => clearInterval(t);
  }, []);

  // Re-read the permission whenever the map is shown or the app returns from Android settings. Reading it
  // only once at mount left a stale "Location is off" banner after the user allowed it elsewhere.
  const recheck = useCallback(() => void permissionLevel().then(setPerm), []);
  useFocusEffect(recheck);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => st === 'active' && recheck());
    return () => sub.remove();
  }, [recheck]);
  // Permission just appeared while sharing is on: start sending now instead of after the next app restart.
  useEffect(() => {
    if (perm !== 'none' && settings.data?.active) void startTracking();
  }, [perm, settings.data?.active]);

  // Your character follows you while the map is on screen (the watch stops when you leave the tab).
  useFocusEffect(
    useCallback(() => {
      if (perm === 'none') return;
      let sub: Location.LocationSubscription | null = null;
      let cancelled = false;
      const set = (p: Location.LocationObject | null) => p && !cancelled && setMyPos([p.coords.longitude, p.coords.latitude]);
      void Location.getLastKnownPositionAsync().then(set).catch(() => {});
      void Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 15, timeInterval: 15_000 }, set)
        .then((w) => (cancelled ? w.remove() : (sub = w)))
        .catch(() => {});
      return () => {
        cancelled = true;
        sub?.remove();
      };
    }, [perm]),
  );

  const located = useMemo(
    () =>
      (friends.data?.friends ?? [])
        .filter((f) => f.location && freshness(f.location.receivedAt) !== 'unavailable')
        .map((f) => ({ id: f.user.id, lat: f.location!.lat, lng: f.location!.lng, f })),
    [friends.data],
  );
  const clusters = useMemo(() => cluster(located, zoom), [located, zoom]);
  // No friends on the map yet: open on you rather than the whole country.
  const centered = useRef(false);
  useEffect(() => {
    if (myPos && !centered.current && !located.length) {
      centered.current = true;
      camera.current?.flyTo({ center: myPos, zoom: 14, duration: 800 });
    }
  }, [myPos, located.length]);
  const list = friends.data?.friends ?? [];
  const sel = list.find((f) => f.user.id === selected);

  const focus = (f: FriendLocation) => {
    setSelected(f.user.id);
    if (f.location) camera.current?.flyTo({ center: [f.location.lng, f.location.lat], zoom: Math.max(zoom, 14), duration: 900 });
  };

  const s = settings.data;
  const status = !s ? '…' : s.ghost ? 'Ghost Mode is on' : !s.active ? 'You’re not sharing' : s.mode === 'ALL' ? 'Sharing with all friends' : `Sharing with ${s.grants.length} friend${s.grants.length === 1 ? '' : 's'}`;
  const statusColor = !s || !s.active ? c.textMuted : c.liveText;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Map
        style={{ flex: 1 }}
        mapStyle={MAP_STYLE[theme]}
        logo={false}
        attribution
        compass={false}
        onRegionDidChange={(e) => setZoom(Math.round(e.nativeEvent.zoom))}
        onPress={() => setSelected(null)}
      >
        <Camera ref={camera} initialViewState={located[0] ? { center: [located[0].lng, located[0].lat], zoom: 11 } : { center: [78.9, 22.5], zoom: 3 }} />
        {perm !== 'none' && !myPos && <UserLocation />}
        {myPos && me && (
          <Marker id="me" lngLat={myPos} anchor="bottom" onPress={() => router.push('/mood')}>
            <Pin user={me} mood={me.mood} label="You" ring={c.brand} size={58} />
          </Marker>
        )}
        {clusters.map((cl) => {
          const one = cl.members.length === 1 ? cl.members[0]!.f : null;
          const ring = one ? (freshness(one.location!.receivedAt) === 'fresh' ? palette.lime400 : palette.amber500) : palette.grape500;
          return (
            <Marker
              key={cl.id}
              id={cl.id}
              lngLat={[cl.lng, cl.lat]}
              anchor={one ? 'bottom' : 'center'}
              onPress={() => (one ? focus(one) : camera.current?.flyTo({ center: [cl.lng, cl.lat], zoom: zoom + 2, duration: 600 }))}
            >
              {one ? (
                <Pin
                  user={one.user}
                  mood={one.user.mood}
                  label={`${one.user.displayName ?? one.user.username} · ${ago(one.location!.receivedAt)}`}
                  ring={ring}
                  size={selected === one.user.id ? 66 : 54}
                />
              ) : (
                <View
                  accessibilityLabel={`${cl.members.length} friends here`}
                  style={[{ width: 52, height: 52, borderRadius: 26, backgroundColor: palette.grape500, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }, shadow.float]}
                >
                  <Text variant="bodyStrong" color="#fff">
                    {cl.members.length}
                  </Text>
                </View>
              )}
            </Marker>
          );
        })}
      </Map>

      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.lg }}>
        <Row style={{ marginTop: space.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={me?.mood ? `Your mood: ${me.mood.emoji} ${me.mood.text ?? ''}. Change it` : 'Set your mood'}
            onPress={() => router.push('/mood')}
            style={[{ height: 44, borderRadius: radius.pill, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', paddingLeft: 3, paddingRight: space.md, gap: space.xs }, shadow.card]}
          >
            <Avatar look={me?.avatarStyle} mediaId={me?.avatarMediaId} name={me?.displayName ?? me?.username} size={38} />
            <RNText style={{ fontSize: 20 }}>{me?.mood?.emoji ?? '＋'}</RNText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${status}. Change who can see you`}
            onPress={() => router.push('/settings/location')}
            style={[{ flex: 1, backgroundColor: c.surface, borderRadius: radius.pill, paddingVertical: space.sm, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm }, shadow.card]}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s?.active ? palette.lime400 : c.border }} />
            <Text variant="label" color={statusColor} style={{ flex: 1 }} numberOfLines={1}>
              {status}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Friends"
            onPress={() => router.push('/friends')}
            style={[{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.card]}
          >
            <Ionicons name="people" size={22} color={c.link} />
          </Pressable>
        </Row>
        {s?.active && perm === 'none' && (
          <Card style={{ marginTop: space.sm }} onPress={() => router.push('/settings/location')}>
            <Text variant="bodyStrong">Location is off for Vybe</Text>
            <Text variant="caption" muted>
              Your sharing is on, but Android isn’t giving Vybe your location. Tap to fix.
            </Text>
          </Card>
        )}
      </SafeAreaView>

      <View style={{ position: 'absolute', right: space.lg, bottom: 170, gap: space.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={theme === 'dark' ? 'Switch to light map' : 'Switch to dark map'}
          onPress={toggleTheme}
          style={[{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.card]}
        >
          <Ionicons name={theme === 'dark' ? 'sunny' : 'moon'} size={22} color={c.link} />
        </Pressable>
        {perm !== 'none' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Recenter on me"
            onPress={async () => {
              const me = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
              if (me) camera.current?.flyTo({ center: [me.coords.longitude, me.coords.latitude], zoom: 14, duration: 600 });
            }}
            style={[{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.card]}
          >
            <Ionicons name="locate" size={22} color={c.link} />
          </Pressable>
        )}
      </View>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: space.md }}>
        {sel ? (
          <Card style={{ marginHorizontal: space.lg }}>
            <Row>
              <Avatar mediaId={sel.user.avatarMediaId} look={sel.user.avatarStyle} name={sel.user.displayName ?? sel.user.username} size={52} />
              <View style={{ flex: 1 }}>
                <Text variant="heading" numberOfLines={1}>
                  {sel.user.displayName ?? sel.user.username}
                </Text>
                <FreshnessLine f={sel} />
                {sel.user.mood && <MoodLine mood={sel.user.mood} />}
              </View>
            </Row>
            <Row style={{ marginTop: space.md }}>
              <Button title="Message" style={{ flex: 1 }} onPress={() => router.push(`/chat/${sel.user.id}`)} />
              <Button title="Profile" kind="secondary" style={{ flex: 1 }} onPress={() => router.push(`/user/${sel.user.id}`)} />
            </Row>
          </Card>
        ) : friends.isPending ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Skeleton height={86} />
          </View>
        ) : friends.isError ? (
          <Card style={{ marginHorizontal: space.lg }}>
            <ErrorState onRetry={() => friends.refetch()} />
          </Card>
        ) : list.length === 0 ? (
          <Card style={{ marginHorizontal: space.lg }}>
            <EmptyState emoji="🗺️" title="Your map is waiting" body="Add friends to see them here when they share their spot." action={<Button title="Find friends" onPress={() => router.push('/friends/add')} />} />
          </Card>
        ) : (
          <FlatList
            horizontal
            data={list}
            keyExtractor={(f) => f.user.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}
            renderItem={({ item }) => (
              <Card style={{ width: 168, padding: space.md }} onPress={() => (item.location ? focus(item) : router.push(`/user/${item.user.id}`))}>
                <Row gap={space.sm}>
                  <Avatar mediaId={item.user.avatarMediaId} look={item.user.avatarStyle} name={item.user.displayName ?? item.user.username} size={36} />
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                    {item.user.displayName ?? item.user.username}
                  </Text>
                </Row>
                <FreshnessLine f={item} compact />
                {item.user.mood && <MoodLine mood={item.user.mood} compact />}
              </Card>
            )}
          />
        )}
      </View>
    </View>
  );
}

function FreshnessLine({ f, compact }: { f: FriendLocation; compact?: boolean }) {
  const c = useColors();
  if (!f.sharing) return <Text variant="caption" muted style={{ marginTop: compact ? space.xs : 0 }}>Not sharing location</Text>;
  const state = freshness(f.location?.receivedAt);
  const color = state === 'fresh' ? c.liveText : state === 'stale' ? c.stale : c.textMuted;
  const label = state === 'unavailable' ? 'Location unavailable' : `${state === 'fresh' ? 'Live' : 'Last seen'} · ${ago(f.location!.receivedAt)}`;
  return (
    <Text variant="caption" color={color} style={{ marginTop: compact ? space.xs : 0 }}>
      {label}
    </Text>
  );
}

/**
 * Map marker: the friend's character with a mood bubble and a name tag (Snapchat-style, Vybe colours).
 * Rendered in a live <Marker>: on Android, ViewAnnotation snapshots its view into a bitmap once, which
 * dropped the SVG avatars and missed later changes ("avatars keep disappearing").
 */
function Pin({ user, mood, label, ring, size }: { user: PublicUser; mood?: Mood | null; label: string; ring: string; size: number }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center' }} accessibilityLabel={`${label}${mood ? `, mood ${mood.emoji} ${mood.text ?? ''}` : ''}`}>
      <View style={[{ borderRadius: size }, shadow.float]}>
        <Avatar mediaId={user.avatarMediaId} look={user.avatarStyle} name={user.displayName ?? user.username} size={size} ring={ring} />
        {mood && (
          <View style={[{ position: 'absolute', right: -10, top: -8, backgroundColor: c.surface, borderRadius: 16, paddingHorizontal: 4, paddingVertical: 1 }, shadow.card]}>
            <RNText style={{ fontSize: size * 0.32 }}>{mood.emoji}</RNText>
          </View>
        )}
      </View>
      <View style={[{ marginTop: 4, backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, maxWidth: 160 }, shadow.card]}>
        <Text variant="caption" numberOfLines={1} style={{ fontWeight: '600' }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function MoodLine({ mood, compact }: { mood: Mood; compact?: boolean }) {
  return (
    <Text variant="caption" muted numberOfLines={1} style={{ marginTop: compact ? 2 : space.xs }}>
      {mood.emoji} {mood.text ?? 'vibing'}
    </Text>
  );
}
