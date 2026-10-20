import { Text as RNText, View } from 'react-native';
import { Character, type AvatarLook } from '@/ui';
import { font } from '@/theme';

// Avatar stickers: the sender's own character with an expression, an emoji and a caption. Only the sticker id
// travels (encrypted); each phone draws it with the sender's avatar. Append only: ids are stored in messages.
type StickerDef = { id: string; caption: string; emoji: string; bg: string; face: Partial<AvatarLook> };
export const STICKERS: StickerDef[] = [
  { id: 'hi', caption: 'Hi!', emoji: '👋', bg: '#FFE7A3', face: { eyes: 0, mouth: 1 } },
  { id: 'omw', caption: 'OMW', emoji: '🏃', bg: '#C6F432', face: { eyes: 2, mouth: 0, brows: 4 } },
  { id: 'lol', caption: 'LOL', emoji: '😂', bg: '#FFD0DB', face: { eyes: 1, mouth: 1 } },
  { id: 'love', caption: 'Love ya', emoji: '😍', bg: '#FFC2D1', face: { eyes: 1, mouth: 0 } },
  { id: 'wow', caption: 'WOW', emoji: '✨', bg: '#D7CCFF', face: { eyes: 2, mouth: 3, brows: 3 } },
  { id: 'yay', caption: 'Yay!', emoji: '🎉', bg: '#BDEBFF', face: { eyes: 1, mouth: 5 } },
  { id: 'gn', caption: 'Good night', emoji: '🌙', bg: '#2E2A5A', face: { eyes: 4, mouth: 2 } },
  { id: 'sorry', caption: 'Sorry', emoji: '🥺', bg: '#E4DCFF', face: { eyes: 0, mouth: 2, brows: 3 } },
  { id: 'miss', caption: 'Miss you', emoji: '💜', bg: '#F3E1FF', face: { eyes: 4, mouth: 0 } },
  { id: 'coffee', caption: 'Coffee?', emoji: '☕', bg: '#F1D7B8', face: { eyes: 0, mouth: 4, brows: 3 } },
  { id: 'ok', caption: 'OK!', emoji: '👍', bg: '#CFF5DC', face: { eyes: 3, mouth: 0 } },
  { id: 'hbd', caption: 'Happy birthday', emoji: '🎂', bg: '#FFE0C2', face: { eyes: 1, mouth: 1 } },
];

const DEFAULT_LOOK: AvatarLook = { skin: 1, face: 0, hair: 1, hairColor: 1, eyes: 0, mouth: 0, accessory: 0, outfit: 0 };

export function Sticker({ id, look, size = 132 }: { id: string; look?: AvatarLook | null; size?: number }) {
  const s = STICKERS.find((x) => x.id === id);
  if (!s) return <RNText>🙂</RNText>;
  const dark = s.bg === '#2E2A5A';
  return (
    <View accessibilityLabel={`Sticker: ${s.caption}`} style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: s.bg, overflow: 'hidden', alignItems: 'center' }}>
      <View style={{ position: 'absolute', top: size * 0.04 }}>
        <Character look={{ ...(look ?? DEFAULT_LOOK), ...s.face }} size={size * 0.86} />
      </View>
      <RNText style={{ position: 'absolute', right: size * 0.05, top: size * 0.03, fontSize: size * 0.22 }}>{s.emoji}</RNText>
      <View style={{ position: 'absolute', bottom: size * 0.06, backgroundColor: dark ? '#C6F432' : '#14121F', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, transform: [{ rotate: '-4deg' }] }}>
        <RNText numberOfLines={1} style={{ color: dark ? '#14121F' : '#fff', fontFamily: font.displayHeavy, fontSize: Math.max(11, size * 0.12) }}>
          {s.caption}
        </RNText>
      </View>
    </View>
  );
}
