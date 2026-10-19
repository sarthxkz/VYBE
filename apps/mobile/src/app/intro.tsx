import { useRef, useState } from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, Text } from '@/ui';
import { radius, space, useColors } from '@/theme';
import { intro } from '@/copy';
import { useSession } from '@/stores/session';
import { ChatIllustration, ControlIllustration, MapIllustration, PhotoIllustration } from '@/features/Illustrations';

const art = [MapIllustration, PhotoIllustration, ChatIllustration, ControlIllustration];

export default function Intro() {
  const c = useColors();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList>(null);
  const markIntroSeen = useSession((s) => s.markIntroSeen);
  const last = index === intro.length - 1;
  // Programmatic scrolls don't reliably fire onMomentumScrollEnd on Android, so track the index here too.
  const go = (i: number) => {
    setIndex(i);
    list.current?.scrollToIndex({ index: i });
  };

  const finish = async (to: '/sign-up' | '/sign-in') => {
    router.replace(to);
    await markIntroSeen();
  };

  return (
    <Screen padded={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.md }}>
        <Text variant="title" color={c.link} accessibilityRole="header">
          vybe
        </Text>
        {!last && <Button title="Skip" kind="ghost" onPress={() => go(intro.length - 1)} />}
      </View>
      <FlatList
        ref={list}
        data={intro}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => {
          const Art = art[i]!;
          return (
            <View style={{ width, paddingHorizontal: space.xl, justifyContent: 'center', alignItems: 'center', gap: space.xxl }}>
              <Art />
              <View style={{ gap: space.md, alignItems: 'center' }}>
                <Text variant="hero" style={{ textAlign: 'center' }} accessibilityRole="header">
                  {item.title}
                </Text>
                <Text muted style={{ textAlign: 'center', maxWidth: 320 }}>
                  {item.body}
                </Text>
              </View>
            </View>
          );
        }}
      />
      <View style={{ paddingHorizontal: space.xl, gap: space.md, paddingBottom: space.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginBottom: space.md }} accessibilityLabel={`Step ${index + 1} of ${intro.length}`}>
          {intro.map((s, i) => (
            <View key={s.title} style={{ height: 8, width: i === index ? 24 : 8, borderRadius: radius.pill, backgroundColor: i === index ? c.brand : c.border }} />
          ))}
        </View>
        {last ? (
          <>
            <Button title="Create account" kind="action" onPress={() => finish('/sign-up')} />
            <Button title="I already have an account" kind="ghost" onPress={() => finish('/sign-in')} />
          </>
        ) : (
          <Button title="Next" onPress={() => go(index + 1)} />
        )}
      </View>
    </Screen>
  );
}
