# FaithStream Cam

FaithStream Cam turns an Android or iPhone camera into a live camera source in the FaithStream desktop Studio. Video travels directly between the phone and Studio over the same local Wi-Fi network using WebRTC; no cloud video relay is used.

## Requirements

- Node.js 20 or later
- Android Studio and an Android device, or macOS with Xcode and an iPhone
- Phone and Studio computer on the same Wi-Fi network
- Allow FaithStream through the computer firewall for the temporary local pairing port

This app uses native WebRTC code, so it needs a development build and cannot run inside Expo Go.

## Project structure

- `App.tsx` — app entry point.
- `src/routes/` — screen routing and app-level navigation.
- `src/screens/` — full app pages, such as the camera screen.
- `src/components/` — reusable screen sections and controls.
- `src/hooks/` — camera and Studio connection behavior.
- `src/theme/` — shared colors and visual tokens.
- `src/types/` — shared TypeScript types.
- `src/modals/` — place for modal components when the app adds them.

## Install and run

```sh
cd mobile
npm install
npx expo run:android
```

For iPhone, run `npx expo run:ios` on macOS with Xcode and a connected iPhone. The iOS Simulator does not have a physical camera.

## Pair with Studio

1. Open Studio and choose **Sources → Add source → FaithStream Cam**.
2. Keep the pairing dialog open. It shows one or more local addresses and a six-digit code.
3. Open FaithStream Cam on the phone, enter an address including its port (for example `192.168.1.25:43127`) and the code, then tap **Connect camera**.
4. Once the source appears in Studio, position and resize it like other camera layers. Leave FaithStream Cam open while using the camera.

The pairing code and local server are temporary and are regenerated when a new pairing starts. If the phone cannot connect, confirm both devices are on the same Wi-Fi and allow FaithStream through the computer's firewall.

## Android SDK not found

If `npx expo run:android` reports that it cannot find the Android SDK or `adb`, install Android Studio and its recommended SDK packages. In Android Studio, open **Tools → SDK Manager**, note **Android SDK Location**, and install **Android SDK Platform-Tools**, **Android SDK Build-Tools**, at least one **Android SDK Platform**, and **Android SDK Command-line Tools**.

For the default Windows SDK location, set the current PowerShell session like this:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path += ";$env:ANDROID_HOME\platform-tools"
adb version
npx expo run:android
```

If Android Studio shows a different SDK Location, use that path for `ANDROID_HOME`. Open a new terminal after setting persistent Windows environment variables.
