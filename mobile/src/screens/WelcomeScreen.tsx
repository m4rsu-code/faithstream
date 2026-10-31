import { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  NativeModules,
  Platform,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

type Props = { onFinished: () => void };

export default function WelcomeScreen({ onFinished }: Props) {
  const fade = useRef(new Animated.Value(0)).current;
  const activeDot = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fadeIn = Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true });
    const dotPulse = Animated.loop(Animated.sequence([
      Animated.timing(activeDot, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(activeDot, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]));
    fadeIn.start();
    dotPulse.start();
    const timer = setTimeout(onFinished, 3000);
    return () => {
      clearTimeout(timer);
      fadeIn.stop();
      dotPulse.stop();
    };
  }, [activeDot, fade, onFinished]);

  const topInset = Platform.OS === 'android'
    ? NativeStatusBar.currentHeight ?? 0
    : NativeModules.StatusBarManager?.HEIGHT ?? 20;

  return (
    <View style={[styles.safe, { paddingTop: topInset + 8 }]}>
      <StatusBar style="light" />
      <View pointerEvents="none" style={styles.glowTop} />
      <View pointerEvents="none" style={styles.glowBottom} />
      <View pointerEvents="none" style={styles.orbitLarge} />
      <View pointerEvents="none" style={styles.orbitSmall} />
      <Animated.View style={[styles.splashContent, { opacity: fade }]}>
        <View style={styles.brandArea}>
          <Image source={require('../../assets/faithstream-logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.brandCaption}>FAITHSTREAM CAM</Text>
        </View>

        <View style={styles.messageArea}>
          <Text style={styles.readyText}>Ready{ '\n' }when{ '\n' }you are.</Text>
          <View style={styles.readyPill}>
            <View style={styles.readyDot} />
            <Text style={styles.readyLabel}>CAMERA READY</Text>
          </View>
        </View>

        <View style={styles.loadingArea}>
          <Text style={styles.loadingText}>Opening camera setup…</Text>
          <View style={styles.progressDots}>
            <View style={styles.progressDot} />
            <Animated.View style={[styles.progressDot, styles.progressDotActive, { opacity: activeDot }]} />
            <View style={styles.progressDot} />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#0b1b28',
    paddingHorizontal: 28,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  splashContent: {
    zIndex: 1,
    width: '100%',
    maxWidth: 420,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 58,
  },
  glowTop: {
    position: 'absolute',
    top: '-13%',
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(61, 129, 139, .14)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: '-20%',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(211, 146, 80, .08)',
  },
  orbitLarge: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    borderWidth: 1,
    borderColor: 'rgba(225, 232, 225, .08)',
  },
  orbitSmall: {
    position: 'absolute',
    width: 330,
    height: 330,
    borderRadius: 165,
    borderWidth: 1,
    borderColor: 'rgba(225, 232, 225, .05)',
  },
  brandArea: { alignItems: 'center', marginTop: 24 },
  logo: { width: 176, height: 84 },
  brandCaption: { marginTop: 7, color: '#d39250', fontSize: 10, fontWeight: '700', letterSpacing: 2.8 },
  messageArea: { alignItems: 'center' },
  readyText: {
    color: '#f5f1e8',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    fontSize: 45,
    lineHeight: 49,
    textAlign: 'center',
  },
  readyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(85,221,197,.32)',
    borderRadius: 18,
  },
  readyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#55ddc5' },
  readyLabel: { color: '#80d8c7', fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  loadingArea: { alignItems: 'center', gap: 15, marginBottom: 18 },
  loadingText: { color: '#9aaab2', fontSize: 13, letterSpacing: 0.3 },
  progressDots: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  progressDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: '#667a83' },
  progressDotActive: { width: 22, borderColor: '#d39250', backgroundColor: '#d39250' },
});
