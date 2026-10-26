/**
 * Electron Main Process
 * - Starts the Express backend with SQLite
 * - Opens the Quasar frontend in a BrowserWindow
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;
let expressServer: any = null;

const BACKEND_PORT = 3000;

async function startBackend() {
  // Set environment for SQLite mode
  process.env.DB_MODE = 'sqlite';
  process.env.PORT = String(BACKEND_PORT);
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'electron-local-secret-key';
  process.env.JWT_EXPIRES_IN = '24h';
  process.env.ADMIN_PASSWORD = 'admin123';
  process.env.CORS_ORIGIN = '*';

  try {
    // Import and start the Express app
    const backendPath = path.join(__dirname, '..', 'backend-dist', 'index.js');
    expressServer = require(backendPath);
    console.log(`Backend started on port ${BACKEND_PORT}`);
  } catch (err) {
    console.error('Failed to start backend:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'Aberin Hardware - Inventory & POS',
    icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  // Load the Quasar app
  const url = process.env.VITE_DEV_SERVER_URL;
  if (url) {
    // Dev mode
    mainWindow.loadURL(url);
    mainWindow.webContents.openDevTools();
  } else {
    // Production - load built files
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'spa', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toLowerCase();
    const isPrintShortcut = (input.control || input.meta) && input.shift && key === 'r';
    if (!isPrintShortcut) return;

    event.preventDefault();
    mainWindow?.webContents.print({ printBackground: true }, (success, failureReason) => {
      if (!success && failureReason) {
        console.error('[Print] Failed:', failureReason);
      }
    });
  });
}

app.whenReady().then(async () => {
  await startBackend();
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
