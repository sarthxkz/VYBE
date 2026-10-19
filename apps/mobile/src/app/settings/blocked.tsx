import { FlatList } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { PublicUser } from '@/api/types';
import { useFriendActions } from '@/features/friends/hooks';
import { Avatar, Button, EmptyState, ListItem, Screen } from '@/ui';

export default function Blocked() {
  const qc = useQueryClient();
  const act = useFriendActions();
  const q = useQuery({ queryKey: ['blocks'], queryFn: () => api<{ blocked: PublicUser[] }>('/blocks') });
  return (
    <Screen edges={['bottom']}>
      <FlatList
        data={q.data?.blocked ?? []}
        keyExtractor={(u) => u.id}
        ListEmptyComponent={q.isSuccess ? <EmptyState emoji="🕊️" title="No one is blocked" body="People you block can’t find you, message you, see your location or send you photos." /> : undefined}
        renderItem={({ item }) => (
          <ListItem
            title={item.displayName ?? item.username ?? ''}
            subtitle={`@${item.username}`}
            left={<Avatar mediaId={item.avatarMediaId} name={item.displayName ?? item.username} />}
            right={<Button title="Unblock" kind="secondary" style={{ minHeight: 40 }} onPress={() => act.unblock.mutate(item.id, { onSuccess: () => qc.invalidateQueries({ queryKey: ['blocks'] }) })} />}
          />
        )}
      />
    </Screen>
  );
}
