const dgram = require('dgram');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, dialog, shell } = require('electron');
const { execSync } = require('child_process');

class FileShareService {
  constructor() {
    this.mainWindow = null;
    this.udpSocket = null;
    this.httpServer = null;
    this.httpPort = 53318;
    this.udpPort = 53317;
    this.isDiscovering = false;
    this.beaconTimer = null;
    this.cleanupTimer = null;

    // Discovered peers: Map of peerId -> peerObject
    this.discoveredPeers = new Map();

    // Pending incoming transfer requests: transferId -> { req, res, timer, data }
    this.pendingIncomingRequests = new Map();

    // Active transfers (both sender and receiver): transferId -> { ... }
    this.activeTransfers = new Map();

    // Device identification
    this.deviceId = 'sp_' + Math.random().toString(36).substring(2, 10);
    this.deviceName = os.hostname() || 'SharePort-Device';
    this.deviceType = os.platform() === 'win32' ? 'windows' : (os.platform() === 'darwin' ? 'macos' : 'linux');

    // Default download directory
    try {
      this.downloadDir = path.join(app.getPath('downloads'), 'SharePort_Received');
      if (!fs.existsSync(this.downloadDir)) {
        fs.mkdirSync(this.downloadDir, { recursive: true });
      }
    } catch (e) {
      this.downloadDir = path.join(os.homedir(), 'Downloads', 'SharePort_Received');
      try {
        if (!fs.existsSync(this.downloadDir)) fs.mkdirSync(this.downloadDir, { recursive: true });
      } catch (err) {}
    }
  }

  init(window, config = {}) {
    this.mainWindow = window;
    if (config.device_name) {
      this.deviceName = config.device_name;
    }
    if (config.device_id) {
      this.deviceId = config.device_id;
    }
    if (config.fileshare_download_dir && fs.existsSync(config.fileshare_download_dir)) {
      this.downloadDir = config.fileshare_download_dir;
    }

    // Start local HTTP transfer server
    this.startHttpServer();

    // Start UDP peer discovery
    this.startDiscovery();
  }

  setDeviceName(name) {
    if (!name || !name.trim()) return;
    this.deviceName = name.trim();
    // Broadcast updated info immediately
    this.broadcastBeacon();
    return this.deviceName;
  }

  getPrimaryIp() {
    const interfaces = os.networkInterfaces();
    let preferredIp = null;
    let fallbackIp = null;

    for (const [name, addrs] of Object.entries(interfaces)) {
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          const isVirtual = /vEthernet|virtual|vmware|loopback/i.test(name);
          const isWifiOrEth = /wi-?fi|wlan|ethernet|local area connection/i.test(name);

          if (isWifiOrEth && !isVirtual) {
            return addr.address;
          }
          if (!isVirtual && !preferredIp) {
            preferredIp = addr.address;
          }
          if (!fallbackIp) {
            fallbackIp = addr.address;
          }
        }
      }
    }
    return preferredIp || fallbackIp || '127.0.0.1';
  }

  getAllBroadcastAddresses() {
    const addresses = new Set();
    addresses.add('255.255.255.255');
    const interfaces = os.networkInterfaces();

    for (const [name, addrs] of Object.entries(interfaces)) {
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal && addr.netmask) {
          try {
            const ipParts = addr.address.split('.').map(Number);
            const maskParts = addr.netmask.split('.').map(Number);
            const bcastParts = ipParts.map((part, i) => (part | (~maskParts[i] & 255)));
            const bcast = bcastParts.join('.');
            addresses.add(bcast);
          } catch (e) {}
        }
      }
    }
    return Array.from(addresses);
  }

  getLocalInfo() {
    return {
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      deviceType: this.deviceType,
      ip: this.getPrimaryIp(),
      httpPort: this.httpPort,
      udpPort: this.udpPort,
      downloadDir: this.downloadDir,
      hostname: os.hostname(),
      platform: os.platform()
    };
  }

  // ==========================================
  // UDP PEER DISCOVERY (Offline LAN / Wi-Fi)
  // ==========================================
  startDiscovery() {
    if (this.isDiscovering && this.udpSocket) return;

    try {
      this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.udpSocket.on('error', (err) => {
        console.warn('[FileShare UDP] Socket error:', err.message);
      });

      this.udpSocket.on('message', (msg, rinfo) => {
        this.handleUdpMessage(msg, rinfo);
      });

      this.udpSocket.bind(this.udpPort, () => {
        try {
          this.udpSocket.setBroadcast(true);
          this.isDiscovering = true;
          console.log(`[FileShare UDP] Bound on port ${this.udpPort}, broadcast enabled.`);

          // Send initial announcement
          this.broadcastBeacon();

          // Recurring beacon every 2.5s
          if (this.beaconTimer) clearInterval(this.beaconTimer);
          this.beaconTimer = setInterval(() => {
            if (this.isDiscovering) {
              this.broadcastBeacon();
            }
          }, 2500);

          // Cleanup stale peers every 3s
          if (this.cleanupTimer) clearInterval(this.cleanupTimer);
          this.cleanupTimer = setInterval(() => {
            this.purgeStalePeers();
          }, 3000);
        } catch (e) {
          console.warn('[FileShare UDP] SetBroadcast error:', e.message);
        }
      });
    } catch (err) {
      console.error('[FileShare UDP] Failed to create UDP socket:', err);
    }
  }

  stopDiscovery() {
    this.isDiscovering = false;
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Broadcast goodbye so peers can drop us instantly
    this.broadcastGoodbye();

    if (this.udpSocket) {
      try {
        this.udpSocket.close();
      } catch (e) {}
      this.udpSocket = null;
    }
    this.discoveredPeers.clear();
    this.emitPeersUpdated();
  }

  broadcastBeacon() {
    if (!this.udpSocket || !this.isDiscovering) return;

    const payload = JSON.stringify({
      protocol: 'shareport-v1',
      action: 'BEACON',
      id: this.deviceId,
      name: this.deviceName,
      os: this.deviceType,
      ip: this.getPrimaryIp(),
      port: this.httpPort,
      timestamp: Date.now()
    });

    const buffer = Buffer.from(payload);
    const broadcastTargets = this.getAllBroadcastAddresses();

    broadcastTargets.forEach(targetIp => {
      try {
        this.udpSocket.send(buffer, 0, buffer.length, this.udpPort, targetIp, (err) => {
          if (err && err.code !== 'ENETUNREACH' && err.code !== 'EHOSTUNREACH') {
            // Ignore normal unreachable interface noise
          }
        });
      } catch (e) {}
    });
  }

  broadcastGoodbye() {
    if (!this.udpSocket) return;
    try {
      const payload = JSON.stringify({
        protocol: 'shareport-v1',
        action: 'GOODBYE',
        id: this.deviceId,
        timestamp: Date.now()
      });
      const buffer = Buffer.from(payload);
      const broadcastTargets = this.getAllBroadcastAddresses();
      broadcastTargets.forEach(targetIp => {
        try {
          this.udpSocket.send(buffer, 0, buffer.length, this.udpPort, targetIp);
        } catch (e) {}
      });
    } catch (e) {}
  }

  scanRadar() {
    if (!this.udpSocket) {
      this.startDiscovery();
    }
    // Broadcast ping requesting immediate responses
    const payload = JSON.stringify({
      protocol: 'shareport-v1',
      action: 'PING',
      id: this.deviceId,
      name: this.deviceName,
      ip: this.getPrimaryIp(),
      port: this.httpPort,
      timestamp: Date.now()
    });
    const buffer = Buffer.from(payload);
    const targets = this.getAllBroadcastAddresses();
    targets.forEach(ip => {
      try {
        this.udpSocket.send(buffer, 0, buffer.length, this.udpPort, ip);
      } catch (e) {}
    });
    // Also broadcast our own beacon
    this.broadcastBeacon();
  }

  handleUdpMessage(msg, rinfo) {
    try {
      const data = JSON.parse(msg.toString('utf-8'));
      if (!data || data.protocol !== 'shareport-v1') return;

      // Ignore our own broadcast
      if (data.id === this.deviceId) return;

      if (data.action === 'GOODBYE') {
        if (this.discoveredPeers.has(data.id)) {
          this.discoveredPeers.delete(data.id);
          this.emitPeersUpdated();
        }
        return;
      }

      if (rinfo && rinfo.address && (data.action === 'PING' || data.action === 'BEACON')) {
        try {
          const replyPayload = Buffer.from(JSON.stringify({
            protocol: 'shareport-v1',
            action: 'BEACON',
            id: this.deviceId,
            name: this.deviceName,
            os: 'windows',
            ip: this.getPrimaryIp(),
            port: this.httpPort,
            mode: this.currentMode || 'standby',
            status: this.currentMode === 'receive' ? 'ready_to_receive' : 'online',
            timestamp: Date.now()
          }));
          this.udpSocket.send(replyPayload, 0, replyPayload.length, rinfo.port || this.udpPort, rinfo.address);
        } catch(e) {}
      }

      if (data.action === 'BEACON' || data.action === 'PING') {
        const peerIp = rinfo && rinfo.address ? rinfo.address : (data.ip || '127.0.0.1');
        const peerPort = data.port || 53318;

        const peer = {
          id: data.id,
          name: data.name || 'Nearby Device',
          os: data.os || 'unknown',
          ip: peerIp,
          port: peerPort,
          lastSeen: Date.now(),
          status: 'online'
        };

        const existing = this.discoveredPeers.get(data.id);
        const hasChanged = !existing || existing.name !== peer.name || existing.ip !== peer.ip || existing.port !== peer.port;

        this.discoveredPeers.set(data.id, peer);

        if (hasChanged) {
          this.emitPeersUpdated();
        }
      }
    } catch (e) {
      // Ignore invalid packet
    }
  }

  purgeStalePeers() {
    const now = Date.now();
    let changed = false;

    for (const [id, peer] of this.discoveredPeers.entries()) {
      if (now - peer.lastSeen > 8000) {
        this.discoveredPeers.delete(id);
        changed = true;
      }
    }

    if (changed) {
      this.emitPeersUpdated();
    }
  }

  emitPeersUpdated() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const list = Array.from(this.discoveredPeers.values());
      this.mainWindow.webContents.send('fileshare:peers-updated', list);
    }
  }

  // Direct manual connect by IP (bypasses UDP broadcast isolation)
  async directConnect(ip, port = 53318) {
    const targetPort = parseInt(port) || 53318;
    const cleanIp = (ip || '').trim();
    if (!cleanIp) throw new Error('IP address required');

    return new Promise((resolve, reject) => {
      const req = http.get(`http://${cleanIp}:${targetPort}/api/ping`, { timeout: 3000 }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data && data.success && data.id) {
              const peer = {
                id: data.id,
                name: data.name || 'Direct Peer',
                os: data.os || 'unknown',
                ip: cleanIp,
                port: targetPort,
                lastSeen: Date.now(),
                status: 'online',
                isDirect: true
              };
              this.discoveredPeers.set(data.id, peer);
              this.emitPeersUpdated();
              resolve(peer);
            } else {
              reject(new Error('Invalid response from peer'));
            }
          } catch (e) {
            reject(new Error('Failed to parse peer response'));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Could not connect to ${cleanIp}:${targetPort} (${err.message})`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Connection to ${cleanIp}:${targetPort} timed out`));
      });
    });
  }

  // ==========================================
  // HTTP TRANSFER SERVER (High-Speed Local IO)
  // ==========================================
  startHttpServer(port = 53318) {
    if (this.httpServer) return;

    this.httpServer = http.createServer((req, res) => {
      // CORS headers for local LAN communication
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-transfer-id, x-file-index, x-file-name, x-file-size');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;

      // 1. Health / Discovery Ping
      if (pathname === '/api/ping' && (req.method === 'GET' || req.method === 'POST')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          id: this.deviceId,
          name: this.deviceName,
          os: this.deviceType,
          port: this.httpPort
        }));
        return;
      }

      // 2. Incoming Transfer Connection Request (Manifest)
      if (pathname === '/api/transfer/request' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const manifest = JSON.parse(body);
            this.handleIncomingTransferRequest(manifest, req, res);
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ accepted: false, error: 'Invalid manifest format' }));
          }
        });
        return;
      }

      // 3. File Chunk Streaming Upload
      if (pathname === '/api/transfer/upload' && req.method === 'POST') {
        this.handleFileUploadStream(req, res);
        return;
      }

      // 4. Cancel Transfer
      if (pathname === '/api/transfer/cancel' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const { transferId, reason } = JSON.parse(body || '{}');
            this.handleCancelFromPeer(transferId, reason);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.writeHead(400);
            res.end();
          }
        });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    this.httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[FileShare HTTP] Port ${port} in use, trying ${port + 1}...`);
        this.httpServer = null;
        this.httpPort = port + 1;
        this.startHttpServer(port + 1);
      } else {
        console.error('[FileShare HTTP] Server error:', err);
      }
    });

    this.httpServer.listen(port, '0.0.0.0', () => {
      this.httpPort = port;
      console.log(`[FileShare HTTP] Offline transfer server listening on 0.0.0.0:${this.httpPort}`);
    });
  }

  // Handle incoming connection request from another user
  handleIncomingTransferRequest(manifest, req, res) {
    const { transferId, sender, files, totalSize, totalFiles } = manifest;

    if (!transferId || !files || !files.length) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: false, error: 'Invalid request data' }));
      return;
    }

    // Prepare pending request object with a 60-second timeout
    const timeoutTimer = setTimeout(() => {
      if (this.pendingIncomingRequests.has(transferId)) {
        this.pendingIncomingRequests.delete(transferId);
        try {
          res.writeHead(408, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ accepted: false, reason: 'Request timed out waiting for response.' }));
        } catch (e) {}
        this.sendToRenderer('fileshare:request-timeout', { transferId });
      }
    }, 60000);

    this.pendingIncomingRequests.set(transferId, {
      transferId,
      sender,
      files,
      totalSize,
      totalFiles,
      res,
      timeoutTimer,
      createdAt: Date.now()
    });

    // Notify Receiver UI to show the Accept / Decline prompt!
    this.sendToRenderer('fileshare:incoming-request', {
      transferId,
      sender,
      files,
      totalSize,
      totalFiles,
      saveDir: this.downloadDir
    });
  }

  // Receiver user clicks Accept or Decline in the UI
  respondToIncomingRequest(transferId, accepted, customSaveDir = null) {
    const pending = this.pendingIncomingRequests.get(transferId);
    if (!pending) {
      return { success: false, error: 'Transfer request expired or not found' };
    }

    clearTimeout(pending.timeoutTimer);
    this.pendingIncomingRequests.delete(transferId);

    const { res, sender, files, totalSize, totalFiles } = pending;
    const finalSaveDir = customSaveDir && fs.existsSync(customSaveDir) ? customSaveDir : this.downloadDir;

    if (!accepted) {
      // Send decline response back to Sender HTTP request
      try {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          accepted: false,
          transferId,
          reason: 'Receiver declined the connection request.'
        }));
      } catch (e) {}

      this.sendToRenderer('fileshare:incoming-declined', { transferId });
      return { success: true, accepted: false };
    }

    // User ACCEPTED! Initialize active receiver transfer
    const activeTransfer = {
      transferId,
      role: 'receiver',
      sender,
      files,
      totalSize,
      totalFiles,
      saveDir: finalSaveDir,
      currentFileIndex: 0,
      totalBytesReceived: 0,
      startTime: Date.now(),
      lastSpeedCheckTime: Date.now(),
      lastSpeedCheckBytes: 0,
      currentSpeedMbps: 0,
      status: 'transferring',
      completedFiles: [],
      currentWriteStream: null,
      currentTempPath: null
    };

    this.activeTransfers.set(transferId, activeTransfer);

    // Send accept response back to Sender so they can start streaming files
    try {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        accepted: true,
        transferId,
        saveDir: finalSaveDir
      }));
    } catch (e) {}

    this.sendToRenderer('fileshare:transfer-started', {
      transferId,
      role: 'receiver',
      sender,
      files,
      totalSize,
      totalFiles,
      saveDir: finalSaveDir
    });

    return { success: true, accepted: true, saveDir: finalSaveDir };
  }

  // Receive streaming file upload chunks directly to disk
  handleFileUploadStream(req, res) {
    const transferId = req.headers['x-transfer-id'];
    const fileIndex = parseInt(req.headers['x-file-index'], 10);
    const rawFileName = decodeURIComponent(req.headers['x-file-name'] || 'received_file');
    const fileSize = parseInt(req.headers['x-file-size'], 10) || 0;

    const transfer = this.activeTransfers.get(transferId);
    if (!transfer || transfer.role !== 'receiver') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Transfer session inactive or not found' }));
      return;
    }

    // Sanitize filename and prevent collision
    const safeBaseName = path.basename(rawFileName).replace(/[/\\?%*:|"<>]/g, '_');
    let targetPath = path.join(transfer.saveDir, safeBaseName);

    // If file already exists, generate unique name
    if (fs.existsSync(targetPath)) {
      const ext = path.extname(safeBaseName);
      const nameWithoutExt = path.basename(safeBaseName, ext);
      let counter = 1;
      while (fs.existsSync(targetPath)) {
        targetPath = path.join(transfer.saveDir, `${nameWithoutExt} (${counter})${ext}`);
        counter++;
      }
    }

    const tempPath = targetPath + '.sp_part';
    transfer.currentTempPath = tempPath;
    const writeStream = fs.createWriteStream(tempPath);
    transfer.currentWriteStream = writeStream;

    let fileBytesReceived = 0;

    req.on('data', (chunk) => {
      fileBytesReceived += chunk.length;
      transfer.totalBytesReceived += chunk.length;

      // Calculate speed and ETA smoothly
      const now = Date.now();
      const elapsed = now - transfer.lastSpeedCheckTime;
      if (elapsed >= 250) {
        const bytesDelta = transfer.totalBytesReceived - transfer.lastSpeedCheckBytes;
        const bytesPerSec = (bytesDelta / elapsed) * 1000;
        transfer.currentSpeedMbps = (bytesPerSec / (1024 * 1024)); // MB/s
        transfer.lastSpeedCheckTime = now;
        transfer.lastSpeedCheckBytes = transfer.totalBytesReceived;

        const remainingBytes = Math.max(0, transfer.totalSize - transfer.totalBytesReceived);
        const etaSeconds = bytesPerSec > 0 ? Math.ceil(remainingBytes / bytesPerSec) : 0;
        const percent = transfer.totalSize > 0 ? Math.min(100, Math.round((transfer.totalBytesReceived / transfer.totalSize) * 100)) : 0;

        this.sendToRenderer('fileshare:transfer-progress', {
          transferId,
          role: 'receiver',
          fileIndex,
          fileName: safeBaseName,
          fileBytesReceived,
          fileSize,
          totalBytesReceived: transfer.totalBytesReceived,
          totalSize: transfer.totalSize,
          percent,
          speedMbps: transfer.currentSpeedMbps.toFixed(1),
          etaSeconds
        });
      }
    });

    req.pipe(writeStream);

    writeStream.on('error', (err) => {
      console.error('[FileShare Receiver] WriteStream error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });

    writeStream.on('finish', () => {
      try {
        // Rename .sp_part to targetPath
        if (fs.existsSync(tempPath)) {
          fs.renameSync(tempPath, targetPath);
        }

        transfer.completedFiles.push({
          name: path.basename(targetPath),
          path: targetPath,
          size: fileBytesReceived
        });

        transfer.currentFileIndex = fileIndex + 1;
        transfer.currentWriteStream = null;
        transfer.currentTempPath = null;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, savedPath: targetPath }));

        // Check if all files completed
        if (transfer.completedFiles.length >= transfer.totalFiles) {
          transfer.status = 'completed';
          this.activeTransfers.delete(transferId);

          this.sendToRenderer('fileshare:transfer-completed', {
            transferId,
            role: 'receiver',
            sender: transfer.sender,
            saveDir: transfer.saveDir,
            files: transfer.completedFiles,
            totalSize: transfer.totalBytesReceived,
            durationMs: Date.now() - transfer.startTime
          });
        }
      } catch (err) {
        console.error('[FileShare Receiver] Finish error:', err);
      }
    });
  }

  // ==========================================
  // SENDER ENGINE (Outgoing Transfers)
  // ==========================================
  async sendFiles(peer, filePaths) {
    if (!peer || !peer.ip || !peer.port) {
      throw new Error('Invalid peer information');
    }
    if (!filePaths || !filePaths.length) {
      throw new Error('No files selected to share');
    }

    // Inspect files and collect stats
    const fileManifest = [];
    let totalSize = 0;

    for (const filePath of filePaths) {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          fileManifest.push({
            name: path.basename(filePath),
            path: filePath,
            size: stats.size,
            type: path.extname(filePath).replace('.', '') || 'bin'
          });
          totalSize += stats.size;
        }
      }
    }

    if (!fileManifest.length) {
      throw new Error('No valid files could be read');
    }

    const transferId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    // Create sender transfer state
    const senderTransfer = {
      transferId,
      role: 'sender',
      peer,
      files: fileManifest,
      totalSize,
      totalFiles: fileManifest.length,
      currentFileIndex: 0,
      totalBytesSent: 0,
      startTime: Date.now(),
      lastSpeedCheckTime: Date.now(),
      lastSpeedCheckBytes: 0,
      currentSpeedMbps: 0,
      status: 'waiting_acceptance',
      activeReq: null
    };

    this.activeTransfers.set(transferId, senderTransfer);

    this.sendToRenderer('fileshare:sender-waiting-acceptance', {
      transferId,
      peer,
      files: fileManifest,
      totalSize,
      totalFiles: fileManifest.length
    });

    // 1. Send transfer manifest request to receiver
    try {
      const manifestPayload = JSON.stringify({
        transferId,
        sender: {
          id: this.deviceId,
          name: this.deviceName,
          ip: this.getPrimaryIp(),
          port: this.httpPort,
          os: this.deviceType
        },
        files: fileManifest.map(f => ({ name: f.name, size: f.size, type: f.type })),
        totalSize,
        totalFiles: fileManifest.length
      });

      const acceptResponse = await this.postJson(`http://${peer.ip}:${peer.port}/api/transfer/request`, manifestPayload);

      if (!acceptResponse.accepted) {
        this.activeTransfers.delete(transferId);
        const reason = acceptResponse.reason || 'Receiver declined the connection request.';
        this.sendToRenderer('fileshare:transfer-declined', {
          transferId,
          peer,
          reason
        });
        return { success: false, declined: true, reason };
      }

      // Receiver accepted! Start streaming files one by one
      senderTransfer.status = 'transferring';
      senderTransfer.startTime = Date.now();
      senderTransfer.lastSpeedCheckTime = Date.now();
      senderTransfer.lastSpeedCheckBytes = 0;

      this.sendToRenderer('fileshare:transfer-started', {
        transferId,
        role: 'sender',
        peer,
        files: fileManifest,
        totalSize,
        totalFiles: fileManifest.length
      });

      // Stream each file sequentially
      for (let i = 0; i < fileManifest.length; i++) {
        if (!this.activeTransfers.has(transferId)) {
          // Transfer was cancelled
          return { success: false, cancelled: true };
        }

        const file = fileManifest[i];
        senderTransfer.currentFileIndex = i;

        await this.streamFileUpload(peer, transferId, i, file, senderTransfer);
      }

      // All files transferred successfully!
      senderTransfer.status = 'completed';
      this.activeTransfers.delete(transferId);

      this.sendToRenderer('fileshare:transfer-completed', {
        transferId,
        role: 'sender',
        peer,
        files: fileManifest,
        totalSize,
        durationMs: Date.now() - senderTransfer.startTime
      });

      return { success: true, transferId };
    } catch (err) {
      this.activeTransfers.delete(transferId);
      this.sendToRenderer('fileshare:transfer-error', {
        transferId,
        error: err.message
      });
      throw err;
    }
  }

  // Stream a single file to peer HTTP upload endpoint
  streamFileUpload(peer, transferId, fileIndex, file, senderTransfer) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: peer.ip,
        port: peer.port,
        path: '/api/transfer/upload',
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': file.size,
          'x-transfer-id': transferId,
          'x-file-index': fileIndex.toString(),
          'x-file-name': encodeURIComponent(file.name),
          'x-file-size': file.size.toString()
        }
      };

      const req = http.request(options, (res) => {
        let respBody = '';
        res.on('data', chunk => respBody += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Peer returned status ${res.statusCode}: ${respBody}`));
          }
        });
      });

      senderTransfer.activeReq = req;

      req.on('error', (err) => {
        reject(err);
      });

      // Stream file with highWaterMark for fast, smooth 256KB chunks
      const readStream = fs.createReadStream(file.path, { highWaterMark: 256 * 1024 });

      let fileBytesSent = 0;

      readStream.on('data', (chunk) => {
        fileBytesSent += chunk.length;
        senderTransfer.totalBytesSent += chunk.length;

        // Smooth speed and ETA calculation
        const now = Date.now();
        const elapsed = now - senderTransfer.lastSpeedCheckTime;
        if (elapsed >= 250) {
          const bytesDelta = senderTransfer.totalBytesSent - senderTransfer.lastSpeedCheckBytes;
          const bytesPerSec = (bytesDelta / elapsed) * 1000;
          senderTransfer.currentSpeedMbps = (bytesPerSec / (1024 * 1024)); // MB/s
          senderTransfer.lastSpeedCheckTime = now;
          senderTransfer.lastSpeedCheckBytes = senderTransfer.totalBytesSent;

          const remainingBytes = Math.max(0, senderTransfer.totalSize - senderTransfer.totalBytesSent);
          const etaSeconds = bytesPerSec > 0 ? Math.ceil(remainingBytes / bytesPerSec) : 0;
          const percent = senderTransfer.totalSize > 0 ? Math.min(100, Math.round((senderTransfer.totalBytesSent / senderTransfer.totalSize) * 100)) : 0;

          this.sendToRenderer('fileshare:transfer-progress', {
            transferId,
            role: 'sender',
            fileIndex,
            fileName: file.name,
            fileBytesSent,
            fileSize: file.size,
            totalBytesSent: senderTransfer.totalBytesSent,
            totalSize: senderTransfer.totalSize,
            percent,
            speedMbps: senderTransfer.currentSpeedMbps.toFixed(1),
            etaSeconds
          });
        }
      });

      readStream.on('error', (err) => {
        req.destroy(err);
        reject(err);
      });

      readStream.pipe(req);
    });
  }

  // Cancel an active transfer from either end
  cancelTransfer(transferId, reason = 'Transfer cancelled by user.') {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) return false;

    if (transfer.role === 'sender') {
      if (transfer.activeReq) {
        try { transfer.activeReq.destroy(); } catch (e) {}
      }
      // Inform receiver peer
      if (transfer.peer) {
        this.postJson(`http://${transfer.peer.ip}:${transfer.peer.port}/api/transfer/cancel`, JSON.stringify({ transferId, reason })).catch(() => {});
      }
    } else if (transfer.role === 'receiver') {
      if (transfer.currentWriteStream) {
        try { transfer.currentWriteStream.destroy(); } catch (e) {}
      }
      if (transfer.currentTempPath && fs.existsSync(transfer.currentTempPath)) {
        try { fs.unlinkSync(transfer.currentTempPath); } catch (e) {}
      }
      // Inform sender peer
      if (transfer.sender) {
        this.postJson(`http://${transfer.sender.ip}:${transfer.sender.port}/api/transfer/cancel`, JSON.stringify({ transferId, reason })).catch(() => {});
      }
    }

    this.activeTransfers.delete(transferId);
    this.sendToRenderer('fileshare:transfer-cancelled', { transferId, reason });
    return true;
  }

  handleCancelFromPeer(transferId, reason) {
    const transfer = this.activeTransfers.get(transferId);
    if (transfer) {
      if (transfer.role === 'receiver') {
        if (transfer.currentWriteStream) {
          try { transfer.currentWriteStream.destroy(); } catch (e) {}
        }
        if (transfer.currentTempPath && fs.existsSync(transfer.currentTempPath)) {
          try { fs.unlinkSync(transfer.currentTempPath); } catch (e) {}
        }
      } else if (transfer.role === 'sender') {
        if (transfer.activeReq) {
          try { transfer.activeReq.destroy(); } catch (e) {}
        }
      }
      this.activeTransfers.delete(transferId);
      this.sendToRenderer('fileshare:transfer-cancelled', { transferId, reason: reason || 'Peer cancelled transfer' });
    }
  }

  // Helper HTTP POST
  postJson(url, jsonString) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(jsonString)
        },
        timeout: 65000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ raw: body });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      req.write(jsonString);
      req.end();
    });
  }

  // File and Folder Dialog Helpers
  async pickFiles() {
    if (!this.mainWindow) return [];
    const result = await dialog.showOpenDialog(this.mainWindow, {
      title: 'Select Files to Share Offline',
      buttonLabel: 'Select Files',
      properties: ['openFile', 'multiSelections']
    });

    if (result.canceled || !result.filePaths.length) {
      return [];
    }

    return result.filePaths.map(fp => {
      try {
        const stats = fs.statSync(fp);
        return {
          path: fp,
          name: path.basename(fp),
          size: stats.size,
          ext: path.extname(fp).replace('.', '').toLowerCase()
        };
      } catch (e) {
        return {
          path: fp,
          name: path.basename(fp),
          size: 0,
          ext: ''
        };
      }
    });
  }

  async pickFolder() {
    if (!this.mainWindow) return this.downloadDir;
    const result = await dialog.showOpenDialog(this.mainWindow, {
      title: 'Select Folder for Received Files',
      defaultPath: this.downloadDir,
      properties: ['openDirectory', 'createDirectory']
    });

    if (!result.canceled && result.filePaths.length) {
      this.downloadDir = result.filePaths[0];
      return this.downloadDir;
    }
    return this.downloadDir;
  }

  openFolder(folderPath) {
    const target = folderPath || this.downloadDir;
    if (fs.existsSync(target)) {
      shell.openPath(target);
      return true;
    }
    return false;
  }

  openFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      shell.openPath(filePath);
      return true;
    }
    return false;
  }

  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  getNetworkStatus() {
    const info = {
      connected: false,
      wifiAvailable: false,
      ssid: '',
      ip: this.localIp || '',
      signal: '',
      adapterName: ''
    };

    if (process.platform === 'win32') {
      try {
        const out = execSync('netsh wlan show interfaces', { encoding: 'utf8', timeout: 3000 });
        if (out && !out.includes('There is no wireless interface')) {
          info.wifiAvailable = true;
          const stateMatch = /State\s*:\s*(.+)/i.exec(out);
          const ssidMatch = /SSID\s*:\s*(.+)/i.exec(out);
          const signalMatch = /Signal\s*:\s*(.+)/i.exec(out);
          const nameMatch = /Name\s*:\s*(.+)/i.exec(out);

          if (stateMatch) {
            info.connected = stateMatch[1].trim().toLowerCase() === 'connected';
          }
          if (ssidMatch) info.ssid = ssidMatch[1].trim();
          if (signalMatch) info.signal = signalMatch[1].trim();
          if (nameMatch) info.adapterName = nameMatch[1].trim();
        }
      } catch (e) {
        info.connected = Boolean(this.localIp && !this.localIp.startsWith('127.'));
      }
    } else {
      info.connected = Boolean(this.localIp && !this.localIp.startsWith('127.'));
    }

    return info;
  }

  async enableWifi() {
    if (process.platform === 'win32') {
      try {
        const psCmd = 'Get-NetAdapter | Where-Object { $_.Name -like "*Wi-Fi*" -or $_.InterfaceDescription -like "*Wi-Fi*" -or $_.InterfaceDescription -like "*Wireless*" } | Enable-NetAdapter -Confirm:$false';
        execSync(`powershell -WindowStyle Hidden -Command "${psCmd}"`, { timeout: 4000 });
      } catch (e) {}

      try {
        shell.openExternal('ms-settings:network-wifi');
      } catch (e) {}
    }
    return true;
  }

  async enableHotspot() {
    if (process.platform === 'win32') {
      try {
        shell.openExternal('ms-settings:network-mobilehotspot');
      } catch (e) {}
    }
    return true;
  }

  destroy() {
    this.stopDiscovery();
    if (this.httpServer) {
      try { this.httpServer.close(); } catch (e) {}
      this.httpServer = null;
    }
  }
}

const fileShareServiceInstance = new FileShareService();
module.exports = fileShareServiceInstance;
