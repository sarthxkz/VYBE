import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { api, API_URL, ApiError, refreshSession, tokens } from '@/api/client';

export type Prepared = { uri: string; width: number; height: number };

/**
 * Re-encode to JPEG at a bounded size. Re-encoding drops EXIF (GPS, device info) before anything leaves the phone;
 * the server re-encodes again as a second line of defense.
 */
export async function prepareImage(uri: string, maxSide = 2048): Promise<Prepared> {
  const ctx = ImageManipulator.manipulate(uri);
  const probe = await ctx.renderAsync();
  const scale = Math.min(1, maxSide / Math.max(probe.width, probe.height));
  if (scale < 1) ctx.resize({ width: Math.round(probe.width * scale), height: Math.round(probe.height * scale) });
  const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  return { uri: out.uri, width: out.width, height: out.height };
}

export async function pickFromLibrary(square = false): Promise<Prepared | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: square, aspect: square ? [1, 1] : undefined, quality: 1, exif: false });
  if (r.canceled || !r.assets[0]) return null;
  return prepareImage(r.assets[0].uri, square ? 512 : 2048);
}

/** Upload with progress. fetch has no upload progress in RN, so this uses XHR (with one refresh-and-retry on 401). */
export async function uploadImage(img: Prepared, kind: 'PHOTO' | 'AVATAR', onProgress?: (p: number) => void): Promise<{ id: string }> {
  const form = () => {
    const f = new FormData();
    f.append('kind', kind);
    f.append('file', { uri: img.uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
    return f;
  };
  if (!onProgress) return api<{ id: string }>('/media', { form: form() });
  if (!tokens.access) await refreshSession();
  const send = () =>
    new Promise<{ status: number; text: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/v1/media`);
      xhr.setRequestHeader('Authorization', `Bearer ${tokens.access}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'network'));
      xhr.send(form());
    });
  let r = await send();
  if (r.status === 401 && (await refreshSession())) r = await send();
  if (r.status < 300) return JSON.parse(r.text);
  let code = `HTTP_${r.status}`;
  try {
    code = JSON.parse(r.text).error?.code ?? code;
  } catch {}
  throw new ApiError(r.status, code, 'upload failed');
}