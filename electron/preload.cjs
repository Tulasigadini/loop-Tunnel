const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Tunnel
  startTunnel: (options) => ipcRenderer.invoke('tunnel:start', options),
  stopTunnel: () => ipcRenderer.invoke('tunnel:stop'),
  getTunnelStatus: () => ipcRenderer.invoke('tunnel:get-status'),
  getConsoleLogs: () => ipcRenderer.invoke('tunnel:get-console'),
  clearConsoleLogs: () => ipcRenderer.invoke('tunnel:clear-console'),
  onConsoleLog: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('tunnel:console-log', subscription);
    return () => ipcRenderer.removeListener('tunnel:console-log', subscription);
  },
  onTunnelStatusChange: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('tunnel:status-changed', subscription);
    return () => ipcRenderer.removeListener('tunnel:status-changed', subscription);
  },

  // Inspector
  getInspectorLogs: () => ipcRenderer.invoke('inspector:get-logs'),
  clearInspectorLogs: () => ipcRenderer.invoke('inspector:clear-logs'),
  onInspectorLog: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('inspector:new-log', subscription);
    return () => ipcRenderer.removeListener('inspector:new-log', subscription);
  },

  // API Testing (Direct Node execution)
  sendApiRequest: (reqConfig) => ipcRenderer.invoke('api:send-request', reqConfig),

  // Config & Profiles
  getConfig: (key) => ipcRenderer.invoke('config:get', key),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
  getAllConfig: () => ipcRenderer.invoke('config:get-all'),
  saveProfile: (profile) => ipcRenderer.invoke('config:save-profile', profile),
  deleteProfile: (name) => ipcRenderer.invoke('config:delete-profile', name),

  // Collections (API Testing)
  getCollections: () => ipcRenderer.invoke('collections:get'),
  saveCollections: (collections) => ipcRenderer.invoke('collections:save', collections),

  // System Helpers
  checkPort: (port) => ipcRenderer.invoke('system:check-port', port),
  openExternal: (url) => ipcRenderer.invoke('system:open-url', url),
  copyClipboard: (text) => ipcRenderer.invoke('system:copy-clipboard', text),
  getAppVersion: () => ipcRenderer.invoke('system:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('system:check-updates'),

  // Window Controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onWindowMaximizeChange: (callback) => {
    const subscription = (_event, isMax) => callback(isMax);
    ipcRenderer.on('window:maximize-change', subscription);
    return () => ipcRenderer.removeListener('window:maximize-change', subscription);
  }
});
