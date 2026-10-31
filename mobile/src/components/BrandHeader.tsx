import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export default function BrandHeader() {
  return (
    <View style={styles.header}>
      <View style={styles.brandMark}><Image source={require('../../assets/camera-icon.png')} style={styles.brandIcon} resizeMode="contain" /></View>
      <View>
        <Text style={styles.brand}>FaithStream Cam</Text>
        <Text style={styles.tagline}>Phone camera for your Studio</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  brandMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#263343', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  brandIcon: { width: 38, height: 38 },
  brand: { color: colors.text, fontWeight: '800', fontSize: 17 },
  tagline: { color: colors.muted, marginTop: 2, fontSize: 11 },
});
