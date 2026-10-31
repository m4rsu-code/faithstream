import { useEffect, useRef, useState } from 'react';
import {
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
import { useStudioCamera } from '../hooks/useStudioCamera';
import { colors } from '../theme/colors';

export default function CameraScreen() {
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [cameraFullscreen, setCameraFullscreen] = useState(false);
  const hadCameraStream = useRef(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const codeInputRef = useRef<TextInput | null>(null);
  const { camera, connect, disconnect, flipCamera, status, stream } = useStudioCamera();

  useEffect(() => {
    if (stream && !hadCameraStream.current) setCameraFullscreen(true);
    if (!stream) setCameraFullscreen(false);
    hadCameraStream.current = stream !== null;
  }, [stream]);

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
          <CameraPreview camera={camera} onFlip={() => void flipCamera()} onFullscreen={() => setCameraFullscreen(true)} status={status} stream={stream} />
          <ConnectionForm
            address={address}
            code={code}
            connected={stream !== null}
            codeInputRef={codeInputRef}
            onAddressChange={setAddress}
            onAddressSubmit={() => codeInputRef.current?.focus()}
            onCodeChange={setCode}
            onConnect={() => void connect(address, code)}
            onDisconnect={disconnect}
            onInputFocus={keepFocusedInputVisible}
            status={status}
          />
          <Text style={styles.footer}>Keep this app open while the camera is in use.</Text>
        </ScrollView>
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
