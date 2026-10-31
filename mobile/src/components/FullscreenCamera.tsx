import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RTCView, type MediaStream } from 'react-native-webrtc';
import type { CameraFacing } from '../hooks/useStudioCamera';
import { colors } from '../theme/colors';

type Props = {
  camera: CameraFacing;
  onBackToSetup: () => void;
  onDisconnect: () => void;
  onFlip: () => void;
  status: string;
  stream: MediaStream;
};

export default function FullscreenCamera({ camera, onBackToSetup, onDisconnect, onFlip, status, stream }: Props) {
  const connected = status.startsWith('On air') || status.startsWith('Connected');

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <RTCView streamURL={stream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" mirror={camera === 'front'} />
      <View style={styles.topBar}>
        <TouchableOpacity accessibilityRole="button" onPress={onBackToSetup} style={styles.control}>
          <Text style={styles.controlText}>‹  Setup</Text>
        </TouchableOpacity>
        <View style={styles.statusPill}>
          <View style={[styles.dot, { backgroundColor: connected ? colors.green : colors.orange }]} />
          <Text style={styles.statusText} numberOfLines={1}>{status}</Text>
        </View>
      </View>
      <View style={styles.bottomBar}>
        <Text style={styles.rotateHint}>Rotate your phone for portrait or landscape framing</Text>
        <View style={styles.actions}>
          <TouchableOpacity accessibilityRole="button" onPress={onFlip} style={styles.control}>
            <Text style={styles.controlText}>Flip camera</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={onDisconnect} style={[styles.control, styles.disconnect]}>
            <Text style={styles.controlText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  statusPill: { maxWidth: '72%', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 24, backgroundColor: '#07111ddd', paddingHorizontal: 13, paddingVertical: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  // Leave room for Android's visible system navigation buttons/gesture bar.
  // Landscape navigation bars can move to the right edge, so inset that side too.
  bottomBar: { position: 'absolute', bottom: Platform.OS === 'android' ? 76 : 44, left: Platform.OS === 'android' ? 56 : 12, right: Platform.OS === 'android' ? 56 : 12, alignItems: 'center', gap: 12 },
  rotateHint: { color: colors.text, fontSize: 12, textAlign: 'center', backgroundColor: '#07111dcc', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  actions: { width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  control: { backgroundColor: '#07111de8', borderWidth: 1, borderColor: '#ffffff35', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24 },
  controlText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  disconnect: { backgroundColor: '#872f2ff0', borderColor: '#ffffff25' },
});
