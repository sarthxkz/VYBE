import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

// Apply over-the-air updates right away. By default expo-updates downloads in the background and only switches on
// the next cold start, which Android rarely does, so updates seemed never to arrive. Here: at launch and whenever
// the app comes back to the foreground, check, download and restart into the new version (takes a second or two).
let busy = false;
let lastCheck = 0;

export async function applyUpdateNow() {
  if (__DEV__ || !Updates.isEnabled || busy || Date.now() - lastCheck < 60_000) return;
  busy = true;
  lastCheck = Date.now();
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    const fetched = await Updates.fetchUpdateAsync();
    if (fetched.isNew) await Updates.reloadAsync();
  } catch {
    // Offline or server busy: try again next time the app opens.
  } finally {
    busy = false;
  }
}

export function useOtaUpdates() {
  useEffect(() => {
    void applyUpdateNow();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void applyUpdateNow());
    return () => sub.remove();
  }, []);
}
