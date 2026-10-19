import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Camera, Map, UserLocation, ViewAnnotation, type CameraRef } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import type { FriendLocation, LocationSettings } from '@/api/types';
import { ago, freshness, permissionLevel, type PermissionLevel } from '@/features/location/tracking';
import { cluster } from '@/features/location/cluster';
import { Avatar, Button, Card, EmptyState, ErrorState, Row, Skeleton, Text } from '@/ui';
import { palette, radius, shadow, space, useColors } from '@/theme';

// Free, keyless vector tiles (OpenFreeMap / OpenStreetMap). Attribution stays visible as the license requires.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export default function MapScreen() {
  const c = useColors();
  const router = useRouter();
  const camera = useRef<CameraRef>(null);
  const [zoom, setZoom] = useState(3);
  const [selected, setSelected] = useState<string | null>(null);
  const [perm, setPerm] = useState<PermissionLevel>('none');
  const [, tick] = useState(0);

  const friends = useQuery({ queryKey: ['locations', 'friends'], queryFn: () => api<{ friends: FriendLocation[] }>('/locations/friends'), refetchInterval: 60_000 });
  const settings = useQuery({ queryKey: ['locations', 'settings'], queryFn: () => api<LocationSettings>('/locations/settings') });

  useEffect(() => {
    void permissionLevel().then(setPerm);
    const t = setInterval(() => tick((x) => x + 1), 30_000); // keep "x min ago" honest
    return () => clearInterval(t);
  }, []);

  const located = useMemo(
    () =>
      (friends.data?.friends ?? [])
        .filter((f) => f.location && freshness(f.location.receivedAt) !== 'unavailable')
        .map((f) => ({ id: f.user.id, lat: f.location!.lat, lng: f.location!.lng, f })),
    [friends.data],
  );
  const clusters = useMemo(() => cluster(located, zoom), [located, zoom]);
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
        mapStyle={MAP_STYLE}
        logo={false}
        attribution
        compass={false}
        onRegionDidChange={(e) => setZoom(Math.round(e.nativeEvent.zoom))}
        onPress={() => setSelected(null)}
      >
        <Camera ref={camera} initialViewState={located[0] ? { center: [located[0].lng, located[0].lat], zoom: 11 } : { center: [78.9, 22.5], zoom: 3 }} />
        {perm !== 'none' && <UserLocation />}
        {clusters.map((cl) => {
          const one = cl.members.length === 1 ? cl.members[0]!.f : null;
          const ring = one ? (freshness(one.location!.receivedAt) === 'fresh' ? palette.lime400 : palette.amber500) : palette.grape500;
          return (
            <ViewAnnotation
              key={cl.id}
              id={cl.id}
              lngLat={[cl.lng, cl.lat]}
              anchor="center"
              onPress={() => (one ? focus(one) : camera.current?.flyTo({ center: [cl.lng, cl.lat], zoom: zoom + 2, duration: 600 }))}
            >
              {one ? (
                <View accessibilityLabel={`${one.user.displayName ?? one.user.username}, updated ${ago(one.location!.receivedAt)}`} style={[{ borderRadius: 40 }, shadow.float]}>
                  <Avatar mediaId={one.user.avatarMediaId} name={one.user.displayName ?? one.user.username} size={selected === one.user.id ? 60 : 48} ring={ring} />
                </View>
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
            </ViewAnnotation>
          );
        })}
      </Map>

      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.lg }}>
        <Row style={{ marginTop: space.sm }}>
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
              <Avatar mediaId={sel.user.avatarMediaId} name={sel.user.displayName ?? sel.user.username} size={52} />
              <View style={{ flex: 1 }}>
                <Text variant="heading" numberOfLines={1}>
                  {sel.user.displayName ?? sel.user.username}
                </Text>
                <FreshnessLine f={sel} />
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
                  <Avatar mediaId={item.user.avatarMediaId} name={item.user.displayName ?? item.user.username} size={36} />
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                    {item.user.displayName ?? item.user.username}
                  </Text>
                </Row>
                <FreshnessLine f={item} compact />
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
