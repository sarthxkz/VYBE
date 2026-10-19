import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from '@/api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/**
 * Registers this install's FCM token with the server. Requires google-services.json in the build;
 * without it, this fails quietly and the app relies on the websocket while open.
 */
export async function registerPush(askIfNeeded: boolean) {
  if (Platform.OS !== 'android') return 'unsupported';
  // eslint-disable-next-line import/namespace -- re-exported via `export *`; tsc resolves it, the lint rule can't
  await Notifications.setNotificationChannelAsync('default', { name: 'Vybe', importance: Notifications.AndroidImportance.HIGH });
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && askIfNeeded) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';
  try {
    const { data } = await Notifications.getDevicePushTokenAsync();
    await api('/me/push-token', { method: 'PUT', body: { token: String(data) } });
    return 'registered';
  } catch {
    return 'unavailable';
  }
}

export function watchPushTokenRotation() {
  const sub = Notifications.addPushTokenListener(({ data }) => {
    void api('/me/push-token', { method: 'PUT', body: { token: String(data) } }).catch(() => {});
  });
  return () => sub.remove();
}
