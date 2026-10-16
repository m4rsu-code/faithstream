import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    title: 'FaithStream',

    // Use your custom icon during development.
    // The packaged app uses the icon configured in forge.config.mts.
    icon: path.join(
      app.getAppPath(),
      'src',
      'assets',
      'icons',
      'win',
      'camera-logo.ico',
    ),

    // Keep native Windows controls, but blend them into the app header.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#14243A',
      symbolColor: '#F7F5F0',
      height: 40,
    },

    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Load the Vite development server or the packaged renderer.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
      ),
    );
  }

  // Uncomment this line when debugging is needed.
  // mainWindow.webContents.openDevTools();
};

app.whenReady().then(() => {
  // Remove the default File, Edit, View, and Window menus.
  Menu.setApplicationMenu(null);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});