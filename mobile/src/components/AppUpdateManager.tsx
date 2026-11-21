import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, NativeModules, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { createDownloadResumable, deleteAsync, getInfoAsync, cacheDirectory } from 'expo-file-system/legacy';
import { colors } from '../theme/colors';
import { checkForMobileUpdate, type MobileUpdate } from '../services/mobileUpdater';

type InstallerBridge = {
  canInstallPackages: () => Promise<boolean>;
  openInstallPermissionSettings: () => Promise<boolean>;
  installApk: (fileUri: string) => Promise<boolean>;
  sha256: (fileUri: string) => Promise<string>;
};

type Phase = 'available' | 'downloading' | 'ready' | 'permission' | 'error';
const installer = NativeModules.FaithStreamInstaller as InstallerBridge | undefined;

const formatSize = (bytes: number) => bytes > 0 ? `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB` : 'APK';

export default function AppUpdateManager() {
  const [update, setUpdate] = useState<MobileUpdate | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [stagedUri, setStagedUri] = useState('');
  const checked = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || checked.current) return;
    checked.current = true;
    void checkForMobileUpdate().then((available) => {
      if (available) {
        setUpdate(available);
        setPhase('available');
      }
    }).catch(() => {
      // A failed network check should never prevent the camera app from opening.
    });
  }, []);

  useEffect(() => {
    if (phase !== 'permission') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !installer) return;
      void installer.canInstallPackages().then((allowed) => {
        if (allowed) setPhase('ready');
      }).catch(() => undefined);
    });
    return () => subscription.remove();
  }, [phase]);

  const stageUpdate = async () => {
    if (!update || !cacheDirectory) return;
    setError('');
    setProgress(0);
    setPhase('downloading');
    const target = `${cacheDirectory}faithstream-cam-${update.version}.apk`;
    try {
      await deleteAsync(target, { idempotent: true });
      const task = createDownloadResumable(update.downloadUrl, target, {}, (event) => {
        if (event.totalBytesExpectedToWrite > 0) {
          setProgress(Math.min(100, Math.round(event.totalBytesWritten / event.totalBytesExpectedToWrite * 100)));
        }
      });
      const result = await task.downloadAsync();
      if (!result?.uri) throw new Error('The download did not finish.');
      const info = await getInfoAsync(result.uri);
      if (!info.exists || !info.size) throw new Error('The downloaded APK is empty. Try again.');
      if (update.sha256 && installer) {
        const actual = (await installer.sha256(result.uri)).toLowerCase();
        if (actual !== update.sha256) throw new Error('The downloaded file did not pass its safety check. Try again later.');
      }
      setStagedUri(result.uri);
      setProgress(100);
      setPhase('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not download the update.');
      setPhase('error');
    }
  };

  const installUpdate = async () => {
    if (!stagedUri) return;
    if (!installer) {
      setError('This build does not include the Android installer. Rebuild FaithStream Cam and try again.');
      setPhase('error');
      return;
    }
    try {
      if (!(await installer.canInstallPackages())) {
        await installer.openInstallPermissionSettings();
        setPhase('permission');
        return;
      }
      await installer.installApk(stagedUri);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Android could not open the installer.');
      setPhase('error');
    }
  };

  const close = () => {
    if (phase === 'downloading') {
      Alert.alert('Update still downloading', 'Wait for the download to finish before closing this update notice.');
      return;
    }
    setPhase(null);
    setError('');
  };

  if (!update || !phase) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <View style={styles.icon}><Text style={styles.iconText}>↑</Text></View>
          <Text style={styles.title}>FaithStream Cam update</Text>
          <Text style={styles.subtitle}>Version {update.version} is ready to download.</Text>
          {!!update.notes && <Text numberOfLines={5} style={styles.notes}>{update.notes}</Text>}
          {phase === 'downloading' && <View style={styles.downloadArea}>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
            <Text style={styles.progressText}>{progress > 0 ? `Preparing update · ${progress}%` : 'Preparing update…'} · {formatSize(update.size)}</Text>
          </View>}
          {phase === 'ready' && <Text style={styles.ready}>Update downloaded and ready to install.</Text>}
          {phase === 'permission' && <Text style={styles.permission}>Allow FaithStream Cam to install apps in Android settings, then return and tap Install update.</Text>}
          {phase === 'error' && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            {phase === 'available' && <>
              <Pressable accessibilityRole="button" onPress={close} style={styles.secondary}><Text style={styles.secondaryText}>Later</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => void stageUpdate()} style={styles.primary}><Text style={styles.primaryText}>Download update</Text></Pressable>
            </>}
            {phase === 'downloading' && <ActivityIndicator color={colors.orange} />}
            {phase === 'ready' && <>
              <Pressable accessibilityRole="button" onPress={close} style={styles.secondary}><Text style={styles.secondaryText}>Later</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => void installUpdate()} style={styles.primary}><Text style={styles.primaryText}>Install update</Text></Pressable>
            </>}
            {phase === 'permission' && <Pressable accessibilityRole="button" onPress={() => void installUpdate()} style={styles.primary}><Text style={styles.primaryText}>Continue to install</Text></Pressable>}
            {phase === 'error' && <>
              <Pressable accessibilityRole="button" onPress={close} style={styles.secondary}><Text style={styles.secondaryText}>Close</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => void stageUpdate()} style={styles.primary}><Text style={styles.primaryText}>Try again</Text></Pressable>
            </>}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,.72)' },
  card: { width: '100%', maxWidth: 420, alignSelf: 'center', borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: 24 },
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(213,139,77,.16)' },
  iconText: { color: colors.orange, fontSize: 28, fontWeight: '800' },
  title: { marginTop: 18, color: colors.text, fontSize: 21, fontWeight: '800' },
  subtitle: { marginTop: 7, color: colors.muted, fontSize: 15, lineHeight: 22 },
  notes: { marginTop: 13, color: colors.text, fontSize: 13, lineHeight: 19 },
  downloadArea: { marginTop: 20 },
  progressTrack: { height: 8, borderRadius: 5, backgroundColor: '#26384a', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: colors.orange },
  progressText: { marginTop: 9, color: colors.muted, fontSize: 12 },
  ready: { marginTop: 18, color: colors.green, fontSize: 14, fontWeight: '600' },
  permission: { marginTop: 18, color: colors.muted, fontSize: 14, lineHeight: 21 },
  error: { marginTop: 18, color: '#ffaaa5', fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 24 },
  primary: { minHeight: 46, justifyContent: 'center', borderRadius: 13, backgroundColor: colors.orange, paddingHorizontal: 16 },
  primaryText: { color: '#10202c', fontSize: 14, fontWeight: '800' },
  secondary: { minHeight: 46, justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16 },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '700' },
});
