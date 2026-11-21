import { useEffect, useRef } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export type ScannedPairing = { addresses: string[]; code: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  onScanned: (pairing: ScannedPairing) => void;
};

function readPairingQr(value: string): ScannedPairing | null {
  try {
    const payload = JSON.parse(value) as {
      app?: unknown;
      version?: unknown;
      addresses?: unknown;
      code?: unknown;
    };
    const addresses = Array.isArray(payload.addresses)
      ? payload.addresses.filter((address): address is string => typeof address === 'string' && address.trim().length > 0)
      : [];
    const code = typeof payload.code === 'string' ? payload.code.trim() : '';
    if (payload.app !== 'faithstream-cam-pairing' || payload.version !== 1 || !addresses.length || !/^\d{6}$/.test(code)) return null;
    return { addresses: addresses.map((address) => address.trim()), code };
  } catch {
    return null;
  }
}

export default function PairingQrScanner({ visible, onClose, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const handledScan = useRef(false);

  useEffect(() => {
    handledScan.current = false;
    if (visible && permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission, visible]);

  const handleScan = (data: string) => {
    if (handledScan.current) return;
    handledScan.current = true;
    const pairing = readPairingQr(data);
    if (!pairing) {
      Alert.alert('Not a FaithStream pairing code', 'Scan the QR code shown in the Studio camera pairing window.');
      setTimeout(() => { handledScan.current = false; }, 1200);
      return;
    }
    onScanned(pairing);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Scan Studio QR</Text>
              <Text style={styles.subtitle}>Point your phone at the pairing code in FaithStream Studio.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close QR scanner" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          {!permission?.granted ? (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionText}>{permission?.canAskAgain === false ? 'Camera access is disabled. Allow it in your phone settings to scan the code.' : 'FaithStream Cam needs camera access to scan the pairing code.'}</Text>
              {permission?.canAskAgain !== false && <Pressable accessibilityRole="button" onPress={() => void requestPermission()} style={styles.actionButton}><Text style={styles.actionText}>Allow camera</Text></Pressable>}
            </View>
          ) : (
            <View style={styles.cameraFrame}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => handleScan(data)}
              />
              <View pointerEvents="none" style={styles.scanFrame}><View style={styles.cornerTopLeft} /><View style={styles.cornerTopRight} /><View style={styles.cornerBottomLeft} /><View style={styles.cornerBottomRight} /></View>
              <View pointerEvents="none" style={styles.scanHint}><Text style={styles.scanHintText}>Align the QR code inside the frame</Text></View>
            </View>
          )}
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#000b' },
  card: { width: '100%', maxWidth: 460, alignSelf: 'center', padding: 18, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  headerText: { flex: 1 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  subtitle: { marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 18 },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#ffffff12' },
  closeText: { color: colors.text, fontSize: 24, lineHeight: 26 },
  cameraFrame: { height: 340, overflow: 'hidden', borderRadius: 14, backgroundColor: '#050a0e' },
  scanFrame: { position: 'absolute', left: '15%', right: '15%', top: '18%', bottom: '18%' },
  cornerTopLeft: { position: 'absolute', left: 0, top: 0, width: 30, height: 30, borderColor: colors.orange, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 10 },
  cornerTopRight: { position: 'absolute', right: 0, top: 0, width: 30, height: 30, borderColor: colors.orange, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 10 },
  cornerBottomLeft: { position: 'absolute', left: 0, bottom: 0, width: 30, height: 30, borderColor: colors.orange, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 10 },
  cornerBottomRight: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderColor: colors.orange, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 10 },
  scanHint: { position: 'absolute', left: 12, right: 12, bottom: 14, alignItems: 'center' },
  scanHintText: { overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, color: 'white', backgroundColor: '#000b', fontSize: 11, fontWeight: '600' },
  permissionBox: { minHeight: 190, alignItems: 'center', justifyContent: 'center', padding: 20, borderRadius: 14, backgroundColor: colors.background },
  permissionText: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  actionButton: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 9, backgroundColor: colors.orange },
  actionText: { color: '#101923', fontWeight: '800' },
  cancelButton: { minHeight: 44, marginTop: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.line },
  cancelText: { color: colors.text, fontWeight: '700' },
});
