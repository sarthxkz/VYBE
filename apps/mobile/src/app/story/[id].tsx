import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, FadeIn, interpolate, runOnJS, SlideInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { api, mediaSource } from '@/api/client';
import type { PublicUser, StoryGroup } from '@/api/types';
import { ago } from '@/features/location/tracking';
import { useStoryFeed } from '@/features/stories/StoryTray';
import { useSession } from '@/stores/session';
import { Avatar, Row, Text } from '@/ui';
import { motion, radius, space, useColors } from '@/theme';

const STORY_MS = 5000;

export default function StoryViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const feed = useStoryFeed();
  const hasFeed = !!feed.data;

  // My story plays on its own; a friend's story continues into the next friends' stories, like everywhere else.
  const groups = useMemo<StoryGroup[]>(() => {
    if (!feed.data) return [];
    if (id === me?.id) return feed.data.mine ? [feed.data.mine] : [];
    const list = feed.data.friends;
    const at = Math.max(0, list.findIndex((g) => g.user.id === id));
    return list.slice(at);
    // Freeze the order for this viewing session; seen flags change as you watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFeed, id]);

  const [gi, setGi] = useState(0);
  const group = groups[gi];
  const [si, setSi] = useState(() => 0);
  const startedGroup = useRef(-1);
  // Open each friend's group at their first unseen photo.
  useEffect(() => {
    if (!group || startedGroup.current === gi) return;
    startedGroup.current = gi;
    const first = group.stories.findIndex((s) => !s.seen);
    setSi(first < 0 ? 0 : first);
  }, [group, gi]);
  const story = group?.stories[si];
  const mine = group?.user.id === me?.id;

  const progress = useSharedValue(0);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const loaded = !!story && loadedId === story.id;
  const [paused, setPaused] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const close = () => {
    void qc.invalidateQueries({ queryKey: ['stories'] });
    if (router.canGoBack()) router.back();
    else router.replace('/chats');
  };

  const next = () => {
    if (!group) return close();
    if (si < group.stories.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) setGi(gi + 1);
    else close();
  };
  const prev = () => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) {
      startedGroup.current = gi - 1; // going back starts at that friend's last photo
      setSi(groups[gi - 1]!.stories.length - 1);
      setGi(gi - 1);
    } else progress.set(0);
  };

  // Each photo's timer starts once its image has loaded.
  useEffect(() => {
    cancelAnimation(progress);
    progress.set(0);
  }, [story?.id, progress]);

  const play = () => {
    progress.set(withTiming(1, { duration: STORY_MS * (1 - progress.get()), easing: Easing.linear }, (done) => {
      if (done) runOnJS(next)();
    }));
  };
  useEffect(() => {
    if (!loaded || paused || viewersOpen) cancelAnimation(progress);
    else play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, paused, viewersOpen, story?.id]);

  // Record the view (friends' stories only; the server ignores my own).
  useEffect(() => {
    if (story && !mine && !story.seen) void api(`/stories/${story.id}/view`, { body: {} }).catch(() => {});
  }, [story, mine]);

  // Drag down to dismiss.
  const drag = useSharedValue(0);
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX([-20, 20])
    .onStart(() => runOnJS(setPaused)(true))
    .onUpdate((e) => {
      drag.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 140 || e.velocityY > 900) {
        drag.value = withTiming(height, { duration: motion.base });
        runOnJS(close)();
      } else {
        drag.value = withSpring(0, motion.snappy);
        runOnJS(setPaused)(false);
      }
    });
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.value }, { scale: interpolate(drag.value, [0, height], [1, 0.85]) }],
    borderRadius: interpolate(drag.value, [0, 80], [0, radius.xl], 'clamp'),
  }));

  const pressedAt = useRef(0);
  const deleteStory = () =>
    Alert.alert('Delete this photo from your story?', 'It’s removed for everyone right away.', [
      { text: 'Cancel', style: 'cancel', onPress: () => setPaused(false) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await api(`/stories/${story!.id}`, { method: 'DELETE' }).catch(() => Alert.alert('Couldn’t delete', 'Check your connection and try again.'));
          close();
        },
      },
    ]);

  if (feed.isSuccess && !group) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: space.md }}>
        <Text color="#fff">This story has ended.</Text>
        <Pressable onPress={close} accessibilityRole="button">
          <Text color="#fff" variant="bodyStrong">
            Close
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1, overflow: 'hidden', backgroundColor: '#111' }, sheet]}>
          {story && (
            <Animated.View key={story.id} entering={reduced ? undefined : FadeIn.duration(motion.fast)} style={StyleSheet.absoluteFill}>
              <Image source={mediaSource(story.mediaId)} style={StyleSheet.absoluteFill} contentFit="contain" onLoad={() => setLoadedId(story.id)} onError={() => setLoadedId(story.id)} accessibilityLabel={story.caption ?? 'Story photo'} />
            </Animated.View>
          )}
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Next photo"
            accessibilityHint="Tap the left side to go back, hold to pause"
            onPressIn={() => {
              pressedAt.current = Date.now();
              setPaused(true);
            }}
            onPressOut={(e) => {
              setPaused(false);
              if (Date.now() - pressedAt.current < 220) (e.nativeEvent.locationX < width / 3 ? prev : next)();
            }}
          />
          {/* Top: progress segments and who posted. */}
          <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + space.sm, left: space.md, right: space.md, gap: space.md }}>
            <Row gap={4}>
              {group?.stories.map((s, i) => <Segment key={s.id} state={i < si ? 'done' : i === si ? 'active' : 'todo'} progress={progress} />)}
            </Row>
            <Row>
              {group && <Avatar mediaId={group.user.avatarMediaId} look={group.user.avatarStyle} name={group.user.displayName ?? group.user.username} size={36} />}
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" color="#fff" style={styles.shadow}>
                  {mine ? 'Your story' : (group?.user.displayName ?? group?.user.username)}
                </Text>
                {story && (
                  <Text variant="caption" color="rgba(255,255,255,0.8)" style={styles.shadow}>
                    {ago(story.createdAt)}
                  </Text>
                )}
              </View>
              {mine && (
                <Pressable accessibilityRole="button" accessibilityLabel="Delete this photo" hitSlop={10} onPress={() => (setPaused(true), deleteStory())}>
                  <Ionicons name="trash-outline" size={22} color="#fff" />
                </Pressable>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel="Close story" hitSlop={12} onPress={close}>
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
            </Row>
          </View>
          {/* Bottom: caption, and "seen by" on my own story. */}
          <View pointerEvents="box-none" style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: insets.bottom + space.lg, gap: space.md, alignItems: 'center' }}>
            {story?.caption ? (
              <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm }}>
                <Text color="#fff" style={{ textAlign: 'center' }}>
                  {story.caption}
                </Text>
              </View>
            ) : null}
            {mine && story && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Seen by ${story.viewCount ?? 0}. Show who`} onPress={() => setViewersOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
                <Ionicons name="eye" size={18} color="#fff" />
                <Text variant="bodyStrong" color="#fff">
                  {story.viewCount ?? 0}
                </Text>
                <Ionicons name="chevron-up" size={16} color="#fff" />
              </Pressable>
            )}
          </View>
        </Animated.View>
      </GestureDetector>
      {mine && story && <Viewers storyId={story.id} visible={viewersOpen} onClose={() => setViewersOpen(false)} />}
    </View>
  );
}

function Segment({ state, progress }: { state: 'done' | 'active' | 'todo'; progress: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({ width: `${(state === 'done' ? 1 : state === 'active' ? progress.value : 0) * 100}%` }));
  return (
    <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
      <Animated.View style={[{ height: 3, backgroundColor: '#fff' }, fill]} />
    </View>
  );
}

/** Bottom sheet listing who watched one of my stories. */
function Viewers({ storyId, visible, onClose }: { storyId: string; visible: boolean; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ['stories', 'viewers', storyId], queryFn: () => api<{ viewers: { viewedAt: string; viewer: PublicUser }[] }>(`/stories/${storyId}/viewers`), enabled: visible });
  const list = q.data?.viewers ?? [];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={onClose} accessibilityLabel="Close">
        <Animated.View entering={SlideInDown.springify().damping(motion.snappy.damping)}>
          <Pressable accessibilityViewIsModal style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, paddingBottom: insets.bottom + space.xl, maxHeight: 480 }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: space.lg }} />
            <Text variant="heading" style={{ marginBottom: space.md }}>
              Seen by {list.length}
            </Text>
            <FlatList
              data={list}
              keyExtractor={(v) => v.viewer.id}
              ListEmptyComponent={
                <Text muted>{q.isPending ? 'Loading…' : 'Nobody yet. Friends who watch will show up here.'}</Text>
              }
              renderItem={({ item }) => (
                <Row style={{ paddingVertical: space.sm }}>
                  <Avatar mediaId={item.viewer.avatarMediaId} look={item.viewer.avatarStyle} name={item.viewer.displayName ?? item.viewer.username} size={40} />
                  <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                    {item.viewer.displayName ?? item.viewer.username}
                  </Text>
                  <Text variant="caption" muted>
                    {ago(item.viewedAt)}
                  </Text>
                </Row>
              )}
            />
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({ shadow: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 } });
