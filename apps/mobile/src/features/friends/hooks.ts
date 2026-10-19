import { Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Friend, FriendRequest } from '@/api/types';
import { errorText } from '@/copy';

export const useFriends = () => useQuery({ queryKey: ['friends'], queryFn: () => api<{ friends: Friend[] }>('/friends') });
export const useRequests = () =>
  useQuery({ queryKey: ['requests'], queryFn: () => api<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>('/friends/requests') });

/** All relationship mutations refresh the same caches. */
export function useFriendActions() {
  const qc = useQueryClient();
  const done = () => {
    for (const k of ['friends', 'requests', 'locations', 'user', 'search']) void qc.invalidateQueries({ queryKey: [k] });
  };
  const useM = <A,>(fn: (a: A) => Promise<unknown>) => useMutation({ mutationFn: fn, onSuccess: done, onError: (e) => Alert.alert('That didn’t work', errorText(e)) });
  return {
    send: useM((userId: string) => api('/friends/requests', { body: { userId } })),
    accept: useM((id: string) => api(`/friends/requests/${id}/accept`, { method: 'POST' })),
    reject: useM((id: string) => api(`/friends/requests/${id}/reject`, { method: 'POST' })),
    cancel: useM((id: string) => api(`/friends/requests/${id}`, { method: 'DELETE' })),
    remove: useM((userId: string) => api(`/friends/${userId}`, { method: 'DELETE' })),
    block: useM((userId: string) => api('/blocks', { body: { userId } })),
    unblock: useM((userId: string) => api(`/blocks/${userId}`, { method: 'DELETE' })),
  };
}

export const confirm = (title: string, message: string, action: string, onYes: () => void) =>
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onYes },
  ]);
