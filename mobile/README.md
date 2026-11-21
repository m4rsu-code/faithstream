# FaithStream Cam

FaithStream Cam turns an Android or iPhone camera into a live camera source in the FaithStream Studio desktop Studio. Video travels directly between the phone and Studio over the same local Wi-Fi network using WebRTC; no cloud video relay is used.

## Requirements

- Node.js 20 or later
- Android Studio and an Android device, or macOS with Xcode and an iPhone
- Phone and Studio computer on the same Wi-Fi network
- Allow FaithStream Studio through the computer firewall for the temporary local pairing port

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

## Android in-app updates

FaithStream Cam checks the public GitHub Releases page for `m4rsu-code/faithstream` when it opens. When it finds a newer version with an APK attached, the user can choose **Download update**, wait for it to be staged, then tap **Install update**. Android asks the user to allow FaithStream Cam to install updates the first time. iPhone updates must be distributed through Apple's app distribution process.

To publish an Android update:

1. Increase `expo.version` and `expo.android.versionCode` in `app.json` (for example, `1.0.0`/`1` to `1.0.1`/`2`). Keep the Android package name unchanged.
2. Build the release APK with `cd android; .\gradlew assembleRelease` from PowerShell. The file is `android\app\build\outputs\apk\release\FaithStream Cam.apk`.
3. In GitHub, create a release with a matching tag such as `v1.0.1`, then attach the release APK. The updater only offers published releases, not drafts or prereleases.

Android accepts an update only when its version code is higher and it is signed with the same signing key as the installed app. The generated project currently falls back to Android's debug key until a release key is configured. Before distributing an APK broadly, create a permanent upload keystore, keep a backup in a safe place, and configure these properties in your user-level Gradle properties file (never commit the passwords or keystore):

```properties
FAITHSTREAM_UPLOAD_STORE_FILE=C:/secure/path/faithstream-upload.jks
FAITHSTREAM_UPLOAD_STORE_PASSWORD=your-store-password
FAITHSTREAM_UPLOAD_KEY_ALIAS=faithstream
FAITHSTREAM_UPLOAD_KEY_PASSWORD=your-key-password
```

If an APK has already been shared, keep using the same signing key for all its updates. A different key requires users to uninstall the old app first, which removes its local app data.

## Pair with Studio

1. Open Studio and choose **Sources → Add source → FaithStream Cam**.
2. Keep the pairing dialog open. It shows one or more local addresses and a six-digit code.
3. Open FaithStream Cam on the phone, enter an address including its port (for example `192.168.1.25:43127`) and the code, then tap **Connect camera**.
4. Once the source appears in Studio, position and resize it like other camera layers. Leave FaithStream Cam open while using the camera.

The pairing code and local server are temporary and are regenerated when a new pairing starts. If the phone cannot connect, confirm both devices are on the same Wi-Fi and allow FaithStream Studio through the computer's firewall.

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
