import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RTCView, type MediaStream } from 'react-native-webrtc';
import type { CameraFacing } from '../hooks/useStudioCamera';
import { colors } from '../theme/colors';

type Props = {
  camera: CameraFacing;
  onFullscreen: () => void;
  onFlip: () => void;
  status: string;
  stream: MediaStream | null;
};

export default function CameraPreview({ camera, onFullscreen, onFlip, status, stream }: Props) {
  const isOnAir = status.startsWith('On air');

  return (
    <View style={styles.preview}>
      {stream ? (
        <RTCView streamURL={stream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" mirror={camera === 'front'} />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.cameraIcon}>◉</Text>
          <Text style={styles.emptyTitle}>Your camera preview</Text>
          <Text style={styles.muted}>Connect to Studio to send this camera</Text>
        </View>
      )}
      <View style={styles.liveBadge}>
        <View style={[styles.dot, { backgroundColor: isOnAir ? colors.green : colors.orange }]} />
        <Text style={styles.badgeText}>{isOnAir ? 'CONNECTED' : 'CAMERA'}</Text>
      </View>
      {stream && <>
        <TouchableOpacity onPress={onFullscreen} style={styles.expand}><Text style={styles.flipText}>Full screen</Text></TouchableOpacity>
        <TouchableOpacity onPress={onFlip} style={styles.flip}><Text style={styles.flipText}>Flip</Text></TouchableOpacity>
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { height: 260, minHeight: 190, maxHeight: 380, backgroundColor: '#03070b', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraIcon: { fontSize: 42, color: '#607386', marginBottom: 8 },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  muted: { color: colors.muted, marginTop: 5, fontSize: 11 },
  liveBadge: { position: 'absolute', top: 12, left: 12, borderRadius: 20, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#09131eee', paddingHorizontal: 10, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { color: colors.text, fontWeight: '800', fontSize: 9, letterSpacing: 0.7 },
  flip: { position: 'absolute', bottom: 12, right: 12, backgroundColor: '#09131eee', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  expand: { position: 'absolute', bottom: 12, left: 12, backgroundColor: '#09131eee', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  flipText: { color: colors.text, fontWeight: '700' },
});
