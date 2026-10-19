import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api, ApiError } from '@/api/client';
import { checkNearby } from './nearby';

export const LOCATION_TASK = 'vybe-location-sharing';
/** Requested cadence. Android may deliver less often (Doze, battery saver); the UI shows real age, not this. */
export const TARGET_INTERVAL_MS = 120_000;
/** Ignore bursts: never upload more often than this. */
const MIN_GAP_MS = 90_000;

let lastSentAt = 0;
let lastSent: { lat: number; lng: number } | null = null;
let foregroundWatch: Location.LocationSubscription | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Upload one fix, with dedupe and bounded exponential backoff for transient failures. */
export async function uploadFix(loc: Location.LocationObject): Promise<'sent' | 'skipped' | 'stopped' | 'failed'> {
  const now = Date.now();
  const moved = !lastSent || Math.abs(lastSent.lat - loc.coords.latitude) + Math.abs(lastSent.lng - loc.coords.longitude) > 0.0002;
  if (now - lastSentAt < MIN_GAP_MS && !moved) return 'skipped';
  if (now - lastSentAt < 20_000) return 'skipped'; // server minimum gap
  const body = {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? null,
    capturedAt: new Date(loc.timestamp).toISOString(),
  };
  for (let i = 0; i < 4; i++) {
    try {
      await api('/locations', { body });
      lastSentAt = Date.now();
      lastSent = { lat: body.lat, lng: body.lng };
      return 'sent';
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SHARING_OFF') {
        await stopTracking();
        return 'stopped';
      }
      // 4xx other than rate-limit: the fix is invalid (e.g. too old); retrying will not help.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) return 'failed';
      await sleep(2000 * 2 ** i);
    }
  }
  return 'failed';
}

/** Every fix: upload it, then see whether a friend just came close (local notification). */
async function onFix(loc: Location.LocationObject) {
  if ((await uploadFix(loc)) !== 'stopped') await checkNearby({ lat: loc.coords.latitude, lng: loc.coords.longitude });
}

// Must be defined at module scope so Android can run it headless after the app is killed.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const latest = data.locations.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
  await onFix(latest);
});

export type PermissionLevel = 'none' | 'foreground' | 'background';

export async function permissionLevel(): Promise<PermissionLevel> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) return 'none';
  const bg = await Location.getBackgroundPermissionsAsync();
  return bg.granted ? 'background' : 'foreground';
}

/**
 * Starts the best collection mode the user has allowed:
 * background → foreground service at the 2-minute target; foreground-only → updates while the app is open.
 */
export async function startTracking(): Promise<PermissionLevel> {
  const level = await permissionLevel();
  if (level === 'none' || !(await Location.hasServicesEnabledAsync())) return 'none';
  if (level === 'background') {
    if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false))) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: TARGET_INTERVAL_MS,
        distanceInterval: 0,
        deferredUpdatesInterval: TARGET_INTERVAL_MS,
        foregroundService: {
          notificationTitle: 'Sharing your location on Vybe',
          notificationBody: 'Only the friends you chose can see it. Tap to manage or turn off.',
          notificationColor: '#6C4CF5',
          killServiceOnDestroy: false,
        },
      });
    }
  } else if (!foregroundWatch) {
    foregroundWatch = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: TARGET_INTERVAL_MS, distanceInterval: 0 },
      (loc) => void onFix(loc),
    );
  }
  // Send one fix right away so friends don't wait for the first interval.
  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    .then((loc) => onFix(loc))
    .catch(() => {});
  return level;
}

export async function stopTracking() {
  foregroundWatch?.remove();
  foregroundWatch = null;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  lastSentAt = 0;
  lastSent = null;
}

/** Fresh / stale / unavailable, from the server's receivedAt (never from the requested interval). */
export function freshness(receivedAt: string | null | undefined, now = Date.now()): 'fresh' | 'stale' | 'unavailable' {
  if (!receivedAt) return 'unavailable';
  const age = now - new Date(receivedAt).getTime();
  if (age < 5 * 60_000) return 'fresh';
  if (age < 60 * 60_000) return 'stale';
  return 'unavailable';
}

export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return 'unknown';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
