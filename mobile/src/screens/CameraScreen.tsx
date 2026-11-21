import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  NativeModules,
  Platform,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import BrandHeader from '../components/BrandHeader';
import CameraPreview from '../components/CameraPreview';
import ConnectionForm from '../components/ConnectionForm';
import FullscreenCamera from '../components/FullscreenCamera';
import PairingQrScanner, { type ScannedPairing } from '../components/PairingQrScanner';
import { useStudioCamera } from '../hooks/useStudioCamera';
import { colors } from '../theme/colors';

export default function CameraScreen() {
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [cameraFullscreen, setCameraFullscreen] = useState(false);
  const [shareMicrophone, setShareMicrophone] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const connectionStartedAt = useRef<number | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const codeInputRef = useRef<TextInput | null>(null);
  const { camera, connect, disconnect, flipCamera, phase, status, stream, phoneMicrophoneEnabled, togglePhoneMicrophone } = useStudioCamera();

  const connectWithLoading = (targetAddress: string | string[], pairingCode: string) => {
    connectionStartedAt.current = Date.now();
    void connect(targetAddress, pairingCode, shareMicrophone);
  };

  const useScannedPairing = (pairing: ScannedPairing) => {
    setAddress(pairing.addresses[0] ?? '');
    setCode(pairing.code);
    setScannerOpen(false);
    // Let Expo Camera release the preview before the WebRTC camera opens.
    setTimeout(() => { connectWithLoading(pairing.addresses, pairing.code); }, 350);
  };

  useEffect(() => {
    if (phase === 'publishing') {
      const startedAt = connectionStartedAt.current ?? Date.now();
      const timer = setTimeout(() => setCameraFullscreen(true), Math.max(0, 1000 - (Date.now() - startedAt)));
      return () => clearTimeout(timer);
    }
    setCameraFullscreen(false);
  }, [phase]);

  const keepFocusedInputVisible = () => {
    // KeyboardAvoidingView shrinks the available area; this delayed scroll
    // then brings the focused input above the keyboard on both platforms.
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), Platform.OS === 'ios' ? 250 : 100);
  };

  if (stream && cameraFullscreen) {
    return <FullscreenCamera
      camera={camera}
      onBackToSetup={() => setCameraFullscreen(false)}
      onDisconnect={disconnect}
      onFlip={() => void flipCamera()}
      microphoneAvailable={!!stream?.getAudioTracks().length}
      microphoneEnabled={phoneMicrophoneEnabled}
      onToggleMicrophone={togglePhoneMicrophone}
      status={status}
      stream={stream}
    />;
  }

  return (
    <View style={styles.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          onScrollBeginDrag={Keyboard.dismiss}
        >
          <BrandHeader />
          <CameraPreview camera={camera} connecting={['requesting-permission', 'connecting', 'waiting-for-studio', 'connected', 'publishing'].includes(phase)} onFlip={() => void flipCamera()} onFullscreen={() => setCameraFullscreen(true)} status={status} stream={stream} />
          <ConnectionForm
            address={address}
            code={code}
            connected={phase === 'publishing' || phase === 'connected'}
            phase={phase}
            codeInputRef={codeInputRef}
            onAddressChange={setAddress}
            onAddressSubmit={() => codeInputRef.current?.focus()}
            onCodeChange={setCode}
            onScanQr={() => setScannerOpen(true)}
            onConnect={() => connectWithLoading(address, code)}
            onDisconnect={disconnect}
            onInputFocus={keepFocusedInputVisible}
            shareMicrophone={shareMicrophone}
            onShareMicrophoneChange={setShareMicrophone}
            status={status}
          />
          <Text style={styles.footer}>Keep this app open while the camera is in use.</Text>
        </ScrollView>
        <PairingQrScanner visible={scannerOpen} onClose={() => setScannerOpen(false)} onScanned={useScannedPairing} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android'
      ? NativeStatusBar.currentHeight ?? 0
      : Platform.OS === 'ios'
        ? NativeModules.StatusBarManager?.HEIGHT ?? 20
        : 0,
    paddingBottom: Platform.OS === 'ios' ? 24 : 0,
  },
  keyboardArea: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8 },
  footer: { color: '#718397', textAlign: 'center', fontSize: 10, marginTop: 'auto', paddingVertical: 14 },
});
