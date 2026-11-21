const fs = require('node:fs/promises');
const path = require('node:path');
const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

const withApkInstaller = (config) => {
  const packageName = config.android?.package || 'com.anonymous.faithstreamcam';
  const packagePath = packageName.replaceAll('.', path.sep);

  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest['uses-permission'] ??= [];
    if (!manifest['uses-permission'].some((item) => item.$['android:name'] === 'android.permission.REQUEST_INSTALL_PACKAGES')) {
      manifest['uses-permission'].push({ $: { 'android:name': 'android.permission.REQUEST_INSTALL_PACKAGES' } });
    }

    const application = manifest.application?.[0];
    if (!application) throw new Error('FaithStream APK installer could not find the Android application manifest.');
    // FaithStream Cam pairs with Studio over a local ws:// connection. Android
    // blocks cleartext traffic in release builds unless this is present in the
    // main manifest (the debug manifest setting does not carry over to release).
    application.$['android:usesCleartextTraffic'] = 'true';
    application.provider ??= [];
    if (!application.provider.some((provider) => provider.$['android:name'] === 'androidx.core.content.FileProvider')) {
      application.provider.push({
        $: {
          'android:name': 'androidx.core.content.FileProvider',
          'android:authorities': `${packageName}.faithstream-updates`,
          'android:exported': 'false',
          'android:grantUriPermissions': 'true',
        },
        'meta-data': [{
          $: {
            'android:name': 'android.support.FILE_PROVIDER_PATHS',
            'android:resource': '@xml/faithstream_file_paths',
          },
        }],
      });
    }
    return mod;
  });

  config = withMainApplication(config, (mod) => {
    let source = mod.modResults.contents;
    const importLine = `import ${packageName}.updater.FaithStreamInstallerPackage`;
    if (!source.includes(importLine)) {
      source = source.replace(/^(package [^\n]+\n)/, `$1\n${importLine}\n`);
    }
    if (!source.includes('add(FaithStreamInstallerPackage())')) {
      source = source.replace(/(PackageList\(this\)\.packages\.apply\s*\{)/, '$1\n              add(FaithStreamInstallerPackage())');
    }
    mod.modResults.contents = source;
    return mod;
  });

  config = withAppBuildGradle(config, (mod) => {
    let source = mod.modResults.contents;
    if (!source.includes('FAITHSTREAM_UPLOAD_STORE_FILE')) {
      source = source.replace(/\n    }\n    buildTypes \{/, `
        release {
            if (project.hasProperty("FAITHSTREAM_UPLOAD_STORE_FILE")) {
                storeFile file(project.property("FAITHSTREAM_UPLOAD_STORE_FILE"))
                storePassword project.property("FAITHSTREAM_UPLOAD_STORE_PASSWORD")
                keyAlias project.property("FAITHSTREAM_UPLOAD_KEY_ALIAS")
                keyPassword project.property("FAITHSTREAM_UPLOAD_KEY_PASSWORD")
            }
        }
    }
    buildTypes {`);
      const buildTypesIndex = source.indexOf('buildTypes {');
      if (buildTypesIndex >= 0) {
        const beforeBuildTypes = source.slice(0, buildTypesIndex);
        const buildTypes = source.slice(buildTypesIndex).replace(
          /(release\s*\{[\s\S]*?signingConfig )signingConfigs\.debug/,
          '$1(project.hasProperty("FAITHSTREAM_UPLOAD_STORE_FILE") ? signingConfigs.release : signingConfigs.debug)',
        );
        source = beforeBuildTypes + buildTypes;
      }
    }
    if (!source.includes('output.outputFileName = "FaithStream Cam.apk"')) {
      source += `

android.applicationVariants.all { variant ->
    variant.outputs.all { output ->
        if (variant.buildType.name == "release") {
            output.outputFileName = "FaithStream Cam.apk"
        }
    }
}
`;
    }
    mod.modResults.contents = source;
    return mod;
  });

  config = withDangerousMod(config, ['android', async (mod) => {
    const javaRoot = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', packagePath);
    const updaterDir = path.join(javaRoot, 'updater');
    const xmlDir = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    await fs.mkdir(updaterDir, { recursive: true });
    await fs.mkdir(xmlDir, { recursive: true });
    await fs.writeFile(path.join(xmlDir, 'faithstream_file_paths.xml'), `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <cache-path name="faithstream_update_apks" path="." />
</paths>
`);
    await fs.writeFile(path.join(updaterDir, 'FaithStreamInstallerModule.kt'), `package ${packageName}.updater

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

class FaithStreamInstallerModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "FaithStreamInstaller"

  @ReactMethod
  fun canInstallPackages(promise: Promise) {
    promise.resolve(Build.VERSION.SDK_INT < Build.VERSION_CODES.O || reactApplicationContext.packageManager.canRequestPackageInstalls())
  }

  @ReactMethod
  fun openInstallPermissionSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:\${reactApplicationContext.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("INSTALL_PERMISSION_SETTINGS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun installApk(rawPath: String, promise: Promise) {
    try {
      val parsed = Uri.parse(rawPath)
      val file = File(if (parsed.scheme == "file") parsed.path ?: rawPath else rawPath)
      if (!file.isFile || file.length() <= 0L) {
        promise.reject("UPDATE_FILE_MISSING", "The staged update file is missing. Download it again.")
        return
      }
      val contentUri = FileProvider.getUriForFile(
        reactApplicationContext,
        "\${reactApplicationContext.packageName}.faithstream-updates",
        file
      )
      val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(contentUri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("UPDATE_INSTALLER_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun sha256(rawPath: String, promise: Promise) {
    try {
      val parsed = Uri.parse(rawPath)
      val file = File(if (parsed.scheme == "file") parsed.path ?: rawPath else rawPath)
      if (!file.isFile || file.length() <= 0L) {
        promise.reject("UPDATE_FILE_MISSING", "The staged update file is missing.")
        return
      }
      val digest = MessageDigest.getInstance("SHA-256")
      FileInputStream(file).use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val count = input.read(buffer)
          if (count <= 0) break
          digest.update(buffer, 0, count)
        }
      }
      promise.resolve(digest.digest().joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) })
    } catch (error: Exception) {
      promise.reject("UPDATE_CHECKSUM_FAILED", error.message, error)
    }
  }
}
`);
    await fs.writeFile(path.join(updaterDir, 'FaithStreamInstallerPackage.kt'), `package ${packageName}.updater

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class FaithStreamInstallerPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(FaithStreamInstallerModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`);
    return mod;
  }]);

  return config;
};

module.exports = withApkInstaller;
