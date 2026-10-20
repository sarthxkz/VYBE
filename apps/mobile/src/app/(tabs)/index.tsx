import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Linking, Pressable, Text as RNText, useColorScheme, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Camera, Map, UserLocation, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, API_URL } from '@/api/client';
import { hotspots } from '@/features/map/hotspots';
import { Hotspot } from '@/features/map/Hotspot';
import type { EventPin, FriendLocation, LocationSettings, Mood, PublicUser } from '@/api/types';
import { useSession } from '@/stores/session';
import { ago, freshness, permissionLevel, startTracking, stopTracking, type PermissionLevel } from '@/features/location/tracking';
import * as Haptics from 'expo-haptics';
import { queryClient } from '@/lib/query';
import { cluster } from '@/features/location/cluster';
import { Avatar, Button, Card, EmptyState, ErrorState, Row, Skeleton, Text } from '@/ui';
import { palette, radius, shadow, space, useColors } from '@/theme';

// Free, keyless vector tiles (OpenFreeMap / OpenStreetMap). Attribution stays visible as the license requires.
// Vybe's own recoloured styles (scripts/make-map-style.mjs), served from our server so the look can change without
// an app update; tiles still come from OpenFreeMap.
const MAP_STYLE = { light: `${API_URL}/app/map/vybe-light.json`, dark: `${API_URL}/app/map/vybe-dark.json` };
const MAP_THEME_KEY = 'vybe.map.theme';

export default function MapScreen() {
  const c = useColors();
  const router = useRouter();
  const camera = useRef<CameraRef>(null);
  const [zoom, setZoom] = useState(3);
  const [selected, setSelected] = useState<string | null>(null);
  const [perm, setPerm] = useState<PermissionLevel>('none');
  const [, tick] = useState(0);
  const center = useRef<[number, number] | null>(null);
  const [selEvent, setSelEvent] = useState<EventPin | null>(null);
  const events = useQuery({ queryKey: ['events'], queryFn: () => api<{ events: EventPin[] }>('/events'), refetchInterval: 120_000 });
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
  const hot = useMemo(() => hotspots(located), [located]);
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
  // One-tap Ghost Mode from the map: hides you right away (the server deletes your stored spot).
  const toggleGhost = async () => {
    if (!s) return;
    const ghost = !s.ghost;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await api('/locations/settings', { method: 'PUT', body: { ghost } });
      if (ghost) await stopTracking();
      else await startTracking();
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
    } catch {
      Alert.alert('Couldn’t change Ghost Mode', 'Check your connection and try again.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Map
        style={{ flex: 1 }}
        mapStyle={MAP_STYLE[theme]}
        logo={false}
        attribution
        compass={false}
        onRegionDidChange={(e) => {
          setZoom(Math.round(e.nativeEvent.zoom));
          center.current = e.nativeEvent.center;
        }}
        onPress={() => {
          setSelected(null);
          setSelEvent(null);
        }}
      >
        <Camera ref={camera} initialViewState={located[0] ? { center: [located[0].lng, located[0].lat], zoom: 11 } : { center: [78.9, 22.5], zoom: 3 }} />
        {perm !== 'none' && !myPos && <UserLocation />}
        {myPos && me && (
          <Marker id="me" lngLat={myPos} anchor="bottom" onPress={() => router.push('/mood')}>
            <Pin user={me} mood={me.mood} label="You" ring={c.brand} size={58} />
          </Marker>
        )}
        {hot.map((h) => (
          <Marker key={h.id} id={h.id} lngLat={[h.lng, h.lat]} anchor="center">
            <Hotspot count={h.count} />
          </Marker>
        ))}
        {(events.data?.events ?? []).map((ev) => (
          <Marker key={ev.id} id={`event-${ev.id}`} lngLat={[ev.lng, ev.lat]} anchor="bottom" onPress={() => setSelEvent(ev)}>
            <EventMarker ev={ev} />
          </Marker>
        ))}
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
        <View style={[{ marginTop: space.sm, backgroundColor: c.surface, borderRadius: 28, padding: 6, flexDirection: 'row', alignItems: 'center', gap: space.sm }, shadow.float]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={me?.mood ? `Your vibe: ${me.mood.emoji} ${me.mood.text ?? ''}. Change it` : 'Set your vibe'}
            onPress={() => router.push('/mood')}
          >
            <Avatar look={me?.avatarStyle} mediaId={me?.avatarMediaId} name={me?.displayName ?? me?.username} size={44} ring={s?.active ? palette.lime400 : undefined} />
            <View style={{ position: 'absolute', right: -6, bottom: -4, backgroundColor: c.surface, borderRadius: 12, paddingHorizontal: 3 }}>
              <RNText style={{ fontSize: 15 }}>{me?.mood?.emoji ?? '＋'}</RNText>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${status}. Change who can see you`} onPress={() => router.push('/settings/location')} style={{ flex: 1 }}>
            <Row gap={6}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s?.ghost ? c.textMuted : s?.active ? palette.lime400 : c.border }} />
              <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                {!s ? '…' : s.ghost ? 'Ghost Mode' : s.active ? 'You’re visible' : 'Not sharing'}
              </Text>
            </Row>
            <Text variant="caption" color={statusColor} numberOfLines={1}>
              {!s ? ' ' : s.ghost ? 'Nobody sees your spot' : !s.active ? 'Tap to share with friends' : s.mode === 'ALL' ? 'to all friends' : `to ${s.grants.length} friend${s.grants.length === 1 ? '' : 's'}`}
            </Text>
          </Pressable>
          {s && (s.active || s.ghost) && (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: s.ghost }}
              accessibilityLabel="Ghost Mode"
              onPress={toggleGhost}
              style={{ height: 40, borderRadius: 20, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: s.ghost ? palette.ink : c.surfaceAlt }}
            >
              <RNText style={{ fontSize: 16 }}>👻</RNText>
              <Text variant="label" color={s.ghost ? '#fff' : c.text}>
                {s.ghost ? 'On' : 'Ghost'}
              </Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Friends" onPress={() => router.push('/friends')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="people" size={20} color={c.link} />
          </Pressable>
        </View>
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
          accessibilityLabel="Create an event here"
          onPress={() => {
            const [lng, lat] = center.current ?? myPos ?? [NaN, NaN];
            if (Number.isNaN(lat)) return Alert.alert('Move the map first', 'Centre the map on where your event is.');
            router.push({ pathname: '/event-new', params: { lat: String(lat), lng: String(lng) } });
          }}
          style={[{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.card]}
        >
          <Ionicons name="calendar" size={22} color={c.link} />
        </Pressable>
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
        {selEvent ? (
          <EventCard ev={selEvent} mine={selEvent.creator.id === me?.id} onClose={() => setSelEvent(null)} />
        ) : sel ? (
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

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const isLive = (ev: EventPin) => Date.now() >= Date.parse(ev.startsAt);

/** Event pin: emoji badge with a title tag, glowing while the event is on. */
function EventMarker({ ev }: { ev: EventPin }) {
  const c = useColors();
  const live = isLive(ev);
  return (
    <View style={{ alignItems: 'center' }} accessibilityLabel={`Event: ${ev.title}, ${live ? 'happening now' : `starts ${timeOf(ev.startsAt)}`}`}>
      <View style={[{ width: 46, height: 46, borderRadius: 14, backgroundColor: live ? palette.coral500 : palette.grape500, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff', transform: [{ rotate: '-6deg' }] }, shadow.float]}>
        <RNText style={{ fontSize: 22 }}>{ev.emoji}</RNText>
      </View>
      <View style={[{ marginTop: 4, backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, maxWidth: 170 }, shadow.card]}>
        <Text variant="caption" numberOfLines={1} style={{ fontWeight: '600' }}>
          {ev.title} · {live ? 'now' : timeOf(ev.startsAt)}
        </Text>
      </View>
    </View>
  );
}

function EventCard({ ev, mine, onClose }: { ev: EventPin; mine: boolean; onClose: () => void }) {
  const remove = () =>
    Alert.alert('Remove this event?', 'Friends will no longer see it on the map.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await api(`/events/${ev.id}`, { method: 'DELETE' }).catch(() => {});
          onClose();
        },
      },
    ]);
  return (
    <Card style={{ marginHorizontal: space.lg }}>
      <Row>
        <RNText style={{ fontSize: 34 }}>{ev.emoji}</RNText>
        <View style={{ flex: 1 }}>
          <Text variant="heading" numberOfLines={1}>
            {ev.title}
          </Text>
          <Text variant="caption" muted>
            {isLive(ev) ? 'Happening now' : `Starts ${timeOf(ev.startsAt)}`} · until {timeOf(ev.endsAt)} · by {mine ? 'you' : (ev.creator.displayName ?? ev.creator.username)}
          </Text>
        </View>
      </Row>
      <Row style={{ marginTop: space.md }}>
        <Button title="Directions" style={{ flex: 1 }} onPress={() => void Linking.openURL(`geo:${ev.lat},${ev.lng}?q=${ev.lat},${ev.lng}(${encodeURIComponent(ev.title)})`)} />
        {mine ? <Button title="Remove" kind="danger" style={{ flex: 1 }} onPress={remove} /> : <Button title="Close" kind="secondary" style={{ flex: 1 }} onPress={onClose} />}
      </Row>
    </Card>
  );
}
