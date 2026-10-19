// Binary helpers (Hermes provides atob/btoa, TextEncoder/TextDecoder).
export const utf8ToB64 = (s: string) => bytesToB64(new TextEncoder().encode(s));
export const b64ToUtf8 = (b64: string) => new TextDecoder().decode(b64ToBytes(b64));

export function bytesToB64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
