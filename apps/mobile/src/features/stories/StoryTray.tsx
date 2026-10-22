import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/api/client';
import type { PublicUser, StoryFeed } from '@/api/types';
import { useSession } from '@/stores/session';
import { Appear, Avatar, PressScale, SpinningGradient, Text } from '@/ui';
import { gradient, shadow, space, useColors } from '@/theme';

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

/**
 * Horizontal tray: "Your story" first, then friends with something posted in the last 24 h (unseen first).
 * `compact` is the floating version on the map: smaller rings on a card, no empty-state hint.
 */
export function StoryTray({ compact }: { compact?: boolean }) {
  const c = useColors();
  const router = useRouter();
  const me = useSession((s) => s.me);
  const feed = useStoryFeed();
  const mine = feed.data?.mine;
  const friends = feed.data?.friends ?? [];
  const size = compact ? 46 : SIZE;
  const label = compact ? { marginTop: 3, fontSize: 11 } : { marginTop: 4 };
  if (!me) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: compact ? space.sm : space.md, paddingVertical: compact ? 6 : space.sm, paddingHorizontal: compact ? space.sm : space.xs }}
      style={compact ? [{ flexGrow: 0, alignSelf: 'flex-start', maxWidth: '100%', marginTop: space.sm, borderRadius: 24, backgroundColor: c.surface }, shadow.card] : { marginHorizontal: -space.xs, flexGrow: 0 }}
    >
      <Appear>
        <View style={{ alignItems: 'center', width: size + 12 }}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={mine ? `Your story, ${mine.stories.length} photo${mine.stories.length === 1 ? '' : 's'}. Long press to add` : 'Add to your story'}
            scaleTo={0.9}
            onPress={() => (mine ? router.push(`/story/${me.id}`) : router.push({ pathname: '/camera', params: { to: 'story' } }))}
            onLongPress={() => router.push({ pathname: '/camera', params: { to: 'story' } })}
          >
            <StoryRing user={me} state={mine ? 'seen' : 'none'} size={size} />
            <View style={{ position: 'absolute', right: 1, bottom: 1, width: compact ? 18 : 22, height: compact ? 18 : 22, borderRadius: 11, backgroundColor: c.brand, borderWidth: 2.5, borderColor: compact ? c.surface : c.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={compact ? 11 : 14} color="#fff" />
            </View>
          </PressScale>
          <Text variant="caption" numberOfLines={1} style={label}>
            {compact ? 'You' : 'Your story'}
          </Text>
        </View>
      </Appear>
      {friends.map((g, i) => (
        <Appear key={g.user.id} index={i + 1}>
          <View style={{ alignItems: 'center', width: size + 12 }}>
            <PressScale accessibilityRole="button" accessibilityLabel={`${g.user.displayName ?? g.user.username}'s story${g.unseen ? ', new' : ''}`} scaleTo={0.9} onPress={() => router.push(`/story/${g.user.id}`)}>
              <StoryRing user={g.user} state={g.unseen ? 'unseen' : 'seen'} size={size} />
            </PressScale>
            <Text variant="caption" numberOfLines={1} color={g.unseen ? c.text : c.textMuted} style={label}>
              {(g.user.displayName ?? g.user.username ?? '').split(' ')[0]}
            </Text>
          </View>
        </Appear>
      ))}
      {!friends.length && feed.isSuccess && !compact && (
        <View style={{ justifyContent: 'center', maxWidth: 200 }}>
          <Text variant="caption" muted>
            Friends’ stories show up here for 24 hours.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
