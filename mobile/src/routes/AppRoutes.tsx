import { useCallback, useState } from 'react';
import CameraScreen from '../screens/CameraScreen';
import WelcomeScreen from '../screens/WelcomeScreen';

/** Central entry for app screens. Add or switch routes here as the app grows. */
export default function AppRoutes() {
  const [showWelcome, setShowWelcome] = useState(true);
  const finishWelcome = useCallback(() => setShowWelcome(false), []);

  return showWelcome ? <WelcomeScreen onFinished={finishWelcome} /> : <CameraScreen />;
}
