import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Dimensions } from 'react-native';
import {
  mediaDevices,
  RTCPeerConnection as NativeRTCPeerConnection,
  type MediaStream,
  type RTCPeerConnection,
  registerGlobals,
} from 'react-native-webrtc';
import type { Signal } from '../types/signaling';

registerGlobals();

export type CameraFacing = 'front' | 'back';
type CameraOrientation = 'portrait' | 'landscape';

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
  const [status, setStatus] = useState('Not connected');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camera, setCamera] = useState<CameraFacing>('back');
  const cameraRef = useRef<CameraFacing>('back');
  const socket = useRef<WebSocket | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const orientationSubscription = useRef<{ remove: () => void } | null>(null);

  const disconnect = useCallback(() => {
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
    setStatus('Disconnected');
  }, []);

  useEffect(() => () => {
    socket.current?.close();
    orientationSubscription.current?.remove();
    peer.current?.close();
    local.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const connect = useCallback(async (address: string, code: string) => {
    const host = address.trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
    const pin = code.trim();
    if (!host || !/^\d{6}$/.test(pin)) {
      Alert.alert('Enter Studio details', 'Enter the local network address shown in Studio and its six-digit pairing code.');
      return;
    }

    try {
      setStatus('Requesting camera permission…');
      const activeOrientation = readScreenOrientation();
      const cameraStream = await mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints(camera, activeOrientation),
      });
      local.current = cameraStream;
      setStream(cameraStream);
      setStatus('Connecting to Studio…');

      const ws = new WebSocket(`ws://${host}/?code=${encodeURIComponent(pin)}&role=phone`);
      const queuedIce: RTCIceCandidateInit[] = [];
      let hasRemoteDescription = false;
      socket.current = ws;

      ws.onerror = () => {
        setStatus('Could not reach Studio. Check Wi-Fi and address.');
        ws.close();
      };
      ws.onclose = () => {
        orientationSubscription.current?.remove();
        orientationSubscription.current = null;
        peer.current?.close();
        peer.current = null;
        local.current?.getTracks().forEach((track) => track.stop());
        local.current = null;
        setStream(null);
        setStatus('Studio disconnected');
      };
      ws.onopen = () => {
        setStatus('Waiting for Studio…');
        orientationSubscription.current?.remove();
        const sendOrientation = (orientation: CameraOrientation) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'orientation', orientation }));
        };
        const updateForOrientation = (width: number, height: number) => {
          const nextOrientation: CameraOrientation = width > height ? 'landscape' : 'portrait';
          sendOrientation(nextOrientation);
        };
        const initialScreen = Dimensions.get('screen');
        orientationSubscription.current = Dimensions.addEventListener('change', ({ screen: nextScreen }) => {
          void updateForOrientation(nextScreen.width, nextScreen.height);
        });
        void updateForOrientation(initialScreen.width, initialScreen.height);
      };
      ws.onmessage = async (event) => {
        let message: Signal;
        try { message = JSON.parse(String(event.data)); } catch { return; }
        if (message.type === 'error') { setStatus(message.message || 'Pairing failed'); ws.close(); return; }
        if (message.type === 'joined') { setStatus('Connected · camera ready'); return; }

        if (message.type === 'offer' && message.sdp) {
          const connection = new NativeRTCPeerConnection({ iceServers: [] });
          peer.current = connection;
          (local.current ?? cameraStream).getTracks().forEach((track) => connection.addTrack(track, local.current ?? cameraStream));
          connection.onicecandidate = (event) => {
            if (event.candidate && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ice', candidate: event.candidate.toJSON() }));
            }
          };
          connection.onconnectionstatechange = () => {
            if (connection.connectionState === 'connected') setStatus('On air · connected to Studio');
            else if (connection.connectionState === 'failed') {
              setStatus('Studio disconnected');
              ws.close();
            } else if (connection.connectionState === 'disconnected') setStatus('Reconnecting to Studio…');
            else setStatus(`Camera ${connection.connectionState}`);
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
        } else if (message.type === 'ice' && message.candidate) {
          queuedIce.push(message.candidate);
        }
      };
    } catch (error) {
      disconnect();
      const detail = error instanceof Error ? error.message : 'Camera setup failed.';
      Alert.alert('Could not start FaithStream Cam', detail);
    }
  }, [camera, disconnect]);

  const flipCamera = useCallback(async () => {
    if (!local.current) return;
    const next: CameraFacing = camera === 'back' ? 'front' : 'back';
    cameraRef.current = next;
    setCamera(next);
    try {
      const replacement = await mediaDevices.getUserMedia({ audio: false, video: videoConstraints(next, readScreenOrientation()) });
      const track = replacement.getVideoTracks()[0];
      const sender = peer.current?.getSenders().find((item) => item.track?.kind === 'video');
      if (sender && track) await sender.replaceTrack(track);
      local.current.getTracks().forEach((item) => item.stop());
      local.current = replacement;
      setStream(replacement);
    } catch {
      cameraRef.current = camera;
      setCamera(camera);
    }
  }, [camera]);

  return { camera, connect, disconnect, flipCamera, status, stream };
}
