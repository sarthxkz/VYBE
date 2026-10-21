import { useState, useEffect } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, mediaSource } from '@/api/client';
import type { PhotoPost } from '@/api/types';
import { ago } from '@/features/location/tracking';
import { Avatar, Button, EmptyState, ErrorState, Pill, Row, Screen, Skeleton, Text } from '@/ui';
import { palette, radius, space, useColors } from '@/theme';

type Page = { items: PhotoPost[]; nextCursor: string | null };

const BANNER_KEY = 'vybe.banner.blink';

export default function PhotosScreen() {
  const c = useColors();
  const router = useRouter();
  // The selected tab lives in the route params, so "after sending, open Sent" and tapping a tab are one mechanism.
  const tab = useLocalSearchParams<{ tab?: string }>().tab === 'sent' ? 'sent' : 'inbox';
  const setTab = (t: 'inbox' | 'sent') => router.setParams({ tab: t });
  const q = useInfiniteQuery({
    queryKey: ['photos', tab],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<Page>(`/photos/${tab}${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen ambient padded={false} edges={['top']}>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.md }}>
        <Text variant="title" accessibilityRole="header">
          Blink
        </Text>
        <BlinkBanner onSend={() => router.push({ pathname: '/camera', params: { blink: '1' } })} />
        <Row style={{ marginVertical: space.md }} gap={space.sm}>
          {(['inbox', 'sent'] as const).map((t) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              onPress={() => setTab(t)}
              style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: tab === t ? c.brand : c.surfaceAlt }}
            >
              <Text variant="label" color={tab === t ? c.brandText : c.link}>
                {t === 'inbox' ? 'For you' : 'Sent'}
              </Text>
            </Pressable>
          ))}
        </Row>
      </View>
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: space.sm, paddingHorizontal: space.lg }}
        contentContainerStyle={{ gap: space.sm, paddingBottom: space.xxxl }}
        refreshing={q.isRefetching && !q.isFetchingNextPage}
        onRefresh={() => q.refetch()}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
        ListEmptyComponent={
          q.isPending ? (
            <View style={{ paddingHorizontal: space.lg }}>
              <Skeleton height={220} />
            </View>
          ) : q.isError ? (
            <ErrorState onRetry={() => q.refetch()} />
          ) : (
            <EmptyState
              emoji={tab === 'inbox' ? '📭' : '📤'}
              title={tab === 'inbox' ? 'No Blinks yet' : 'You haven’t sent any Blinks'}
              body={tab === 'inbox' ? 'When friends send you photos, they show up here.' : 'Snap something and send it to your friends.'}
              action={<Button title="Send a Blink" kind="action" onPress={() => router.push({ pathname: '/camera', params: { blink: '1' } })} />}
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Photo from ${item.sender.displayName ?? item.sender.username}, ${ago(item.createdAt)}`}
            onPress={() => router.push(`/photo/${item.id}`)}
            style={{ flex: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.surfaceAlt, aspectRatio: 3 / 4 }}
          >
            {item.instant && tab === 'inbox' ? (
              // Never preview a Blink: the only look is the one-time open.
              <View style={{ flex: 1, backgroundColor: palette.grape500, alignItems: 'center', justifyContent: 'center', gap: space.xs }}>
                <Text variant="title" color="#fff">✨</Text>
                <Text variant="label" color="#fff">Blink · tap to open once</Text>
              </View>
            ) : (
              <Image source={mediaSource(item.mediaId)} style={{ flex: 1 }} contentFit="cover" transition={200} recyclingKey={item.id} />
            )}
            <View style={{ position: 'absolute', left: space.sm, right: space.sm, bottom: space.sm }}>
              <Row gap={space.xs}>
                <Avatar mediaId={item.sender.avatarMediaId} look={item.sender.avatarStyle} name={item.sender.displayName ?? item.sender.username} size={24} />
                <Text variant="caption" color="#fff" numberOfLines={1} style={{ flex: 1, textShadowColor: '#000', textShadowRadius: 4 }}>
                  {ago(item.createdAt)}
                </Text>
                {item.instant && tab === 'sent' && (
                  <Pill
                    label={`✨ Opened ${item.recipients?.filter((r) => r.viewedAt).length ?? 0}/${item.recipients?.length ?? 0}`}
                    color={palette.grape500}
                    textColor="#fff"
                  />
                )}
                {tab === 'inbox' && !item.viewedAt && <Pill label="New" color={c.live} textColor="#14121F" />}
              </Row>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

/** "Introducing Blink" banner at the top of the tab; dismissed for good with the ✕. */
function BlinkBanner({ onSend }: { onSend: () => void }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    void SecureStore.getItemAsync(BANNER_KEY)
      .then((v) => setHidden(v === '1'))
      .catch(() => setHidden(false));
  }, []);
  if (hidden) return null;
  return (
    <View style={{ marginTop: space.md, borderRadius: radius.lg, backgroundColor: palette.grape500, padding: space.lg, gap: space.sm, overflow: 'hidden' }}>
      <Text variant="label" color={palette.lime400}>
        NEW · INTRODUCING BLINK ✨
      </Text>
      <Text variant="heading" color="#fff">
        Your every moment, captured once.
      </Text>
      <Text variant="caption" color="#E4DCFF">
        Snap it, send it to all your friends. Each friend can open it once, then it’s gone.
      </Text>
      <Row gap={space.sm} style={{ marginTop: space.xs }}>
        <Button title="Send a Blink" kind="action" onPress={onSend} style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide this banner"
          hitSlop={12}
          onPress={() => {
            setHidden(true);
            void SecureStore.setItemAsync(BANNER_KEY, '1').catch(() => {});
          }}
          style={{ padding: space.sm }}
        >
          <Text color="#fff">✕</Text>
        </Pressable>
      </Row>
    </View>
  );
}
