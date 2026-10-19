import { useEffect, useState } from 'react';
import { FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { PublicUser, Relationship } from '@/api/types';
import { errorText } from '@/copy';
import { useFriendActions } from '@/features/friends/hooks';
import { Avatar, Button, EmptyState, Input, ListItem, Screen, Text } from '@/ui';
import { space } from '@/theme';

export default function AddFriends() {
  const router = useRouter();
  const act = useFriendActions();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim().toLowerCase()), 350);
    return () => clearTimeout(t);
  }, [q]);
  const valid = /^[a-z0-9_.]{3,20}$/.test(debounced);
  const search = useQuery({
    queryKey: ['search', debounced],
    enabled: valid,
    queryFn: () => api<{ users: (PublicUser & { relationship: Relationship })[] }>(`/users/search?q=${encodeURIComponent(debounced)}`),
  });

  return (
    <Screen edges={['bottom']}>
      <Input label="Search by username" value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} placeholder="e.g. maya.k" style={{ marginTop: space.md }} />
      <Button title="Invite from contacts or any app" kind="secondary" onPress={() => router.push('/friends/invite')} />
      {search.isError && <Text>{errorText(search.error)}</Text>}
      <FlatList
        data={valid ? (search.data?.users ?? []) : []}
        keyExtractor={(u) => u.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !valid ? (
            <EmptyState emoji="🔎" title="Find your people" body="Type at least 3 characters of a username." />
          ) : search.isSuccess ? (
            <EmptyState emoji="🤷" title="No one by that name" body="Check the spelling, or ask your friend for their exact username." />
          ) : undefined
        }
        renderItem={({ item }) => (
          <ListItem
            title={item.displayName ?? item.username ?? ''}
            subtitle={`@${item.username}`}
            left={<Avatar mediaId={item.avatarMediaId} look={item.avatarStyle} name={item.displayName ?? item.username} />}
            onPress={() => router.push(`/user/${item.id}`)}
            right={
              item.relationship === 'none' ? (
                <Button title="Add" style={{ minHeight: 40 }} loading={act.send.isPending && act.send.variables === item.id} onPress={() => act.send.mutate(item.id)} />
              ) : (
                <Text variant="label" muted>
                  {{ friends: 'Friends', request_sent: 'Requested', request_received: 'Wants to add you', self: 'You' }[item.relationship]}
                </Text>
              )
            }
          />
        )}
      />
    </Screen>
  );
}
