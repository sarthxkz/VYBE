import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { API_URL } from '@/api/client';

/**
 * Sends a failure's code and message (never message content, keys or tokens) to the server log, for problems
 * that don't crash a screen, e.g. a chat message that can't be encrypted. Fire-and-forget.
 */
export function reportError(where: string, e: unknown) {
  const err = (e ?? {}) as { code?: string; status?: number; message?: string; stack?: string; step?: string };
  const message = [`[${where}${err.step ? `:${err.step}` : ''}]`, err.code, err.status, err.message ?? String(e)].filter(Boolean).join(' ');
  void fetch(`${API_URL}/v1/client-errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message.slice(0, 500), stack: err.stack?.slice(0, 4000), version: Constants.expoConfig?.version, updateId: Updates.updateId ?? undefined }),
  }).catch(() => {});
}

/** Runs one step and tags a failure with its name, so reports say where it broke. */
export async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e && typeof e === 'object') (e as { step?: string }).step ??= name;
    throw e;
  }
}
