import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/api/client';
import type { PublicUser, StoryFeed } from '@/api/types';
import { useSession } from '@/stores/session';
import { Appear, Avatar, PressScale, SpinningGradient, Text } from '@/ui';
import { gradient, space, useColors } from '@/theme';

export const useStoryFeed = () => useQuery({ queryKey: ['stories', 'feed'], queryFn: () => api<StoryFeed>('/stories/feed'), refetchInterval: 60_000 });

const SIZE = 64;

/** Story ring: gradient while there's something new to watch, a quiet grey once everything's seen. */
export function StoryRing({ user, state, size = SIZE }: { user: Pick<PublicUser, 'avatarMediaId' | 'avatarStyle' | 'displayName' | 'username'>; state: 'unseen' | 'seen' | 'none'; size?: number }) {
  const c = useColors();
  const outer = size + 8;
  return (
    <View style={{ width: outer, height: outer, borderRadius: outer / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: state === 'seen' ? c.border : 'transparent' }}>
      {state === 'unseen' && <SpinningGradient colors={gradient.sunset} />}
      <View style={{ padding: 2.5, borderRadius: outer / 2, backgroundColor: c.bg }}>
        <Avatar mediaId={user.avatarMediaId} look={user.avatarStyle} name={user.displayName ?? user.username} size={size - 3} />
      </View>
    </View>
  );
}

/** Horizontal tray: "Your story" first, then friends with something posted in the last 24 h (unseen first). */
export function StoryTray() {
  const c = useColors();
  const router = useRouter();
  const me = useSession((s) => s.me);
  const feed = useStoryFeed();
  const mine = feed.data?.mine;
  const friends = feed.data?.friends ?? [];
  if (!me) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.xs }} style={{ marginHorizontal: -space.xs, flexGrow: 0 }}>
      <Appear>
        <View style={{ alignItems: 'center', width: SIZE + 12 }}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={mine ? `Your story, ${mine.stories.length} photo${mine.stories.length === 1 ? '' : 's'}. Long press to add` : 'Add to your story'}
            scaleTo={0.92}
            onPress={() => (mine ? router.push(`/story/${me.id}`) : router.push({ pathname: '/camera', params: { to: 'story' } }))}
            onLongPress={() => router.push({ pathname: '/camera', params: { to: 'story' } })}
          >
            <StoryRing user={me} state={mine ? 'seen' : 'none'} />
            <View style={{ position: 'absolute', right: 2, bottom: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: c.brand, borderWidth: 2.5, borderColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={14} color="#fff" />
            </View>
          </PressScale>
          <Text variant="caption" numberOfLines={1} style={{ marginTop: 4 }}>
            Your story
          </Text>
        </View>
      </Appear>
      {friends.map((g, i) => (
        <Appear key={g.user.id} index={i + 1}>
          <View style={{ alignItems: 'center', width: SIZE + 12 }}>
            <PressScale accessibilityRole="button" accessibilityLabel={`${g.user.displayName ?? g.user.username}'s story${g.unseen ? ', new' : ''}`} scaleTo={0.92} onPress={() => router.push(`/story/${g.user.id}`)}>
              <StoryRing user={g.user} state={g.unseen ? 'unseen' : 'seen'} />
            </PressScale>
            <Text variant="caption" numberOfLines={1} color={g.unseen ? c.text : c.textMuted} style={{ marginTop: 4 }}>
              {g.user.displayName ?? g.user.username}
            </Text>
          </View>
        </Appear>
      ))}
      {!friends.length && feed.isSuccess && (
        <View style={{ justifyContent: 'center', maxWidth: 200 }}>
          <Text variant="caption" muted>
            Friends’ stories show up here for 24 hours.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
