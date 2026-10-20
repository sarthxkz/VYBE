import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text as RNText, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError, gifSource } from '@/api/client';
import { useSession } from '@/stores/session';
import { Text } from '@/ui';
import { font, radius, space, useColors } from '@/theme';
import { STICKERS, Sticker } from './stickers';

const EMOJI = (
  '😀 😂 🥹 😍 🥰 😘 😎 🤩 🥳 😇 🙃 😉 😋 😜 🤪 🤗 🤔 🫡 😴 🥱 😮 😱 🤯 😳 🥺 😢 😭 😤 😡 🤬 ' +
  '👍 👎 👏 🙌 🙏 💪 👋 🤝 ✌️ 🤞 👀 🫶 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💯 🔥 ✨ ⭐ 🌈 ☀️ 🌙 ⚡ 🎉 ' +
  '🎂 🍕 🍔 🍟 🌮 🍜 🍣 🍩 ☕ 🧋 🍺 🥂 ⚽ 🏀 🎮 🎧 🎬 📚 ✈️ 🚗 🏖️ 🏔️ 🐶 🐱 🦊 🐼 🦋 🌸 🌵 🎁'
).split(' ');

type Gif = { id: string; title: string; w: number; h: number };
type Tab = 'emoji' | 'stickers' | 'gifs';

/** Emoji, avatar stickers and GIFs, shown in place of the keyboard. */
export function ChatTray({ onEmoji, onSticker, onGif }: { onEmoji: (e: string) => void; onSticker: (id: string) => void; onGif: (g: { gifId: string; w: number; h: number }) => void }) {
  const c = useColors();
  const [tab, setTab] = useState<Tab>('emoji');
  const look = useSession((s) => s.me?.avatarStyle);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);
  const gifs = useQuery({
    queryKey: ['gifs', debounced],
    enabled: tab === 'gifs',
    retry: false,
    queryFn: () => api<{ gifs: Gif[] }>(`/gifs${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`),
  });
  const gifsOff = gifs.error instanceof ApiError && gifs.error.code === 'GIFS_NOT_CONFIGURED';

  return (
    <View style={{ height: 300, backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.border }}>
      <View style={{ flexDirection: 'row', gap: space.sm, padding: space.sm }}>
        {(['emoji', 'stickers', 'gifs'] as const).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            onPress={() => setTab(t)}
            style={{ paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: tab === t ? c.brand : c.surfaceAlt }}
          >
            <Text variant="label" color={tab === t ? c.brandText : c.text}>
              {t === 'emoji' ? '😀 Emoji' : t === 'stickers' ? '✨ Stickers' : 'GIF'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'emoji' && (
        <FlatList
          data={EMOJI}
          numColumns={8}
          keyExtractor={(e, i) => `${e}-${i}`}
          contentContainerStyle={{ paddingHorizontal: space.sm }}
          renderItem={({ item }) => (
            <Pressable accessibilityLabel={`Emoji ${item}`} onPress={() => onEmoji(item)} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
              <RNText style={{ fontSize: 28 }}>{item}</RNText>
            </Pressable>
          )}
        />
      )}

      {tab === 'stickers' && (
        <FlatList
          data={STICKERS}
          numColumns={3}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: space.sm, gap: space.sm }}
          columnWrapperStyle={{ gap: space.sm, justifyContent: 'center' }}
          renderItem={({ item }) => (
            <Pressable accessibilityLabel={`Send sticker ${item.caption}`} onPress={() => onSticker(item.id)}>
              <Sticker id={item.id} look={look} size={104} />
            </Pressable>
          )}
        />
      )}

      {tab === 'gifs' && (
        <View style={{ flex: 1 }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search GIFs"
            placeholderTextColor={c.textMuted}
            accessibilityLabel="Search GIFs"
            style={{ marginHorizontal: space.sm, backgroundColor: c.bg, color: c.text, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: 8, fontFamily: font.body }}
          />
          {gifsOff ? (
            <Text muted style={{ textAlign: 'center', marginTop: space.xl }}>
              GIFs aren’t switched on yet.
            </Text>
          ) : (
            <FlatList
              data={gifs.data?.gifs ?? []}
              numColumns={2}
              keyExtractor={(g) => g.id}
              contentContainerStyle={{ padding: space.sm, gap: space.sm }}
              columnWrapperStyle={{ gap: space.sm }}
              ListEmptyComponent={<Text muted style={{ textAlign: 'center', marginTop: space.xl }}>{gifs.isFetching ? 'Loading…' : gifs.isError ? 'Couldn’t load GIFs.' : 'No GIFs found.'}</Text>}
              renderItem={({ item }) => (
                <Pressable accessibilityLabel={`Send GIF ${item.title}`} onPress={() => onGif({ gifId: item.id, w: item.w, h: item.h })} style={{ flex: 1 }}>
                  <Image source={gifSource(item.id)} style={{ width: '100%', aspectRatio: item.w / item.h, borderRadius: radius.md, backgroundColor: c.surfaceAlt }} contentFit="cover" />
                </Pressable>
              )}
            />
          )}
          <Text variant="caption" muted style={{ textAlign: 'center', paddingBottom: 4 }}>
            Powered by GIPHY
          </Text>
        </View>
      )}
    </View>
  );
}
