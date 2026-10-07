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
