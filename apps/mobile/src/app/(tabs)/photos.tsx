import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, mediaSource } from '@/api/client';
import type { PhotoPost } from '@/api/types';
import { ago } from '@/features/location/tracking';
import { Appear, Avatar, Button, EmptyState, ErrorState, Gradient, IconButton, Pill, PressScale, Row, Screen, ScreenHeader, Segmented, Skeleton, Text, useBreathe } from '@/ui';
import { gradient, palette, radius, shadow, space, useColors } from '@/theme';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

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
      <View style={{ paddingHorizontal: space.xl }}>
        <ScreenHeader title="Photos" subtitle="Only the friends you pick can see them" right={<IconButton icon="camera" label="Open camera" size={44} onPress={() => router.push('/camera')} />} />
        <Appear index={1} style={{ marginBottom: space.md }}>
          <Segmented
            options={[
              { value: 'inbox', label: 'For you' },
              { value: 'sent', label: 'Sent' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </Appear>
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
            <View style={{ paddingHorizontal: space.lg, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={220} style={{ width: '48.5%', marginBottom: 0, borderRadius: radius.lg }} />
              ))}
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
        renderItem={({ item, index }) => (
          <Appear index={index} style={{ flex: 1, maxWidth: '48.8%' }}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={`Photo from ${item.sender.displayName ?? item.sender.username}, ${ago(item.createdAt)}`}
            onPress={() => router.push(`/photo/${item.id}`)}
            style={[{ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.surfaceAlt, aspectRatio: 3 / 4 }, shadow.card]}
          >
            {item.instant && tab === 'inbox' ? (
              // Never preview a Blink: the only look is the one-time open.
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs }}>
                <Gradient colors={gradient.aurora} />
                <Sparkle />
                <Text variant="label" color="#fff">Blink · tap to open once</Text>
              </View>
            ) : (
              <Image source={mediaSource(item.mediaId)} style={{ flex: 1 }} contentFit="cover" transition={200} recyclingKey={item.id} />
            )}
            <Gradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} angle="vertical" style={{ top: '60%' }} />
            <View style={{ position: 'absolute', left: space.sm, right: space.sm, bottom: space.sm }}>
              <Row gap={space.xs}>
                <Avatar mediaId={item.sender.avatarMediaId} look={item.sender.avatarStyle} name={item.sender.displayName ?? item.sender.username} size={24} />
                <Text variant="caption" color="#fff" numberOfLines={1} style={{ flex: 1, textShadowColor: '#000', textShadowRadius: 4 }}>
                  {ago(item.createdAt)}
                </Text>
                {item.instant && tab === 'sent' && <Pill label="✨ Blink" color={palette.grape500} textColor="#fff" />}
                {tab === 'inbox' && !item.viewedAt && <Pill label="New" color={c.live} textColor="#14121F" />}
              </Row>
            </View>
          </PressScale>
          </Appear>
        )}
      />
    </Screen>
  );
}

function Sparkle() {
  const t = useBreathe(900);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.15 * t.value }, { rotate: `${t.value * 12}deg` }] }));
  return (
    <Animated.View style={style}>
      <Text variant="title" color="#fff">
        ✨
      </Text>
    </Animated.View>
  );
}
