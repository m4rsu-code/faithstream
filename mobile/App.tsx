import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  MediaStream,
  mediaDevices,
  RTCPeerConnection as NativeRTCPeerConnection,
  RTCView,
  type RTCPeerConnection,
  registerGlobals,
} from 'react-native-webrtc';

registerGlobals();

type Signal = { type: 'offer' | 'answer' | 'ice' | 'joined' | 'error'; sdp?: string; candidate?: RTCIceCandidateInit; message?: string };
const palette = { bg: '#09131e', panel: '#122131', line: '#26384a', text: '#f5f7fa', muted: '#9aabba', orange: '#d58b4d', green: '#36c98a' };

export default function App() {
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('Not connected');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camera, setCamera] = useState<'front' | 'back'>('back');
  const socket = useRef<WebSocket | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);

  const disconnect = () => {
    const currentSocket = socket.current;
    if (currentSocket) { currentSocket.onclose = null; currentSocket.onerror = null; currentSocket.onmessage = null; currentSocket.close(); }
    socket.current = null;
    peer.current?.close(); peer.current = null;
    local.current?.getTracks().forEach((track) => track.stop()); local.current = null;
    setStream(null); setStatus('Not connected');
  };

  useEffect(() => () => {
    socket.current?.close(); peer.current?.close();
    local.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const connect = async () => {
    const host = address.trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
    const pin = code.trim();
    if (!host || !/^\d{6}$/.test(pin)) { Alert.alert('Enter Studio details', 'Enter the local network address shown in Studio and its six-digit pairing code.'); return; }
    try {
      setStatus('Requesting camera permission…');
      const cameraStream = await mediaDevices.getUserMedia({ audio: false, video: { facingMode: camera === 'front' ? 'user' : 'environment', width: 1280, height: 720, frameRate: 30 } });
      local.current = cameraStream; setStream(cameraStream);
      setStatus('Connecting to Studio…');
      const ws = new WebSocket(`ws://${host}/?code=${encodeURIComponent(pin)}&role=phone`);
      const queuedIce: RTCIceCandidateInit[] = [];
      let hasRemoteDescription = false;
      socket.current = ws;
      ws.onerror = () => setStatus('Could not reach Studio. Check Wi-Fi and address.');
      ws.onclose = () => {
        peer.current?.close(); peer.current = null;
        local.current?.getTracks().forEach((track) => track.stop()); local.current = null;
        setStream(null); setStatus('Studio disconnected');
      };
      ws.onopen = () => { setStatus('Waiting for Studio…'); };
      ws.onmessage = async (event) => {
        let message: Signal;
        try { message = JSON.parse(String(event.data)); } catch { return; }
        if (message.type === 'error') { setStatus(message.message || 'Pairing failed'); return; }
        if (message.type === 'joined') { setStatus('Connected · camera ready'); return; }
        if (message.type === 'offer' && message.sdp) {
          const pc = new NativeRTCPeerConnection({ iceServers: [] }); peer.current = pc;
          cameraStream.getTracks().forEach((track) => pc.addTrack(track, cameraStream));
          pc.onicecandidate = (ev: { candidate: { toJSON: () => RTCIceCandidateInit } | null }) => { if (ev.candidate && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ice', candidate: ev.candidate.toJSON() })); };
          pc.onconnectionstatechange = () => setStatus(pc.connectionState === 'connected' ? 'On air · connected to Studio' : `Camera ${pc.connectionState}`);
          await pc.setRemoteDescription({ type: 'offer', sdp: message.sdp });
          hasRemoteDescription = true;
          for (const candidate of queuedIce.splice(0)) { try { await pc.addIceCandidate(candidate); } catch { /* Ignore stale ICE candidates. */ } }
          const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }));
        } else if (message.type === 'ice' && message.candidate && peer.current) {
          if (!hasRemoteDescription) queuedIce.push(message.candidate);
          else { try { await peer.current.addIceCandidate(message.candidate); } catch { /* Ignore stale ICE candidates. */ } }
        } else if (message.type === 'ice' && message.candidate) {
          queuedIce.push(message.candidate);
        }
      };
    } catch (error) {
      disconnect();
      const detail = error instanceof Error ? error.message : 'Camera setup failed.';
      Alert.alert('Could not start FaithStream Cam', detail);
    }
  };

  const flipCamera = async () => {
    if (!local.current) return;
    const next = camera === 'back' ? 'front' : 'back'; setCamera(next);
    try {
      const replacement = await mediaDevices.getUserMedia({ audio: false, video: { facingMode: next === 'front' ? 'user' : 'environment', width: 1280, height: 720, frameRate: 30 } });
      const track = replacement.getVideoTracks()[0];
      const sender = peer.current?.getSenders().find((item) => item.track?.kind === 'video');
      if (sender && track) await sender.replaceTrack(track);
      local.current.getTracks().forEach((item) => item.stop()); local.current = replacement; setStream(replacement);
    } catch { setCamera(camera); }
  };

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="light" />
    <View style={styles.header}><View style={styles.brandMark}><Text style={styles.brandIcon}>◉</Text></View><View><Text style={styles.brand}>FaithStream Cam</Text><Text style={styles.tagline}>Phone camera for your Studio</Text></View></View>
    <View style={styles.preview}>
      {stream ? <RTCView streamURL={stream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" mirror={camera === 'front'} /> : <View style={styles.empty}><Text style={styles.cameraIcon}>◉</Text><Text style={styles.emptyTitle}>Your camera preview</Text><Text style={styles.muted}>Connect to Studio to send this camera</Text></View>}
      <View style={styles.liveBadge}><View style={[styles.dot, { backgroundColor: status.startsWith('On air') ? palette.green : palette.orange }]} /><Text style={styles.badgeText}>{status.startsWith('On air') ? 'CONNECTED' : 'CAMERA'}</Text></View>
      {stream && <TouchableOpacity onPress={() => void flipCamera()} style={styles.flip}><Text style={styles.flipText}>Flip</Text></TouchableOpacity>}
    </View>
    <View style={styles.card}>
      <Text style={styles.section}>Connect to FaithStream Studio</Text>
      <Text style={styles.hint}>On the same Wi-Fi, choose Add source → FaithStream Cam in Studio. Enter the address and code shown there.</Text>
      <Text style={styles.label}>Studio address</Text><TextInput value={address} onChangeText={setAddress} placeholder="192.168.1.25:43127" placeholderTextColor="#718397" autoCapitalize="none" keyboardType="url" style={styles.input} />
      <Text style={styles.label}>6-digit pairing code</Text><TextInput value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" placeholderTextColor="#718397" keyboardType="number-pad" maxLength={6} style={[styles.input, styles.pin]} />
      {stream ? <TouchableOpacity onPress={disconnect} style={[styles.button, styles.disconnect]}><Text style={styles.buttonText}>Disconnect camera</Text></TouchableOpacity> : <TouchableOpacity onPress={() => void connect()} style={styles.button}><Text style={styles.buttonText}>Connect camera</Text></TouchableOpacity>}
      <Text style={styles.status}>{status}</Text>
    </View>
    <Text style={styles.footer}>Keep this app open while the camera is in use.</Text>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg, paddingHorizontal: 18, paddingTop: 14 },
  header: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  brandMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#263343', alignItems: 'center', justifyContent: 'center' }, brandIcon: { color: palette.orange, fontSize: 24 }, brand: { color: palette.text, fontWeight: '800', fontSize: 17 }, tagline: { color: palette.muted, marginTop: 2, fontSize: 11 },
  preview: { height: '39%', minHeight: 210, maxHeight: 380, backgroundColor: '#03070b', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: palette.line }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center' }, cameraIcon: { fontSize: 42, color: '#607386', marginBottom: 8 }, emptyTitle: { color: palette.text, fontSize: 14, fontWeight: '700' }, muted: { color: palette.muted, marginTop: 5, fontSize: 11 },
  liveBadge: { position: 'absolute', top: 12, left: 12, borderRadius: 20, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#09131eee', paddingHorizontal: 10, paddingVertical: 6 }, dot: { width: 7, height: 7, borderRadius: 4 }, badgeText: { color: palette.text, fontWeight: '800', fontSize: 9, letterSpacing: 0.7 }, flip: { position: 'absolute', bottom: 12, right: 12, backgroundColor: '#09131eee', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 }, flipText: { color: palette.text, fontWeight: '700' },
  card: { marginTop: 18, padding: 16, borderRadius: 16, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.line }, section: { color: palette.text, fontSize: 15, fontWeight: '800' }, hint: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 6, marginBottom: 12 }, label: { color: '#c6d0db', fontWeight: '600', fontSize: 11, marginTop: 7, marginBottom: 5 }, input: { borderColor: palette.line, borderWidth: 1, borderRadius: 9, color: palette.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 }, pin: { letterSpacing: 5 }, button: { marginTop: 14, backgroundColor: palette.orange, padding: 12, alignItems: 'center', borderRadius: 9 }, disconnect: { backgroundColor: '#334252' }, buttonText: { color: '#101923', fontWeight: '800' }, status: { textAlign: 'center', color: palette.muted, fontSize: 11, marginTop: 10 }, footer: { color: '#718397', textAlign: 'center', fontSize: 10, marginTop: 'auto', paddingVertical: 14 },
});
