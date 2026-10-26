/**
 * Electron Preload Script
 * Exposes safe APIs to the renderer process
 */

import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
});
