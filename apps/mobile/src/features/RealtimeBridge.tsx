import { useEffect } from 'react';
import { reportError } from '@/lib/report';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import Signal from '@modules/vybe-signal';
import { connectRealtime, disconnectRealtime, subscribe } from '@/lib/realtime';
import { queryClient } from '@/lib/query';
import { api } from '@/api/client';
import type { LocationSettings } from '@/api/types';
import { onSignOut, useSession } from '@/stores/session';
import { ensureKeys, retryUnsent, startChatRealtime, syncInbox } from './chat/service';
import { conversations, wipeChatDb } from './chat/db';
import { forgetBackupKey, maybeBackup, shouldOfferRestore } from './chat/backup';
import { AppState } from 'react-native';
import { startTracking, stopTracking } from './location/tracking';
import { registerPush, watchPushTokenRotation } from './notifications';

// Everything a signed-in session needs running in the background; torn down on sign-out.
onSignOut(async () => {
  disconnectRealtime();
  await stopTracking();
  await wipeChatDb();
  await forgetBackupKey().catch(() => {});
  await Signal.wipe().catch(() => {});
  queryClient.clear();
});

export function RealtimeBridge() {
  const me = useSession((s) => s.me);

  useEffect(() => {
    if (!me?.id) return;
    connectRealtime();
    const offChat = startChatRealtime();
    const offPush = watchPushTokenRotation();
    // Encrypted chat backup runs when the app goes to the background (at most every 30 min).
    const bg = AppState.addEventListener('change', (s) => s === 'background' && void maybeBackup());
    // Tapping a "friend nearby" alert opens their profile. Only our own in-app paths are followed.
    const tap = Notifications.addNotificationResponseReceivedListener((r) => {
      const url = r.notification.request.content.data?.url;
      if (typeof url === 'string' && /^\/user\/[0-9a-f-]{36}$/.test(url)) router.push(url as `/user/${string}`);
    });
    const offEvents = subscribe((ev) => {
      const inv = (key: string) => void queryClient.invalidateQueries({ queryKey: [key] });
      if (ev.type.startsWith('friend:')) {
        inv('friends');
        inv('requests');
        inv('locations');
      }
      if (ev.type === 'photo:new') inv('photos');
      if (ev.type === 'presence') inv('friends');
      if (ev.type === 'location:update' || ev.type === 'location:removed') inv('locations');
    });

    void (async () => {
      await ensureKeys(me.id).catch((e) => reportError('chat-keys', e));
      await syncInbox().catch((e) => reportError('chat-sync', e));
      await retryUnsent().catch(() => {});
      if (await shouldOfferRestore((await conversations().catch(() => [])).length)) router.push('/restore-chats');
      await registerPush(false);
      // Recover location sharing after an app restart: follow the server's state, not stale local state.
      const s = await api<LocationSettings>('/locations/settings').catch(() => null);
      if (s?.active) await startTracking();
      else if (s) await stopTracking();
    })();

    return () => {
      offChat();
      offPush();
      tap.remove();
      bg.remove();
      offEvents();
      disconnectRealtime();
    };
  }, [me?.id]);

  return null;
}
