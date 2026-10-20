import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { api } from '@/api/client';
import type { Friend, PhotoPost } from '@/api/types';

// Local notifications for messages, photos and Blinks, raised on this phone (no push service involved, so nothing
// leaves the device). Works while the app is open or in the background, and from the background location task.
// shortcut: with the app fully closed and sharing off nothing runs; real FCM push needs a Firebase project.
const VIBRATE = [0, 300, 120, 300];
let channelsReady: Promise<void> | null = null;

function ensureChannels() {
  channelsReady ??= (async () => {
    for (const [id, name] of [['messages', 'Messages'], ['photos', 'Photos & Blinks']] as const) {
      await Notifications.setNotificationChannelAsync(id, {
        name,
        // eslint-disable-next-line import/namespace -- re-exported via `export *`; tsc resolves it, the lint rule can't
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: VIBRATE,
        enableVibrate: true,
        showBadge: true,
      });
    }
  })().catch(() => {
    channelsReady = null;
  });
  return channelsReady;
}

/** The chat currently on screen (no alert for messages you're already looking at). */
let activeChat: string | null = null;
export const setActiveChat = (peerId: string | null) => {
  activeChat = peerId;
};

const names = new Map<string, string>();
async function nameOf(userId: string) {
  if (!names.has(userId)) {
    const { friends } = await api<{ friends: Friend[] }>('/friends').catch(() => ({ friends: [] as Friend[] }));
    for (const f of friends) names.set(f.id, f.displayName ?? f.username ?? 'A friend');
  }
  return names.get(userId) ?? 'A friend';
}

async function notify(channelId: 'messages' | 'photos', title: string, body: string, url: string) {
  try {
    if ((await Notifications.getPermissionsAsync()).status !== 'granted') return;
    await ensureChannels();
    await Notifications.scheduleNotificationAsync({ content: { title, body, data: { url }, sound: true }, trigger: { channelId } });
  } catch {
    // never let an alert break message handling
  }
}

/** Called for each newly received chat item. */
export async function alertMessage(senderId: string, kind: 'text' | 'image' | 'gif' | 'sticker', text: string | null) {
  if (AppState.currentState === 'active' && activeChat === senderId) return;
  const body = kind === 'text' ? (text ?? '').slice(0, 120) : kind === 'image' ? '📷 Sent a photo' : kind === 'gif' ? 'Sent a GIF' : '✨ Sent a sticker';
  await notify('messages', `💬 ${await nameOf(senderId)}`, body, `/chat/${senderId}`);
}

export async function alertPhoto(senderId: string, blink: boolean) {
  await notify('photos', blink ? `✨ ${await nameOf(senderId)} sent you a Blink` : `📸 ${await nameOf(senderId)} sent you a photo`, blink ? 'Open it once before it’s gone.' : 'Tap to see it.', '/photos');
}

const LAST_PHOTO = 'vybe.alerts.lastPhoto';
/** Background check for photos/Blinks that arrived while the socket wasn't connected. */
export async function checkNewPhotos() {
  try {
    const { items } = await api<{ items: PhotoPost[] }>('/photos/inbox');
    const last = Number((await SecureStore.getItemAsync(LAST_PHOTO)) ?? 0);
    const fresh = items.filter((p) => Date.parse(p.createdAt) > last && !p.viewedAt).slice(0, 3);
    if (!last) {
      // First run on this phone: remember where we are instead of alerting about old photos.
      if (items[0]) await SecureStore.setItemAsync(LAST_PHOTO, String(Date.parse(items[0].createdAt)));
      return;
    }
    for (const p of fresh) await alertPhoto(p.sender.id, p.instant);
    if (items[0]) await SecureStore.setItemAsync(LAST_PHOTO, String(Math.max(last, Date.parse(items[0].createdAt))));
  } catch {
    // offline: try again on the next location fix
  }
}

/** Ask once (Android 13+ needs it) so alerts can show. */
export async function askForAlerts() {
  const p = await Notifications.getPermissionsAsync().catch(() => null);
  if (p && p.status !== 'granted' && p.canAskAgain) await Notifications.requestPermissionsAsync().catch(() => {});
}
