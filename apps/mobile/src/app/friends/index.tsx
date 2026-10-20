import { FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFriendActions, useFriends, useRequests } from '@/features/friends/hooks';
import { ago } from '@/features/location/tracking';
import { Avatar, Button, EmptyState, ErrorState, ListItem, Row, Screen, SectionTitle, Skeleton, Text } from '@/ui';
import { space, useColors } from '@/theme';

export default function FriendsScreen() {
  const c = useColors();
  const router = useRouter();
  const friends = useFriends();
  const requests = useRequests();
  const act = useFriendActions();
  const incoming = requests.data?.incoming ?? [];
  const outgoing = requests.data?.outgoing ?? [];

  return (
    <Screen edges={['bottom']}>
      <FlatList
        data={friends.data?.friends ?? []}
        keyExtractor={(f) => f.id}
        refreshing={friends.isRefetching}
        onRefresh={() => {
          void friends.refetch();
          void requests.refetch();
        }}
        ListHeaderComponent={
          <View>
            <Row style={{ marginTop: space.md }}>
              <Button title="Add friends" kind="action" style={{ flex: 1 }} onPress={() => router.push('/friends/add')} />
              <Button title="Invite contacts" kind="secondary" style={{ flex: 1 }} onPress={() => router.push('/friends/invite')} />
            </Row>
            {incoming.length > 0 && <SectionTitle>{`Requests (${incoming.length})`}</SectionTitle>}
            {incoming.map((r) => (
              <ListItem
                key={r.id}
                title={r.user.displayName ?? r.user.username ?? ''}
                subtitle={`@${r.user.username} wants to be friends`}
                left={<Avatar mediaId={r.user.avatarMediaId} look={r.user.avatarStyle} name={r.user.displayName ?? r.user.username} />}
                onPress={() => router.push(`/user/${r.user.id}`)}
                right={
                  <Row gap={space.xs}>
                    <Button title="Accept" style={{ minHeight: 40, paddingHorizontal: space.lg }} onPress={() => act.accept.mutate(r.id)} />
                    <Button title="Decline" kind="ghost" style={{ minHeight: 40, paddingHorizontal: space.sm }} onPress={() => act.reject.mutate(r.id)} />
                  </Row>
                }
              />
            ))}
            {outgoing.length > 0 && <SectionTitle>Sent</SectionTitle>}
            {outgoing.map((r) => (
              <ListItem
                key={r.id}
                title={r.user.displayName ?? r.user.username ?? ''}
                subtitle="Request pending"
                left={<Avatar mediaId={r.user.avatarMediaId} look={r.user.avatarStyle} name={r.user.displayName ?? r.user.username} />}
                right={<Button title="Cancel" kind="ghost" style={{ minHeight: 40 }} onPress={() => act.cancel.mutate(r.id)} />}
              />
            ))}
            <SectionTitle>{`Friends${friends.data ? ` (${friends.data.friends.length})` : ''}`}</SectionTitle>
            {friends.isPending && [0, 1, 2].map((i) => <Skeleton key={i} />)}
            {friends.isError && <ErrorState onRetry={() => friends.refetch()} />}
          </View>
        }
        ListEmptyComponent={
          friends.isSuccess ? <EmptyState emoji="👋" title="No friends yet" body="Search for friends by username and send a request." /> : undefined
        }
        renderItem={({ item }) => (
          <ListItem
            title={item.displayName ?? item.username ?? ''}
            subtitle={item.online ? 'Online' : item.lastActiveAt ? `Active ${ago(item.lastActiveAt)}` : `@${item.username}`}
            left={<Avatar mediaId={item.avatarMediaId} look={item.avatarStyle} name={item.displayName ?? item.username} ring={item.online ? c.live : undefined} />}
            onPress={() => router.push(`/user/${item.id}`)}
            right={
              <Pressable accessibilityRole="button" accessibilityLabel={`Message ${item.displayName ?? item.username}`} hitSlop={12} onPress={() => router.push(`/chat/${item.id}`)}>
                <Text variant="label" color={c.link}>
                  Message
                </Text>
              </Pressable>
            }
          />
        )}
      />
    </Screen>
  );
}
