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
  scanPorts: (list) => ipcRenderer.invoke('system:scan-ports', list),
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
  },

  // Offline Peer-to-Peer File Sharing (Zero Internet)
  fileShare: {
    getLocalInfo: () => ipcRenderer.invoke('fileshare:get-local-info'),
    setDeviceName: (name) => ipcRenderer.invoke('fileshare:set-device-name', name),
    startDiscovery: () => ipcRenderer.invoke('fileshare:start-discovery'),
    stopDiscovery: () => ipcRenderer.invoke('fileshare:stop-discovery'),
    scanRadar: () => ipcRenderer.invoke('fileshare:scan-radar'),
    directConnect: (ip, port) => ipcRenderer.invoke('fileshare:direct-connect', ip, port),
    pickFiles: () => ipcRenderer.invoke('fileshare:pick-files'),
    pickFolder: () => ipcRenderer.invoke('fileshare:pick-folder'),
    sendFiles: (peer, filePaths) => ipcRenderer.invoke('fileshare:send-files', peer, filePaths),
    respondToRequest: (transferId, accepted, customDir) => ipcRenderer.invoke('fileshare:respond-request', transferId, accepted, customDir),
    cancelTransfer: (transferId) => ipcRenderer.invoke('fileshare:cancel-transfer', transferId),
    openFolder: (folderPath) => ipcRenderer.invoke('fileshare:open-folder', folderPath),
    openFile: (filePath) => ipcRenderer.invoke('fileshare:open-file', filePath),
    getNetworkStatus: () => ipcRenderer.invoke('fileshare:get-network-status'),
    enableWifi: () => ipcRenderer.invoke('fileshare:enable-wifi'),
    enableHotspot: () => ipcRenderer.invoke('fileshare:enable-hotspot'),

    onPeersUpdated: (cb) => {
      const sub = (_e, peers) => cb(peers);
      ipcRenderer.on('fileshare:peers-updated', sub);
      return () => ipcRenderer.removeListener('fileshare:peers-updated', sub);
    },
    onIncomingRequest: (cb) => {
      const sub = (_e, req) => cb(req);
      ipcRenderer.on('fileshare:incoming-request', sub);
      return () => ipcRenderer.removeListener('fileshare:incoming-request', sub);
    },
    onTransferStarted: (cb) => {
      const sub = (_e, info) => cb(info);
      ipcRenderer.on('fileshare:transfer-started', sub);
      return () => ipcRenderer.removeListener('fileshare:transfer-started', sub);
    },
    onTransferProgress: (cb) => {
      const sub = (_e, progress) => cb(progress);
      ipcRenderer.on('fileshare:transfer-progress', sub);
      return () => ipcRenderer.removeListener('fileshare:transfer-progress', sub);
    },
    onTransferCompleted: (cb) => {
      const sub = (_e, result) => cb(result);
      ipcRenderer.on('fileshare:transfer-completed', sub);
      return () => ipcRenderer.removeListener('fileshare:transfer-completed', sub);
    },
    onTransferDeclined: (cb) => {
      const sub = (_e, info) => cb(info);
      ipcRenderer.on('fileshare:transfer-declined', sub);
      return () => ipcRenderer.removeListener('fileshare:transfer-declined', sub);
    },
    onTransferCancelled: (cb) => {
      const sub = (_e, info) => cb(info);
      ipcRenderer.on('fileshare:transfer-cancelled', sub);
      return () => ipcRenderer.removeListener('fileshare:transfer-cancelled', sub);
    },
    onTransferError: (cb) => {
      const sub = (_e, info) => cb(info);
      ipcRenderer.on('fileshare:transfer-error', sub);
      return () => ipcRenderer.removeListener('fileshare:transfer-error', sub);
    },
    onSenderWaitingAcceptance: (cb) => {
      const sub = (_e, info) => cb(info);
      ipcRenderer.on('fileshare:sender-waiting-acceptance', sub);
      return () => ipcRenderer.removeListener('fileshare:sender-waiting-acceptance', sub);
    }
  }
});
