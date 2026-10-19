import { AppState } from 'react-native';
import { API_URL, refreshSession, tokens } from '@/api/client';

export type ServerEvent = { type: string; data: Record<string, unknown> };
type Listener = (e: ServerEvent) => void;

const listeners = new Set<Listener>();
let ws: WebSocket | null = null;
let attempt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let wanted = false;
const statusListeners = new Set<(connected: boolean) => void>();

export const subscribe = (fn: Listener) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
export const onConnectionChange = (fn: (c: boolean) => void) => {
  statusListeners.add(fn);
  return () => void statusListeners.delete(fn);
};

function schedule() {
  if (!wanted || timer) return;
  // Exponential backoff with jitter, capped at 30s.
  const delay = Math.min(30_000, 1000 * 2 ** attempt) * (0.5 + Math.random() / 2);
  attempt++;
  timer = setTimeout(() => {
    timer = null;
    void open();
  }, delay);
}

async function open() {
  if (!wanted || ws) return;
  if (!tokens.access && !(await refreshSession())) return schedule();
  // RN's WebSocket accepts headers, so the token never appears in URLs or proxy logs.
  const WS = WebSocket as unknown as new (url: string, protocols: undefined, opts: { headers: Record<string, string> }) => WebSocket;
  const sock = new WS(`${API_URL.replace(/^http/, 'ws')}/ws`, undefined, { headers: { Authorization: `Bearer ${tokens.access}` } });
  ws = sock;
  sock.onopen = () => {
    attempt = 0;
    statusListeners.forEach((f) => f(true));
  };
  sock.onmessage = (m) => {
    try {
      const ev = JSON.parse(String(m.data)) as ServerEvent;
      listeners.forEach((f) => f(ev));
    } catch {}
  };
  sock.onclose = async (e) => {
    ws = null;
    statusListeners.forEach((f) => f(false));
    if (e.code === 4001) await refreshSession(); // token expired or session ended
    schedule();
  };
  sock.onerror = () => sock.close();
}

export function connectRealtime() {
  wanted = true;
  void open();
}

export function disconnectRealtime() {
  wanted = false;
  if (timer) clearTimeout(timer);
  timer = null;
  ws?.close(1000);
  ws = null;
}

export function sendEvent(e: { type: string; data?: unknown }) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(e));
}

// Reconnect promptly when the app returns to the foreground.
AppState.addEventListener('change', (s) => {
  if (s === 'active' && wanted && !ws) {
    attempt = 0;
    void open();
  }
});
