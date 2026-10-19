import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { PublicUser } from '@/api/types';
import { Button, EmptyState, Screen, Skeleton } from '@/ui';

// Target of vybe://invite/<username> (from the invite page): find that exact username and open their profile.
export default function InviteLink() {
  const router = useRouter();
  const raw = useLocalSearchParams<{ username: string }>().username ?? '';
  const username = raw.toLowerCase();
  const valid = /^[a-z0-9_.]{3,20}$/.test(username);
  const found = useQuery({
    queryKey: ['invite', username],
    enabled: valid,
    queryFn: async () =>
      (
        await api<{ users: PublicUser[] }>(`/users/search?q=${encodeURIComponent(username)}`)
      ).users.find((u) => u.username === username) ?? null,
  });

  useEffect(() => {
    if (found.data) router.replace(`/user/${found.data.id}`);
  }, [found.data, router]);

  if (valid && (found.isPending || found.data))
    return (
      <Screen>
        <Skeleton height={120} />
      </Screen>
    );
  return (
    <Screen>
      <EmptyState
        emoji="🔎"
        title="We couldn’t find that invite"
        body={valid ? `There’s no one called @${username} on Vybe.` : 'The link looks broken.'}
        action={<Button title="Find friends" onPress={() => router.replace('/friends/add')} />}
      />
    </Screen>
  );
}
