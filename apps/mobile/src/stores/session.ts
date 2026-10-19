import { create } from 'zustand';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { INTRO_KEY } from '@/lib/query';
import { api, refreshSession, tokens } from '@/api/client';
import type { AuthTokens, Me } from '@/api/types';

type State = {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: Me | null;
  introSeen: boolean | null;
  markIntroSeen: () => Promise<void>;
  restore: () => Promise<void>;
  signIn: (t: AuthTokens) => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  signOut: (opts?: { remote?: boolean }) => Promise<void>;
};

export const deviceName = () => [Device.manufacturer, Device.modelName].filter(Boolean).join(' ').slice(0, 80) || 'Android device';

// Feature teardown hooks (chat DB, location task, socket) register here to avoid import cycles.
const signOutHooks: (() => Promise<void> | void)[] = [];
export const onSignOut = (fn: () => Promise<void> | void) => signOutHooks.push(fn);

export const useSession = create<State>((set, get) => ({
  status: 'loading',
  me: null,
  introSeen: null,

  async markIntroSeen() {
    await SecureStore.setItemAsync(INTRO_KEY, '1');
    set({ introSeen: true });
  },

  async restore() {
    set({ introSeen: (await SecureStore.getItemAsync(INTRO_KEY)) === '1' });
    if (!(await tokens.hasRefresh())) return set({ status: 'signedOut' });
    if (await refreshSession()) {
      const me = await get().refreshMe();
      // Offline at launch with a valid refresh token: stay signed in, data loads when back online.
      set({ status: 'signedIn', me });
    } else {
      set({ status: (await tokens.hasRefresh()) ? 'signedIn' : 'signedOut' });
    }
  },

  async signIn(t) {
    await tokens.save(t);
    const me = await get().refreshMe();
    set({ status: 'signedIn', me });
  },

  async refreshMe() {
    try {
      const me = await api<Me>('/me');
      set({ me });
      return me;
    } catch {
      return get().me;
    }
  },

  async signOut({ remote = true } = {}) {
    if (remote) await api('/auth/logout', { method: 'POST' }).catch(() => {});
    for (const fn of signOutHooks) await Promise.resolve(fn()).catch(() => {});
    await tokens.clear();
    set({ status: 'signedOut', me: null });
  },
}));

tokens.onSignedOut(() => void useSession.getState().signOut({ remote: false }));
