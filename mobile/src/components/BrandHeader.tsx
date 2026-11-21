import { Image, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { colors } from '../theme/colors';

export default function BrandHeader() {
  const appVersion = Constants.expoConfig?.version ?? Constants.nativeAppVersion;

  return (
    <View style={styles.header}>
      <View style={styles.brandGroup}>
        <View style={styles.brandMark}><Image source={require('../../assets/camera-icon.png')} style={styles.brandIcon} resizeMode="contain" /></View>
        <View>
          <Text style={styles.brand}>FaithStream Cam</Text>
          <Text style={styles.tagline}>Phone camera for your Studio</Text>
        </View>
      </View>
      {!!appVersion && <Text style={styles.version}>v{appVersion}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  brandGroup: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#263343', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  brandIcon: { width: 38, height: 38 },
  brand: { color: colors.text, fontWeight: '800', fontSize: 17 },
  tagline: { color: colors.muted, marginTop: 2, fontSize: 11 },
  version: { alignSelf: 'flex-start', marginTop: 11, color: colors.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
});
