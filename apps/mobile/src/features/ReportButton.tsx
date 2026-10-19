import { Alert } from 'react-native';
import { api } from '@/api/client';
import { errorText } from '@/copy';
import { Button } from '@/ui';

const REASONS = [
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'spam', label: 'Spam' },
  { key: 'nudity', label: 'Nudity or sexual content' },
  { key: 'violence', label: 'Violence or threats' },
  { key: 'impersonation', label: 'Pretending to be someone' },
  { key: 'self_harm', label: 'Self-harm concern' },
  { key: 'other', label: 'Something else' },
] as const;

export function ReportButton({ targetUserId, photoPostId, name }: { targetUserId: string; photoPostId?: string; name: string }) {
  const report = async (reason: string) => {
    try {
      await api('/reports', { body: { targetUserId, photoPostId, reason } });
      Alert.alert('Thanks for telling us', 'Our team will review it. You can also block them so they can’t contact you.');
    } catch (e) {
      Alert.alert('Report not sent', errorText(e));
    }
  };
  return (
    <Button
      title={photoPostId ? 'Report photo' : `Report ${name}`}
      kind="ghost"
      onPress={() =>
        Alert.alert('What’s wrong?', 'Reports are confidential.', [
          ...REASONS.slice(0, 2).map((r) => ({ text: r.label, onPress: () => void report(r.key) })),
          { text: 'More reasons…', onPress: () => Alert.alert('Report', undefined, [...REASONS.slice(2).map((r) => ({ text: r.label, onPress: () => void report(r.key) })), { text: 'Cancel', style: 'cancel' as const }]) },
        ])
      }
    />
  );
}
