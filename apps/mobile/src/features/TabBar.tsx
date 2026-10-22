import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Gradient, PressScale, Text } from '@/ui';
import { gradient, motion, palette, radius, shadow, space, useColors } from '@/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['map-outline', 'map'],
  photos: ['images-outline', 'images'],
  chats: ['chatbubbles-outline', 'chatbubbles'],
  me: ['person-circle-outline', 'person-circle'],
};

/**
 * Floating pill tab bar: a highlight glides to the active tab on a spring, the active icon pops, and the
 * centre slot is the camera button (it opens the camera modal instead of switching tabs).
 */
export function TabBar({ state, descriptors, emitter, navigateToTab, onCamera }: TabBarProps & { onCamera: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const slot = w / state.routes.length;
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = reduced ? state.index * slot : withSpring(state.index * slot, motion.snappy);
  }, [state.index, slot, x, reduced]);
  const highlight = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.sm) + space.xs }}>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={[{ flexDirection: 'row', height: 64, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }, shadow.float]}
      >
        {w > 0 && state.routes[state.index]?.name !== 'snap' && (
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 8, bottom: 8, left: 6, width: slot - 12, borderRadius: radius.lg, backgroundColor: c.brandSoft }, highlight]} />
        )}
        {state.routes.map((route, i) => {
          if (route.name === 'snap') return <CameraSlot key={route.key} onPress={onCamera} />;
          const { options } = descriptors[route.key]!;
          const focused = state.index === i;
          const label = typeof options.title === 'string' ? options.title : route.name;
          return (
            <TabItem
              key={route.key}
              label={label}
              icons={ICONS[route.name] ?? ['ellipse-outline', 'ellipse']}
              focused={focused}
              onPress={() => {
                const ev = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !ev.defaultPrevented) {
                  void Haptics.selectionAsync().catch(() => {});
                  navigateToTab(route.key);
                }
              }}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabItem({ label, icons, focused, onPress, onLongPress }: { label: string; icons: [IconName, IconName]; focused: boolean; onPress: () => void; onLongPress: () => void }) {
  const c = useColors();
  const reduced = useReducedMotion();
  const pop = useSharedValue(1);
  useEffect(() => {
    if (focused && !reduced) pop.value = withSequence(withTiming(0.82, { duration: 90 }), withSpring(1, motion.bouncy));
  }, [focused, pop, reduced]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const color = focused ? c.link : c.textMuted;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}
    >
      <Animated.View style={iconStyle}>
        <Ionicons name={focused ? icons[1] : icons[0]} size={23} color={color} />
      </Animated.View>
      <Text variant="caption" color={color} style={{ fontSize: 11, lineHeight: 14 }} maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
    </Pressable>
  );
}

function CameraSlot({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel="Open camera"
        scaleTo={0.88}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onPress();
        }}
        style={[{ top: -16, width: 62, height: 62, borderRadius: 31, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: c.bg }, shadow.float]}
      >
        <Gradient colors={gradient.sunset} />
        <Ionicons name="camera" size={27} color={palette.ink} />
      </PressScale>
    </View>
  );
}
