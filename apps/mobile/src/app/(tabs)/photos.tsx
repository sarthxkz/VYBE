import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, mediaSource } from '@/api/client';
import type { PhotoPost } from '@/api/types';
import { ago } from '@/features/location/tracking';
import { Avatar, Button, EmptyState, ErrorState, Pill, Row, Screen, Skeleton, Text } from '@/ui';
import { radius, space, useColors } from '@/theme';

type Page = { items: PhotoPost[]; nextCursor: string | null };

export default function PhotosScreen() {
  const c = useColors();
  const router = useRouter();
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox');
  const q = useInfiniteQuery({
    queryKey: ['photos', tab],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<Page>(`/photos/${tab}${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen padded={false} edges={['top']}>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.md }}>
        <Text variant="title" accessibilityRole="header">
          Photos
        </Text>
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
              title={tab === 'inbox' ? 'No photos yet' : 'You haven’t sent any photos'}
              body={tab === 'inbox' ? 'When friends send you photos, they show up here.' : 'Snap something and send it to your friends.'}
              action={<Button title="Open camera" kind="action" onPress={() => router.push('/camera')} />}
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
            <Image source={mediaSource(item.mediaId)} style={{ flex: 1 }} contentFit="cover" transition={200} recyclingKey={item.id} />
            <View style={{ position: 'absolute', left: space.sm, right: space.sm, bottom: space.sm }}>
              <Row gap={space.xs}>
                <Avatar mediaId={item.sender.avatarMediaId} name={item.sender.displayName ?? item.sender.username} size={24} />
                <Text variant="caption" color="#fff" numberOfLines={1} style={{ flex: 1, textShadowColor: '#000', textShadowRadius: 4 }}>
                  {ago(item.createdAt)}
                </Text>
                {tab === 'inbox' && !item.viewedAt && <Pill label="New" color={c.live} textColor="#14121F" />}
              </Row>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}
