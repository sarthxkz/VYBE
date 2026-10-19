import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { api } from '@/api/client';
import type { FriendLocation } from '@/api/types';

// "X is nearby" alerts, computed on this phone from locations the server already lets us see.
// Nothing new leaves the device, and no push service is involved.
export const NEARBY_M = 250;
const REARM_M = 600; // must move this far apart before the same friend can alert again
const COOLDOWN_MS = 60 * 60 * 1000;
const MAX_FIX_AGE_MS = 10 * 60 * 1000;
const CHANNEL = 'nearby';
const PREF_KEY = 'vybe.nearby.enabled';

export type NearbyState = Record<string, { near: boolean; at: number }>;
export type Alert = { id: string; name: string; meters: number; mood: string | null };

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Pure: who just arrived nearby, and the next state. */
export function nearbyChanges(
  prev: NearbyState,
  me: { lat: number; lng: number },
  friends: FriendLocation[],
  now: number,
) {
  const state: NearbyState = { ...prev };
  const alerts: Alert[] = [];
  for (const f of friends) {
    const l = f.location;
    if (!l || now - new Date(l.receivedAt).getTime() > MAX_FIX_AGE_MS) continue;
    const d = distanceM(me, l);
    const was = prev[f.user.id];
    if (d <= NEARBY_M) {
      if (!was?.near && now - (was?.at ?? 0) >= COOLDOWN_MS) {
        alerts.push({
          id: f.user.id,
          name: f.user.displayName ?? f.user.username ?? 'A friend',
          meters: Math.max(10, Math.round(d / 10) * 10),
          mood: f.user.mood?.emoji ?? null,
        });
        state[f.user.id] = { near: true, at: now };
      } else if (was) state[f.user.id] = { ...was, near: true };
    } else if (d >= REARM_M && was?.near) state[f.user.id] = { ...was, near: false };
  }
  return { state, alerts };
}

export const nearbyEnabled = async () => (await SecureStore.getItemAsync(PREF_KEY)) !== '0';
export const setNearbyEnabled = (on: boolean) => SecureStore.setItemAsync(PREF_KEY, on ? '1' : '0');

const stateFile = () => new File(Paths.document, 'nearby.json');
function readState(): NearbyState {
  try {
    return JSON.parse(stateFile().textSync()) as NearbyState;
  } catch {
    return {};
  }
}

let lastCheck = 0;
/** Called after each location fix (background task or app open). Throttled; never throws. */
export async function checkNearby(me: { lat: number; lng: number }) {
  try {
    if (Date.now() - lastCheck < 60_000 || !(await nearbyEnabled())) return;
    lastCheck = Date.now();
    if ((await Notifications.getPermissionsAsync()).status !== 'granted') return;
    const { friends } = await api<{ friends: FriendLocation[] }>('/locations/friends');
    const { state, alerts } = nearbyChanges(readState(), me, friends, Date.now());
    const f = stateFile();
    if (!f.exists) f.create();
    f.write(JSON.stringify(state));
    if (!alerts.length) return;
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Friends nearby',
      // eslint-disable-next-line import/namespace -- re-exported via `export *`; tsc resolves it, the lint rule can't
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      enableVibrate: true,
    });
    for (const a of alerts) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `👋 ${a.name} is nearby`,
          body: `About ${a.meters} m away${a.mood ? ` · ${a.mood}` : ''}`,
          data: { url: `/user/${a.id}` },
        },
        trigger: { channelId: CHANNEL },
      });
    }
  } catch {
    // Best effort: a missed alert is fine, a crashed location task is not.
  }
}
