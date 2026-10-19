import { Stack, useLocalSearchParams } from 'expo-router';
import { docs, REVIEW_NOTICE } from '@/features/legal';
import { EmptyState, Screen, Text } from '@/ui';
import { font, space, useColors } from '@/theme';

export default function LegalDoc() {
  const c = useColors();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const d = docs[doc];
  return (
    <Screen scroll edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: d?.title ?? '', headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, headerTitleStyle: { fontFamily: font.display } }} />
      {!d ? (
        <EmptyState emoji="📄" title="Page not found" />
      ) : (
        <>
          {doc !== 'help' && doc !== 'licenses' && (
            <Text variant="caption" color={c.stale} style={{ marginTop: space.md }}>
              {REVIEW_NOTICE}
            </Text>
          )}
          {d.sections.map((s) => (
            <Text key={s.h} style={{ marginTop: space.lg }}>
              <Text variant="bodyStrong">{s.h + '\n'}</Text>
              {s.p}
            </Text>
          ))}
        </>
      )}
    </Screen>
  );
}
