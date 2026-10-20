import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

export const API_URL: string = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://10.0.2.2:3000';
const REFRESH_KEY = 'vybe.refreshToken';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Tokens = { accessToken: string; refreshToken: string };

// Access token lives only in memory; refresh token in Keystore-backed SecureStore.
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: (() => void) | null = null;

export const tokens = {
  get access() {
    return accessToken;
  },
  async save(t: Tokens) {
    accessToken = t.accessToken;
    await SecureStore.setItemAsync(REFRESH_KEY, t.refreshToken, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  async clear() {
    accessToken = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
  hasRefresh: async () => !!(await SecureStore.getItemAsync(REFRESH_KEY)),
  onSignedOut(fn: () => void) {
    onSignedOut = fn;
  },
};

/** Single-flight refresh: concurrent 401s share one rotation (a second use would trip reuse detection). */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const rt = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!rt) return false;
      const post = (token: string) =>
        fetch(`${API_URL}/v1/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: token }) });
      let res = await post(rt);
      if (res.status === 401) {
        // The headless location task (another JS runtime) may have rotated the token first: use the stored one.
        await new Promise((r) => setTimeout(r, 500));
        const latest = await SecureStore.getItemAsync(REFRESH_KEY);
        if (latest && latest !== rt) res = await post(latest);
      }
      if (res.status === 401) {
        const code = (await res.clone().json().catch(() => null))?.error?.code;
        if (code === 'REFRESH_RACE') return false; // transient: the other runtime will store the new token

        await tokens.clear();
        onSignedOut?.();
        return false;
      }
      if (!res.ok) return false; // transient: keep the refresh token, try later
      await tokens.save(await res.json());
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

type Opts = { method?: string; body?: unknown; form?: FormData; auth?: boolean; signal?: AbortSignal };

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const { method = opts.body || opts.form ? 'POST' : 'GET', body, form, auth = true, signal } = opts;
  const send = () =>
    fetch(`${API_URL}/v1${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(auth && accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  let res: Response;
  try {
    if (auth && !accessToken) await refreshSession();
    res = await send();
    if (auth && res.status === 401 && (await refreshSession())) res = await send();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', "Can't reach Vybe right now. Check your connection.");
  }
  if (res.ok) {
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  let code = 'HTTP_' + res.status;
  let message = 'Something went wrong. Please try again.';
  try {
    const j = await res.json();
    code = j.error?.code ?? code;
    message = j.error?.message ?? message;
  } catch {}
  throw new ApiError(res.status, code, message);
}

/** expo-image source for an authenticated media download. cacheKey keeps cache stable across token rotation. */
/** A GIF through our GIPHY proxy (the phone never contacts GIPHY). */
export const gifSource = (gifId: string, variant: 'small' | 'full' = 'small') => ({
  uri: `${API_URL}/v1/gifs/${gifId}/${variant}`,
  headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  cacheKey: `gif-${gifId}-${variant}`,
});

export const mediaSource = (id: string) => ({
  uri: `${API_URL}/v1/media/${id}`,
  headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  cacheKey: `media-${id}`,
});
