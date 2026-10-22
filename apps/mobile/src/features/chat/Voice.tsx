import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  createAudioPlayer,
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioPlayer,
  type AudioStatus,
  type RecordingOptions,
} from 'expo-audio';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import { PulseRing, Text, useBreathe } from '@/ui';
import { font, motion, palette, radius, space, useColors } from '@/theme';
import { openVoice, sendVoice, VOICE_BARS, VOICE_MAX_MS, type Voice } from './service';

// Mono AAC at 64 kbps: clear speech at about 0.5 MB a minute.
const OPTIONS: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64_000, isMeteringEnabled: true };
const CANCEL_DX = -110;
const MIN_MS = 700;
const LIVE_BARS = 32;

export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** dBFS (about -60 quiet … 0 loud) → 0..1, slightly boosted so speech fills the bubble. */
const level = (db?: number) => (db == null ? 0 : Math.min(1, Math.max(0, (db + 60) / 50)) ** 1.4);

/** Squeezes the per-tick levels into `n` bars (peak of each bucket, so syllables stay visible). */
export function downsample(levels: number[], n = VOICE_BARS) {
  if (!levels.length) return Array(n).fill(0.1) as number[];
  return Array.from({ length: n }, (_, i) => {
    const from = Math.floor((i * levels.length) / n);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / n));
    return Math.max(0.08, ...levels.slice(from, to));
  });
}

export type VoiceRecorderState = ReturnType<typeof useVoiceRecorder>;

/**
 * Hold-to-record voice notes: hold the mic to record, slide left to cancel, release to send. A hook so the chat
 * can put <RecordingBar> over its text field and <MicButton> beside it, both driven by the same recording.
 */
export function useVoiceRecorder(peerId: string) {
  const recorder = useAudioRecorder(OPTIONS);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [bars, setBars] = useState<number[]>([]);
  const [hint, setHint] = useState(false);
  const [sending, setSending] = useState(false);
  const levels = useRef<number[]>([]);
  const held = useRef(false);
  const startedAt = useRef(0);
  // Read inside the gesture callbacks, so these are shared values rather than refs.
  const cancelled = useSharedValue(false);
  const live = useSharedValue(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const dx = useSharedValue(0);
  const grow = useSharedValue(0);

  const setActive = useCallback(
    (on: boolean) => {
      setRecording(on);
      live.set(on);
      grow.set(withSpring(on ? 1 : 0, motion.bouncy));
      if (!on) dx.set(withSpring(0, motion.snappy));
    },
    [grow, dx, live],
  );

  const stopPolling = () => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  };

  const finish = useCallback(
    async (send: boolean) => {
      if (!startedAt.current) return;
      const ms = Date.now() - startedAt.current;
      startedAt.current = 0;
      stopPolling();
      setActive(false);
      try {
        await recorder.stop();
      } catch {
        // already stopped
      }
      void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      const uri = recorder.uri;
      if (!send || !uri) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        return;
      }
      if (ms < MIN_MS) {
        setHint(true);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSending(true);
      try {
        await sendVoice(peerId, uri, ms, downsample(levels.current));
      } catch {
        Alert.alert('Voice message not sent', 'Check your connection and try again.');
      } finally {
        setSending(false);
      }
    },
    [peerId, recorder, setActive],
  );

  const start = useCallback(async () => {
    held.current = true;
    cancelled.set(false);
    setHint(false);
    const perm = await getRecordingPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        Alert.alert('Microphone is off for Vybe', 'Allow the microphone in Settings to send voice messages.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ]);
        return;
      }
      // The finger leaves the button for the system dialog, so recording starts on the next hold.
      await requestRecordingPermissionsAsync();
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
    } catch {
      Alert.alert('Can’t record right now', 'Another app may be using the microphone.');
      return;
    }
    if (!held.current) return; // released while preparing: treat it as a tap
    recorder.record();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    levels.current = [];
    startedAt.current = Date.now();
    setElapsed(0);
    setBars([]);
    setActive(true);
    poll.current = setInterval(() => {
      const st = recorder.getStatus();
      const l = level(st.metering);
      levels.current.push(l);
      setBars((prev) => [...prev.slice(-(LIVE_BARS - 1)), l]);
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= VOICE_MAX_MS) void finish(true);
    }, 90);
  }, [recorder, setActive, finish, cancelled]);

  const release = useCallback(() => {
    const wasHeld = held.current;
    held.current = false;
    if (!wasHeld) return;
    if (!startedAt.current) {
      setHint(true); // a quick tap never got as far as recording
      return;
    }
    void finish(!cancelled.get());
  }, [finish, cancelled]);

  useEffect(() => () => stopPolling(), []);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), 1800);
    return () => clearTimeout(t);
  }, [hint]);

  const gesture = usePanGesture({
    runOnJS: true,
    minDistance: 0,
    shouldCancelWhenOutside: false,
    onBegin: () => void start(),
    onUpdate: (e) => {
      if (!live.get() || cancelled.get()) return;
      dx.set(Math.min(0, e.translationX));
      if (e.translationX < CANCEL_DX) {
        cancelled.set(true);
        void finish(false);
      }
    },
    onFinalize: release,
  });

  return { gesture, recording, elapsed, bars, hint, sending, dx, grow };
}

/** Timer, live waveform and "slide to cancel", drawn over the composer's text field while recording. */
export function RecordingBar({ rec }: { rec: VoiceRecorderState }) {
  const c = useColors();
  const { dx, elapsed, bars } = rec;
  const slide = useAnimatedStyle(() => ({ opacity: interpolate(dx.value, [CANCEL_DX, 0], [0, 1]), transform: [{ translateX: dx.value * 0.6 }] }));
  if (!rec.recording) return null;
  return (
        <Animated.View entering={FadeIn.duration(motion.fast)} exiting={FadeOut.duration(motion.fast)} style={[styles.bar, { backgroundColor: c.surface }]}>
          <RecDot />
          <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'], minWidth: 44 }}>
            {clock(elapsed)}
          </Text>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 28, overflow: 'hidden', justifyContent: 'flex-end' }}>
            {bars.map((l, i) => (
              <View key={i} style={{ width: 3, borderRadius: 2, height: 4 + l * 24, backgroundColor: c.link, opacity: 0.4 + 0.6 * (i / LIVE_BARS) }} />
            ))}
          </View>
          <Animated.View style={[{ flexDirection: 'row', alignItems: 'center' }, slide]}>
            <Ionicons name="chevron-back" size={14} color={c.textMuted} />
            <Text variant="caption" muted>
              Slide to cancel
            </Text>
          </Animated.View>
        </Animated.View>
  );
}

export function MicButton({ rec }: { rec: VoiceRecorderState }) {
  const c = useColors();
  const { gesture, recording, sending, hint, dx, grow } = rec;
  const button = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value * 0.35 }, { scale: 1 + 0.45 * grow.value }] }));
  return (
    <>
      {hint && (
        <Animated.View entering={ZoomIn.springify().damping(16)} exiting={FadeOut} style={[styles.hint, { backgroundColor: palette.ink }]}>
          <Text variant="caption" color="#fff">
            Hold to record, release to send
          </Text>
        </Animated.View>
      )}
      <GestureDetector gesture={gesture}>
        <Animated.View
          accessible
          accessibilityRole="button"
          accessibilityLabel="Record a voice message"
          accessibilityHint="Hold to record, release to send, slide left to cancel"
          style={[{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: recording ? palette.coral500 : c.brand }, button]}
        >
          {recording && <PulseRing size={44} color={palette.coral500} />}
          {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="mic" size={22} color={recording ? palette.ink : '#fff'} />}
        </Animated.View>
      </GestureDetector>
    </>
  );
}

function RecDot() {
  const t = useBreathe(500);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * t.value }));
  return <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette.red500 }, style]} />;
}

// One voice note plays at a time, like every messenger.
let playing: AudioPlayer | null = null;

/** Voice note in a chat bubble: play/pause, a waveform you can tap to seek, and 1× / 1.5× / 2× speed. */
export function VoiceBubble({ voice, mine }: { voice: Voice; mine: boolean }) {
  const c = useColors();
  const fg = mine ? c.brandText : c.text;
  const dim = mine ? 'rgba(255,255,255,0.45)' : c.border;
  const player = useRef<AudioPlayer | null>(null);
  const [status, setStatus] = useState<Pick<AudioStatus, 'playing' | 'currentTime' | 'duration'> | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rate, setRate] = useState(1);
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(
    () => () => {
      if (playing === player.current) playing = null;
      player.current?.remove();
    },
    [],
  );

  const ensure = async () => {
    if (player.current) return player.current;
    setLoading(true);
    try {
      const uri = await openVoice(voice);
      const p = createAudioPlayer({ uri }, { updateInterval: 100 });
      p.addListener('playbackStatusUpdate', (s: AudioStatus) => {
        setStatus({ playing: s.playing, currentTime: s.currentTime, duration: s.duration });
        const total = s.duration || voice.ms / 1000;
        progress.value = withTiming(total ? Math.min(1, s.currentTime / total) : 0, { duration: 100 });
        if (s.didJustFinish) {
          void p.seekTo(0);
          progress.value = withTiming(0, { duration: motion.base });
        }
      });
      player.current = p;
      setFailed(false);
      return p;
    } catch {
      setFailed(true);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const toggle = async () => {
    const p = await ensure();
    if (!p) return;
    if (p.playing) return p.pause();
    if (playing && playing !== p) playing.pause();
    playing = p;
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    p.playbackRate = rate;
    p.play();
  };

  const seek = async (e: { nativeEvent: { locationX: number } }) => {
    const p = await ensure();
    if (!p || !width) return;
    const total = p.duration || voice.ms / 1000;
    await p.seekTo(Math.min(1, Math.max(0, e.nativeEvent.locationX / width)) * total);
  };

  const cycleRate = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (player.current) player.current.playbackRate = next;
  };

  const isPlaying = !!status?.playing;
  const shown = isPlaying || (status?.currentTime ?? 0) > 0 ? (status?.duration ? status.duration * 1000 : voice.ms) - (status?.currentTime ?? 0) * 1000 : voice.ms;
  const bars = voice.wave.length ? voice.wave : downsample([]);
  const playedStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const waveform = (color: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 30, width }}>
      {bars.map((b, i) => (
        <View key={i} style={{ flex: 1, borderRadius: 2, height: 4 + b * 24, backgroundColor: color }} />
      ))}
    </View>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, width: 236 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause voice message' : `Play voice message, ${clock(voice.ms)}`}
        onPress={toggle}
        hitSlop={6}
        style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? 'rgba(255,255,255,0.22)' : c.brandSoft }}
      >
        {loading ? (
          <ActivityIndicator color={fg} size="small" />
        ) : (
          <Animated.View key={isPlaying ? 'pause' : 'play'} entering={ZoomIn.springify().damping(14)}>
            <Ionicons name={failed ? 'refresh' : isPlaying ? 'pause' : 'play'} size={20} color={mine ? '#fff' : c.link} style={!isPlaying && !failed && { marginLeft: 2 }} />
          </Animated.View>
        )}
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <Pressable accessibilityLabel="Seek" onPress={seek} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && waveform(dim)}
          {width > 0 && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, playedStyle]}>{waveform(mine ? '#fff' : c.link)}</Animated.View>}
          {width === 0 && <View style={{ height: 30 }} />}
        </Pressable>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="caption" color={fg} style={{ fontVariant: ['tabular-nums'], opacity: 0.85 }}>
            {failed ? 'Couldn’t load · tap to retry' : clock(shown)}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Playback speed ${rate}x`} onPress={cycleRate} hitSlop={8} style={{ borderRadius: radius.pill, paddingHorizontal: 6, backgroundColor: mine ? 'rgba(255,255,255,0.2)' : c.surfaceAlt }}>
            <Text variant="caption" color={fg} style={{ fontFamily: font.bodySemi, fontSize: 11 }}>
              {rate}×
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 2, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md },
  hint: { position: 'absolute', right: 0, bottom: 56, zIndex: 3, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm },
});
