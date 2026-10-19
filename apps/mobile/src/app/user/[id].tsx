import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { PublicUser, Relationship } from '@/api/types';
import { confirm, useFriendActions, useRequests } from '@/features/friends/hooks';
import { ReportButton } from '@/features/ReportButton';
import { Avatar, Button, ErrorState, Screen, Skeleton, Text } from '@/ui';
import { space } from '@/theme';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const act = useFriendActions();
  const requests = useRequests();
  const user = useQuery({ queryKey: ['user', id], queryFn: () => api<PublicUser & { relationship: Relationship }>(`/users/${id}`) });

  if (user.isPending) return <Screen><Skeleton height={240} style={{ marginTop: space.xxl }} /></Screen>;
  if (user.isError || !user.data) return <Screen><ErrorState message="This profile isn’t available." onRetry={() => router.back()} /></Screen>;
  const u = user.data;
  const name = u.displayName ?? u.username ?? '';
  const incoming = requests.data?.incoming.find((r) => r.user.id === u.id);
  const outgoing = requests.data?.outgoing.find((r) => r.user.id === u.id);

  return (
    <Screen scroll>
      <View style={{ alignItems: 'center', gap: space.sm, marginTop: space.xxl }}>
        <Avatar mediaId={u.avatarMediaId} name={name} size={120} />
        <Text variant="title">{name}</Text>
        <Text muted>@{u.username}</Text>
        {u.bio ? <Text style={{ textAlign: 'center' }}>{u.bio}</Text> : null}
      </View>
      <View style={{ gap: space.md, marginTop: space.xxl }}>
        {u.relationship === 'friends' && (
          <>
            <Button title="Message" onPress={() => router.replace(`/chat/${u.id}`)} />
            <Button title="Remove friend" kind="secondary" onPress={() => confirm(`Remove ${name}?`, 'You’ll stop seeing each other’s location and won’t be able to message.', 'Remove', () => act.remove.mutate(u.id))} />
          </>
        )}
        {u.relationship === 'none' && <Button title="Add friend" kind="action" loading={act.send.isPending} onPress={() => act.send.mutate(u.id)} />}
        {u.relationship === 'request_received' && incoming && (
          <>
            <Button title="Accept request" onPress={() => act.accept.mutate(incoming.id)} />
            <Button title="Decline" kind="secondary" onPress={() => act.reject.mutate(incoming.id)} />
          </>
        )}
        {u.relationship === 'request_sent' && outgoing && <Button title="Cancel request" kind="secondary" onPress={() => act.cancel.mutate(outgoing.id)} />}
        {u.relationship !== 'self' && (
          <>
            <Button
              title={`Block ${name}`}
              kind="ghost"
              onPress={() =>
                confirm(`Block ${name}?`, 'They won’t be able to find you, message you, see your location or send you photos. They aren’t notified.', 'Block', () =>
                  act.block.mutate(u.id, { onSuccess: () => (Alert.alert('Blocked', `${name} is blocked.`), router.back()) }),
                )
              }
            />
            <ReportButton targetUserId={u.id} name={name} />
          </>
        )}
      </View>
    </Screen>
  );
}
