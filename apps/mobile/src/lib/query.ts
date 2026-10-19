import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 2 }, mutations: { retry: 0 } },
});

onlineManager.setEventListener((set) => NetInfo.addEventListener((s) => set(s.isConnected !== false)));
AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));

export const INTRO_KEY = 'vybe.introSeen';
