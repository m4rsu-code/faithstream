import type { RefObject } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

type Props = {
  address: string;
  code: string;
  connected: boolean;
  codeInputRef: RefObject<TextInput | null>;
  onAddressChange: (value: string) => void;
  onAddressSubmit: () => void;
  onCodeChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onInputFocus: () => void;
  status: string;
};

export default function ConnectionForm({
  address, code, connected, codeInputRef, onAddressChange, onAddressSubmit, onCodeChange,
  onConnect, onDisconnect, onInputFocus, status,
}: Props) {
  const disconnected = status === 'Studio disconnected' || status === 'Disconnected' || status.startsWith('Could not reach Studio');
  const connecting = status.startsWith('Requesting') || status.startsWith('Connecting') || status.startsWith('Waiting');
  const indicatorColor = connected ? colors.green : disconnected ? '#ef6b6b' : connecting ? colors.orange : '#718397';

  return (
    <View style={styles.card}>
      <Text style={styles.section}>Connect to FaithStream Studio</Text>
      <Text style={styles.hint}>On the same Wi-Fi, choose Add source → FaithStream Cam in Studio. Enter the address and code shown there.</Text>
      <Text style={styles.label}>Studio address</Text>
      <TextInput
        value={address}
        onChangeText={onAddressChange}
        onFocus={onInputFocus}
        onSubmitEditing={onAddressSubmit}
        returnKeyType="next"
        placeholder="192.168.1.25:43127"
        placeholderTextColor="#718397"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={styles.input}
      />
      <Text style={styles.label}>6-digit pairing code</Text>
      <TextInput
        ref={codeInputRef}
        value={code}
        onChangeText={(value) => onCodeChange(value.replace(/\D/g, '').slice(0, 6))}
        onFocus={onInputFocus}
        onSubmitEditing={Keyboard.dismiss}
        returnKeyType="done"
        placeholder="000000"
        placeholderTextColor="#718397"
        keyboardType="number-pad"
        maxLength={6}
        style={[styles.input, styles.pin]}
      />
      <TouchableOpacity onPress={connected ? onDisconnect : onConnect} style={[styles.button, connected && styles.disconnect, disconnected && styles.reconnect]}>
        <Text style={styles.buttonText}>{connected ? 'Disconnect camera' : disconnected ? 'Reconnect camera' : 'Connect camera'}</Text>
      </TouchableOpacity>
      <View accessibilityLiveRegion="polite" style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: indicatorColor }]} />
        <Text style={[styles.status, disconnected && styles.disconnectedStatus]}>{disconnected ? 'Disconnected from Studio' : status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 18, padding: 16, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  section: { color: colors.text, fontSize: 15, fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 6, marginBottom: 12 },
  label: { color: '#c6d0db', fontWeight: '600', fontSize: 11, marginTop: 7, marginBottom: 5 },
  input: { minHeight: 46, borderColor: colors.line, borderWidth: 1, borderRadius: 9, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#0b1723' },
  pin: { letterSpacing: 5 },
  button: { marginTop: 14, backgroundColor: colors.orange, padding: 12, alignItems: 'center', borderRadius: 9, minHeight: 46, justifyContent: 'center' },
  disconnect: { backgroundColor: '#334252' },
  reconnect: { backgroundColor: '#8c3f37' },
  buttonText: { color: '#101923', fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  status: { textAlign: 'center', color: colors.muted, fontSize: 11 },
  disconnectedStatus: { color: '#ff9990', fontWeight: '700' },
});
