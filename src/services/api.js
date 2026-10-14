// Unified API Adapter: Communicates with Native Desktop IPC (WebView2 / Electron)
// when available, with safe local-storage and fetch fallback for browser development.

const hasNativeHost = () => Boolean(typeof window !== 'undefined' && window.electronAPI);
const isElectron = hasNativeHost();

export const TunnelAPI = {
  async start(options) {
    if (hasNativeHost()) return await window.electronAPI.startTunnel(options);
    console.log('[Browser Mock] startTunnel', options);
    return { status: 'CONNECTED', publicUrl: `https://${options.subdomain || 'app-share'}.shareport.link`, localPort: options.port };
  },

  async stop() {
    if (hasNativeHost()) return await window.electronAPI.stopTunnel();
    console.log('[Browser Mock] stopTunnel');
    return { status: 'STOPPED', publicUrl: '' };
  },

  async getStatus() {
    if (hasNativeHost()) return await window.electronAPI.getTunnelStatus();
    return { status: 'STOPPED', publicUrl: '', localPort: 3000 };
  },

  async getConsoleLogs() {
    if (hasNativeHost()) return await window.electronAPI.getConsoleLogs();
    return [];
  },

  async clearConsoleLogs() {
    if (hasNativeHost()) return await window.electronAPI.clearConsoleLogs();
    return true;
  },

  onConsoleLog(callback) {
    if (hasNativeHost()) return window.electronAPI.onConsoleLog(callback);
    return () => {};
  },

  onStatusChange(callback) {
    if (hasNativeHost()) return window.electronAPI.onTunnelStatusChange(callback);
    return () => {};
  }
};

export const InspectorAPI = {
  async getLogs() {
    if (hasNativeHost()) return await window.electronAPI.getInspectorLogs();
    return [];
  },

  async clearLogs() {
    if (hasNativeHost()) return await window.electronAPI.clearInspectorLogs();
    return true;
  },

  onNewLog(callback) {
    if (hasNativeHost()) return window.electronAPI.onInspectorLog(callback);
    return () => {};
  }
};

export const ApiTestingService = {
  async sendRequest(reqConfig) {
    if (hasNativeHost()) {
      return await window.electronAPI.sendApiRequest(reqConfig);
    }

    // Browser Direct Fetch fallback with baseUrl resolution
    const startTime = Date.now();
    try {
      let targetUrl = (reqConfig.url || '').trim();
      const base = (reqConfig.baseUrl || 'http://localhost:3000').trim().replace(/\/+$/, '');
      if (targetUrl.includes('{{baseUrl}}')) {
        targetUrl = targetUrl.replace(/\{\{baseUrl\}\}/g, base);
      } else if (targetUrl.startsWith('/')) {
        targetUrl = `${base}${targetUrl}`;
      } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = targetUrl ? `${base}/${targetUrl}` : base;
      }

      const urlObj = new URL(targetUrl);
      (reqConfig.params || []).forEach(p => {
        if (p.enabled && p.key) urlObj.searchParams.append(p.key, p.value || '');
      });

      const headers = {};
      (reqConfig.headers || []).forEach(h => {
        if (h.enabled && h.key) headers[h.key] = h.value || '';
      });

      if (reqConfig.auth?.type === 'Bearer Token' && reqConfig.auth?.token) {
        headers['Authorization'] = `Bearer ${reqConfig.auth.token}`;
      }

      let reqBody = undefined;
      const m = (reqConfig.method || 'GET').toUpperCase();
      if (!['GET', 'HEAD'].includes(m)) {
        if (reqConfig.bodyType === 'raw' || reqConfig.bodyType === 'json') {
          reqBody = reqConfig.bodyContent;
          if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        }
      }

      const res = await fetch(urlObj.toString(), {
        method: m,
        headers,
        body: reqBody
      });

      const text = await res.text();
      return {
        success: true,
        status: res.status,
        statusText: res.statusText || 'OK',
        headers: Object.fromEntries(res.headers.entries()),
        cookies: [],
        body: text,
        timeMs: Date.now() - startTime,
        sizeBytes: text.length
      };
    } catch (err) {
      return {
        success: false,
        status: 0,
        statusText: 'CORS or Network Error (Running in Browser - Use Desktop app for 100% zero-CORS)',
        error: err.message,
        timeMs: Date.now() - startTime,
        headers: {},
        cookies: [],
        body: ''
      };
    }
  }
};

export const StorageAPI = {
  async getConfig() {
    if (hasNativeHost()) return await window.electronAPI.getAllConfig();
    const stored = localStorage.getItem('shareport_config');
    return stored ? JSON.parse(stored) : { default_port: 3000, default_engine: 'high_speed' };
  },

  async setConfig(key, value) {
    if (hasNativeHost()) return await window.electronAPI.setConfig(key, value);
    const stored = await this.getConfig();
    stored[key] = value;
    localStorage.setItem('shareport_config', JSON.stringify(stored));
    return true;
  },

  async getCollections() {
    if (hasNativeHost()) return await window.electronAPI.getCollections();
    const stored = localStorage.getItem('shareport_collections');
    return stored ? JSON.parse(stored) : [];
  },

  async saveCollections(colls) {
    if (hasNativeHost()) return await window.electronAPI.saveCollections(colls);
    localStorage.setItem('shareport_collections', JSON.stringify(colls));
    return true;
  }
};

export const SystemAPI = {
  openExternal(url) {
    if (hasNativeHost()) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  },

  async copyText(text) {
    if (hasNativeHost()) {
      return await window.electronAPI.copyClipboard(text);
    }
    return await navigator.clipboard.writeText(text);
  },

  async checkPort(port) {
    if (hasNativeHost()) return await window.electronAPI.checkPort(port);
    return true;
  },

  async scanPorts(portsList) {
    if (hasNativeHost() && window.electronAPI?.scanPorts) {
      return await window.electronAPI.scanPorts(portsList);
    }
    return [];
  }
};

export const WindowAPI = {
  minimize() {
    if (hasNativeHost() && window.electronAPI?.minimizeWindow) window.electronAPI.minimizeWindow();
  },
  async maximize() {
    if (hasNativeHost() && window.electronAPI?.maximizeWindow) return await window.electronAPI.maximizeWindow();
    return false;
  },
  close() {
    if (hasNativeHost() && window.electronAPI?.closeWindow) window.electronAPI.closeWindow();
  },
  async isMaximized() {
    if (hasNativeHost() && window.electronAPI?.isWindowMaximized) return await window.electronAPI.isWindowMaximized();
    return false;
  },
  onMaximizeChange(callback) {
    if (hasNativeHost() && window.electronAPI?.onWindowMaximizeChange) return window.electronAPI.onWindowMaximizeChange(callback);
    return () => {};
  }
};

// ========================================================
// Offline Peer-to-Peer File Share API (Zero Internet)
// ========================================================

// Function to auto-detect actual local Wi-Fi / LAN IP from WebRTC network stack
async function detectLocalNetworkIp() {
  return new Promise((resolve) => {
    try {
      const RTCPC = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
      if (!RTCPC) return resolve('192.168.11.16');
      const pc = new RTCPC({ iceServers: [] });
      pc.createDataChannel('detect-ip');
      pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => {});
      const timer = setTimeout(() => {
        try { pc.close(); } catch(e) {}
        resolve('192.168.11.16');
      }, 800);

      pc.onicecandidate = (ice) => {
        if (!ice || !ice.candidate || !ice.candidate.candidate) return;
        const match = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(ice.candidate.candidate);
        if (match && match[1] && !match[1].startsWith('127.')) {
          clearTimeout(timer);
          try { pc.close(); } catch(e) {}
          resolve(match[1]);
        }
      };
    } catch (e) {
      resolve('192.168.11.16');
    }
  });
}

export const FileShareAPI = {
  hasNativeHost() {
    return Boolean(typeof window !== 'undefined' && window.electronAPI && window.electronAPI.fileShare);
  },

  async getLocalInfo() {
    if (this.hasNativeHost()) {
      try {
        const info = await window.electronAPI.fileShare.getLocalInfo();
        if (info && info.ip && !info.ip.startsWith('127.')) return info;
      } catch (e) {}
    }

    const detectedIp = await detectLocalNetworkIp();
    const storedName = localStorage.getItem('fileshare_devicename') || 'Satya-PC';

    return {
      deviceId: 'sp_' + (localStorage.getItem('fileshare_deviceid') || 'satya_pc'),
      deviceName: storedName,
      deviceType: 'windows',
      ip: detectedIp || '192.168.11.16',
      httpPort: 53318,
      udpPort: 53317,
      downloadDir: 'Downloads/SharePort_Received',
      hostname: storedName,
      platform: 'win32'
    };
  },

  async setDeviceName(name) {
    if (this.hasNativeHost() && window.electronAPI.fileShare.setDeviceName) {
      return await window.electronAPI.fileShare.setDeviceName(name);
    }
    localStorage.setItem('fileshare_devicename', name);
    return name;
  },

  async startDiscovery() {
    if (this.hasNativeHost() && window.electronAPI.fileShare.startDiscovery) {
      return await window.electronAPI.fileShare.startDiscovery();
    }
    return true;
  },

  async stopDiscovery() {
    if (this.hasNativeHost() && window.electronAPI.fileShare.stopDiscovery) {
      return await window.electronAPI.fileShare.stopDiscovery();
    }
    return true;
  },

  async scanRadar() {
    if (this.hasNativeHost() && typeof window.electronAPI?.fileShare?.scanRadar === 'function') {
      return await window.electronAPI.fileShare.scanRadar();
    }
    return true;
  },

  async directConnect(ip, port) {
    const cleanIp = (ip || '').trim();
    const cleanPort = parseInt(port) || 53318;
    if (!cleanIp) throw new Error('Please enter a valid IP address');

    if (this.hasNativeHost() && typeof window.electronAPI?.fileShare?.directConnect === 'function') {
      try {
        const peer = await window.electronAPI.fileShare.directConnect(cleanIp, cleanPort);
        if (peer) return peer;
      } catch (e) {
        console.warn('Native directConnect failed, falling back to local peer creation:', e);
      }
    }

    // Direct peer connection object
    return {
      id: 'direct_' + cleanIp.replace(/\./g, '_') + '_' + cleanPort,
      name: `Device (${cleanIp})`,
      os: 'windows',
      ip: cleanIp,
      port: cleanPort,
      status: 'online',
      isDirect: true,
      lastSeen: Date.now()
    };
  },

  async pickFiles() {
    if (this.hasNativeHost()) {
      return await window.electronAPI.fileShare.pickFiles();
    }
    // Browser fallback using input element
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = (e) => {
        const files = Array.from(e.target.files || []).map(f => ({
          path: f.name,
          name: f.name,
          size: f.size,
          ext: f.name.split('.').pop() || 'bin',
          rawFile: f
        }));
        resolve(files);
      };
      input.click();
    });
  },

  async pickFolder() {
    if (this.hasNativeHost()) {
      return await window.electronAPI.fileShare.pickFolder();
    }
    return 'Downloads/SharePort_Received';
  },

  async sendFiles(peer, filePathsOrObjects) {
    if (this.hasNativeHost()) {
      // In Electron, filePaths is array of absolute file string paths
      const paths = filePathsOrObjects.map(f => (typeof f === 'string' ? f : f.path));
      return await window.electronAPI.fileShare.sendFiles(peer, paths);
    }
    // Browser Mock Simulation
    return { success: true, transferId: 'mock_tx_' + Date.now() };
  },

  async respondToRequest(transferId, accepted, customDir) {
    if (this.hasNativeHost()) {
      return await window.electronAPI.fileShare.respondToRequest(transferId, accepted, customDir);
    }
    return { success: true, accepted };
  },

  async cancelTransfer(transferId) {
    if (this.hasNativeHost()) {
      return await window.electronAPI.fileShare.cancelTransfer(transferId);
    }
    return true;
  },

  async openFolder(folderPath) {
    if (this.hasNativeHost()) {
      return await window.electronAPI.fileShare.openFolder(folderPath);
    }
    alert(`Received files are located in: ${folderPath || 'Downloads/SharePort_Received'}`);
    return true;
  },

  async openFile(filePath) {
    if (this.hasNativeHost()) {
      return await window.electronAPI.fileShare.openFile(filePath);
    }
    alert(`Opening file: ${filePath}`);
    return true;
  },

  async getNetworkStatus() {
    if (this.hasNativeHost() && typeof window.electronAPI?.fileShare?.getNetworkStatus === 'function') {
      try {
        return await window.electronAPI.fileShare.getNetworkStatus();
      } catch (e) {}
    }
    const ip = await detectLocalNetworkIp();
    return {
      connected: Boolean(ip && !ip.startsWith('127.')),
      wifiAvailable: true,
      ssid: 'Wi-Fi / LAN',
      ip: ip || '192.168.11.16',
      signal: '100%',
      adapterName: 'Wi-Fi Network Card'
    };
  },

  async enableWifi() {
    if (this.hasNativeHost() && typeof window.electronAPI?.fileShare?.enableWifi === 'function') {
      return await window.electronAPI.fileShare.enableWifi();
    }
    console.log('[Browser] enableWifi triggered');
    return true;
  },

  async enableHotspot() {
    if (this.hasNativeHost() && typeof window.electronAPI?.fileShare?.enableHotspot === 'function') {
      return await window.electronAPI.fileShare.enableHotspot();
    }
    return true;
  },

  async setMode(mode) {
    if (this.hasNativeHost() && typeof window.electronAPI?.fileShare?.setMode === 'function') {
      return await window.electronAPI.fileShare.setMode(mode);
    }
    return true;
  },

  async connectPeer(peer) {
    if (this.hasNativeHost() && typeof window.electronAPI?.fileShare?.connectPeer === 'function') {
      return await window.electronAPI.fileShare.connectPeer(peer);
    }
    return true;
  },

  async disconnectPeer(peer) {
    if (this.hasNativeHost() && typeof window.electronAPI?.fileShare?.disconnectPeer === 'function') {
      return await window.electronAPI.fileShare.disconnectPeer(peer);
    }
    return true;
  },

  onPeerConnected(callback) {
    if (this.hasNativeHost() && window.electronAPI.fileShare.onPeerConnected) {
      return window.electronAPI.fileShare.onPeerConnected(callback);
    }
    return () => {};
  },

  onPeerDisconnected(callback) {
    if (this.hasNativeHost() && window.electronAPI.fileShare.onPeerDisconnected) {
      return window.electronAPI.fileShare.onPeerDisconnected(callback);
    }
    return () => {};
  },

  // Events
  onPeersUpdated(callback) {
    if (this.hasNativeHost() && window.electronAPI.fileShare.onPeersUpdated) {
      return window.electronAPI.fileShare.onPeersUpdated(callback);
    }
    // Only return real detected peers - zero dummy or fake users
    callback([]);
    return () => {};
  },

  onIncomingRequest(callback) {
    if (this.hasNativeHost()) {
      return window.electronAPI.fileShare.onIncomingRequest(callback);
    }
    return () => {};
  },

  onTransferStarted(callback) {
    if (this.hasNativeHost()) {
      return window.electronAPI.fileShare.onTransferStarted(callback);
    }
    return () => {};
  },

  onTransferProgress(callback) {
    if (this.hasNativeHost()) {
      return window.electronAPI.fileShare.onTransferProgress(callback);
    }
    return () => {};
  },

  onTransferCompleted(callback) {
    if (this.hasNativeHost()) {
      return window.electronAPI.fileShare.onTransferCompleted(callback);
    }
    return () => {};
  },

  onTransferDeclined(callback) {
    if (this.hasNativeHost()) {
      return window.electronAPI.fileShare.onTransferDeclined(callback);
    }
    return () => {};
  },

  onTransferCancelled(callback) {
    if (this.hasNativeHost()) {
      return window.electronAPI.fileShare.onTransferCancelled(callback);
    }
    return () => {};
  },

  onTransferError(callback) {
    if (this.hasNativeHost()) {
      return window.electronAPI.fileShare.onTransferError(callback);
    }
    return () => {};
  },

  onSenderWaitingAcceptance(callback) {
    if (this.hasNativeHost()) {
      return window.electronAPI.fileShare.onSenderWaitingAcceptance(callback);
    }
    return () => {};
  }
};
