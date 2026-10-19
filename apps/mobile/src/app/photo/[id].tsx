import { useEffect } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, mediaSource } from '@/api/client';
import type { PhotoPost } from '@/api/types';
import { errorText } from '@/copy';
import { useSession } from '@/stores/session';
import { ago } from '@/features/location/tracking';
import { ReportButton } from '@/features/ReportButton';
import { Avatar, Button, ErrorState, Row, Text } from '@/ui';
import { space } from '@/theme';

export default function PhotoViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const photo = useQuery({ queryKey: ['photos', 'one', id], queryFn: () => api<PhotoPost>(`/photos/${id}`) });
  const mine = photo.data?.sender.id === me?.id;

  useEffect(() => {
    if (photo.data && !mine) void api(`/photos/${id}/viewed`, { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['photos', 'inbox'] }));
  }, [photo.data, mine, id, qc]);

  const remove = () =>
    Alert.alert(mine ? 'Delete this photo for everyone?' : 'Remove from your photos?', mine ? 'Friends you sent it to will no longer see it. Anyone who already saved a copy keeps it.' : 'It will disappear from your inbox.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: mine ? 'Delete' : 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/photos/${id}`, { method: 'DELETE' });
            void qc.invalidateQueries({ queryKey: ['photos'] });
            router.back();
          } catch (e) {
            Alert.alert('Couldn’t delete', errorText(e));
          }
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {photo.data && <Image source={mediaSource(photo.data.mediaId)} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={photo.data.caption ?? 'Photo'} />}
      {photo.isError && <ErrorState message="This photo isn’t available anymore." onRetry={() => router.back()} />}
      <SafeAreaView edges={['top']} style={{ padding: space.lg }}>
        {photo.data && (
          <Row>
            <Avatar mediaId={photo.data.sender.avatarMediaId} name={photo.data.sender.displayName ?? photo.data.sender.username} size={36} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" color="#fff">
                {photo.data.sender.displayName ?? photo.data.sender.username}
              </Text>
              <Text variant="caption" color="#ddd">
                {ago(photo.data.createdAt)}
              </Text>
            </View>
            <Button title="Close" kind="ghost" onPress={() => router.back()} />
          </Row>
        )}
      </SafeAreaView>
      {photo.data && (
        <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: space.lg, backgroundColor: 'rgba(0,0,0,0.45)' }}>
          {photo.data.caption ? (
            <Text color="#fff" style={{ marginBottom: space.md }}>
              {photo.data.caption}
            </Text>
          ) : null}
          <Row>
            <Button title={mine ? 'Delete for everyone' : 'Remove'} kind="secondary" style={{ flex: 1 }} onPress={remove} />
            {!mine && <ReportButton targetUserId={photo.data.sender.id} photoPostId={photo.data.id} name={photo.data.sender.displayName ?? ''} />}
          </Row>
        </SafeAreaView>
      )}
    </View>
  );
}
