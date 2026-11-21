import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Dimensions } from 'react-native';
import {
  mediaDevices,
  RTCPeerConnection as NativeRTCPeerConnection,
  type MediaStream,
  type MediaStreamTrack as NativeMediaStreamTrack,
  type RTCPeerConnection,
  registerGlobals,
} from 'react-native-webrtc';
import type { Signal } from '../types/signaling';

registerGlobals();

export type CameraFacing = 'front' | 'back';
type CameraOrientation = 'portrait' | 'landscape';
export type CameraConnectionPhase = 'idle' | 'requesting-permission' | 'connecting' | 'waiting-for-studio' | 'connected' | 'publishing' | 'reconnecting' | 'disconnected' | 'failed';
type CameraConnectionState = { phase: Exclude<CameraConnectionPhase, 'failed'> } | { phase: 'failed'; message: string };

const phaseMessages: Record<Exclude<CameraConnectionPhase, 'failed'>, string> = {
  idle: 'Not connected',
  'requesting-permission': 'Requesting camera permission…',
  connecting: 'Connecting to Studio…',
  'waiting-for-studio': 'Waiting for Studio…',
  connected: 'Connected · camera ready',
  publishing: 'On air · connected to Studio',
  reconnecting: 'Reconnecting to Studio…',
  disconnected: 'Studio disconnected',
};
const isActiveConnection = (phase: CameraConnectionPhase) => ['requesting-permission', 'connecting', 'waiting-for-studio', 'connected', 'publishing', 'reconnecting'].includes(phase);

const readScreenOrientation = (): CameraOrientation => {
  const { width, height } = Dimensions.get('screen');
  return width > height ? 'landscape' : 'portrait';
};

const videoConstraints = (facing: CameraFacing, orientation: CameraOrientation) => ({
  facingMode: facing === 'front' ? 'user' : 'environment',
  width: orientation === 'landscape' ? 1280 : 720,
  height: orientation === 'landscape' ? 720 : 1280,
  frameRate: 30,
});

export function useStudioCamera() {
  const [connection, setConnection] = useState<CameraConnectionState>({ phase: 'idle' });
  const connectionRef = useRef<CameraConnectionState>({ phase: 'idle' });
  const attemptId = useRef(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camera, setCamera] = useState<CameraFacing>('back');
  const [phoneMicrophoneEnabled, setPhoneMicrophoneEnabled] = useState(false);
  const cameraRef = useRef<CameraFacing>('back');
  const socket = useRef<WebSocket | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const orientationSubscription = useRef<{ remove: () => void } | null>(null);

  const transition = useCallback((next: CameraConnectionState) => {
    connectionRef.current = next;
    setConnection(next);
  }, []);
  const status = connection.phase === 'failed' ? connection.message : phaseMessages[connection.phase];

  const disconnect = useCallback(() => {
    attemptId.current += 1;
    const currentSocket = socket.current;
    if (currentSocket) {
      currentSocket.onclose = null;
      currentSocket.onerror = null;
      currentSocket.onmessage = null;
      currentSocket.close();
    }
    socket.current = null;
    orientationSubscription.current?.remove();
    orientationSubscription.current = null;
    peer.current?.close();
    peer.current = null;
    local.current?.getTracks().forEach((track) => track.stop());
    local.current = null;
    setStream(null);
    setPhoneMicrophoneEnabled(false);
    transition({ phase: 'disconnected' });
  }, [transition]);

  useEffect(() => () => {
    attemptId.current += 1;
    if (socket.current) {
      socket.current.onclose = null;
      socket.current.onerror = null;
      socket.current.onmessage = null;
    }
    socket.current?.close();
    orientationSubscription.current?.remove();
    peer.current?.close();
    local.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const connect = useCallback(async (address: string | string[], code: string, shareMicrophone = false) => {
    if (isActiveConnection(connectionRef.current.phase)) return;
    const hosts = [...new Set((Array.isArray(address) ? address : [address])
      .map((value) => value.trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, ''))
      .filter(Boolean))];
    const pin = code.trim();
    if (!hosts.length || !/^\d{6}$/.test(pin)) {
      Alert.alert('Enter Studio details', 'Enter the local network address shown in Studio and its six-digit pairing code.');
      return;
    }

    const attempt = ++attemptId.current;
    transition({ phase: 'requesting-permission' });
    try {
      const activeOrientation = readScreenOrientation();
      const cameraStream = await mediaDevices.getUserMedia({ audio: false, video: videoConstraints(camera, activeOrientation) });
      if (attempt !== attemptId.current) {
        cameraStream.getTracks().forEach((track) => track.stop());
        return;
      }
      let microphoneTracks: NativeMediaStreamTrack[] = [];
      if (shareMicrophone) {
        try {
          const microphoneStream = await mediaDevices.getUserMedia({ video: false, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
          microphoneTracks = microphoneStream.getAudioTracks();
        } catch {
          Alert.alert('Microphone unavailable', 'FaithStream Cam will connect the camera without phone audio. Check microphone permission in Android settings if you want to use it.');
        }
      }
      if (attempt !== attemptId.current) {
        cameraStream.getTracks().forEach((track) => track.stop());
        microphoneTracks.forEach((track) => track.stop());
        return;
      }
      const localStream = new MediaStream([...cameraStream.getVideoTracks(), ...microphoneTracks]);
      local.current = localStream;
      setStream(localStream);
      setPhoneMicrophoneEnabled(microphoneTracks.length > 0);
      transition({ phase: 'connecting' });

      const queuedIce: RTCIceCandidateInit[] = [];
      let hasRemoteDescription = false;
      let terminalFailure = false;
      const finishAsDisconnected = () => {
        orientationSubscription.current?.remove();
        orientationSubscription.current = null;
        peer.current?.close();
        peer.current = null;
        local.current?.getTracks().forEach((track) => track.stop());
        local.current = null;
        setStream(null);
        setPhoneMicrophoneEnabled(false);
        if (!terminalFailure) transition({ phase: 'disconnected' });
      };
      const connectToHost = (hostIndex: number) => {
        if (attempt !== attemptId.current) return;
        const ws = new WebSocket(`ws://${hosts[hostIndex]}/?code=${encodeURIComponent(pin)}&role=phone`);
        let joined = false;
        let movedToNextHost = false;
        let joinTimer: ReturnType<typeof setTimeout> | undefined;
        socket.current = ws;
        const tryNextHost = () => {
          if (joined || movedToNextHost || terminalFailure || attempt !== attemptId.current) return;
          movedToNextHost = true;
          if (joinTimer) clearTimeout(joinTimer);
          ws.onerror = null;
          ws.onclose = null;
          try { ws.close(); } catch { /* Socket may already be closed. */ }
          if (hostIndex + 1 < hosts.length) {
            connectToHost(hostIndex + 1);
            return;
          }
          terminalFailure = true;
          finishAsDisconnected();
          transition({ phase: 'failed', message: 'Studio did not respond at the scanned addresses. Check Wi-Fi, address, and firewall.' });
        };
        ws.onerror = tryNextHost;
        ws.onclose = () => {
          if (attempt !== attemptId.current || socket.current !== ws) return;
          if (!joined) {
            if (terminalFailure) finishAsDisconnected();
            else tryNextHost();
            return;
          }
          finishAsDisconnected();
        };
        ws.onopen = () => {
          if (attempt !== attemptId.current) return;
          transition({ phase: 'waiting-for-studio' });
          joinTimer = setTimeout(tryNextHost, 4000);
        };
        ws.onmessage = async (event) => {
          if (attempt !== attemptId.current || socket.current !== ws) return;
          let message: Signal;
          try { message = JSON.parse(String(event.data)); } catch { return; }
          if (message.type === 'error') {
            terminalFailure = true;
            transition({ phase: 'failed', message: message.message || 'Pairing failed' });
            ws.close();
            return;
          }
          if (message.type === 'joined') {
            joined = true;
            if (joinTimer) clearTimeout(joinTimer);
            transition({ phase: 'connected' });
            orientationSubscription.current?.remove();
            const sendOrientation = (orientation: CameraOrientation) => {
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'orientation', orientation }));
            };
            const updateForOrientation = (width: number, height: number) => sendOrientation(width > height ? 'landscape' : 'portrait');
            const initialScreen = Dimensions.get('screen');
            orientationSubscription.current = Dimensions.addEventListener('change', ({ screen: nextScreen }) => {
              updateForOrientation(nextScreen.width, nextScreen.height);
            });
            updateForOrientation(initialScreen.width, initialScreen.height);
            return;
          }

          if (message.type === 'offer' && message.sdp) {
            const connection = new NativeRTCPeerConnection({ iceServers: [] });
            peer.current = connection;
            (local.current ?? localStream).getTracks().forEach((track) => connection.addTrack(track, local.current ?? localStream));
            connection.onicecandidate = (event) => {
              if (event.candidate && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ice', candidate: event.candidate.toJSON() }));
            };
            connection.onconnectionstatechange = () => {
              if (attempt !== attemptId.current) return;
              if (connection.connectionState === 'connected') transition({ phase: 'publishing' });
              else if (connection.connectionState === 'failed') {
                terminalFailure = true;
                transition({ phase: 'failed', message: 'Camera connection failed. Reconnect to Studio and try again.' });
                ws.close();
              } else if (connection.connectionState === 'disconnected') transition({ phase: 'reconnecting' });
              else if (connection.connectionState === 'closed') transition({ phase: 'disconnected' });
              else transition({ phase: 'connecting' });
            };
            await connection.setRemoteDescription({ type: 'offer', sdp: message.sdp });
            hasRemoteDescription = true;
            for (const candidate of queuedIce.splice(0)) {
              try { await connection.addIceCandidate(candidate); } catch { /* Ignore stale ICE candidates. */ }
            }
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }));
          } else if (message.type === 'ice' && message.candidate && peer.current) {
            if (!hasRemoteDescription) queuedIce.push(message.candidate);
            else {
              try { await peer.current.addIceCandidate(message.candidate); } catch { /* Ignore stale ICE candidates. */ }
            }
          } else if (message.type === 'ice' && message.candidate) queuedIce.push(message.candidate);
        };
      };
      connectToHost(0);
    } catch (error) {
      if (attempt !== attemptId.current) return;
      disconnect();
      const detail = error instanceof Error ? error.message : 'Camera setup failed.';
      transition({ phase: 'failed', message: detail });
      Alert.alert('Could not start FaithStream Cam', detail);
    }
  }, [camera, disconnect, transition]);

  const togglePhoneMicrophone = useCallback(() => {
    const tracks = local.current?.getAudioTracks() ?? [];
    if (!tracks.length) return;
    const enabled = !tracks.some((track) => track.enabled);
    tracks.forEach((track) => { track.enabled = enabled; });
    setPhoneMicrophoneEnabled(enabled);
  }, []);

  const flipCamera = useCallback(async () => {
    const currentStream = local.current;
    if (!currentStream) return;
    const attempt = attemptId.current;
    const next: CameraFacing = camera === 'back' ? 'front' : 'back';
    cameraRef.current = next;
    setCamera(next);
    let replacement: MediaStream | null = null;
    try {
      replacement = await mediaDevices.getUserMedia({ audio: false, video: videoConstraints(next, readScreenOrientation()) });
      if (attempt !== attemptId.current || local.current !== currentStream) {
        replacement.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = replacement.getVideoTracks()[0];
      const sender = peer.current?.getSenders().find((item) => item.track?.kind === 'video');
      if (sender && track) await sender.replaceTrack(track);
      if (attempt !== attemptId.current || local.current !== currentStream) {
        replacement.getTracks().forEach((item) => item.stop());
        return;
      }
      const nextStream = new MediaStream([...replacement.getVideoTracks(), ...currentStream.getAudioTracks()]);
      currentStream.getVideoTracks().forEach((item) => item.stop());
      local.current = nextStream;
      setStream(nextStream);
    } catch {
      if (attempt !== attemptId.current) {
        replacement?.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraRef.current = camera;
      setCamera(camera);
    }
  }, [camera]);

  return { camera, connect, disconnect, flipCamera, phase: connection.phase, status, stream, phoneMicrophoneEnabled, togglePhoneMicrophone };
}
