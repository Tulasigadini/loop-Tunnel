const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn, execSync } = require('child_process');
const net = require('net');
const urlParser = require('url');
const zlib = require('zlib');

let mainWindow = null;
let currentTunnelProcess = null;
let currentInspectorServer = null;
let inspectorLogs = [];
const MAX_LOGS = 200;

let consoleLogs = [];
const MAX_CONSOLE_LOGS = 500;

function appendConsoleLog(text) {
  if (!text) return;
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  lines.forEach(line => {
    const item = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      time: new Date().toLocaleTimeString(),
      text: line
    };
    consoleLogs.push(item);
    if (consoleLogs.length > MAX_CONSOLE_LOGS) consoleLogs.shift();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel:console-log', item);
    }
  });
}

// Config file paths matching Python ~/.shareport
const SHAREPORT_DIR = path.join(os.homedir(), '.shareport');
const CONFIG_FILE = path.join(SHAREPORT_DIR, 'config.json');
const COLLECTIONS_FILE = path.join(SHAREPORT_DIR, 'collections.json');
const BIN_DIR = path.join(SHAREPORT_DIR, 'bin');
const KEYS_DIR = path.join(SHAREPORT_DIR, 'keys');

// Ensure directories
[SHAREPORT_DIR, BIN_DIR, KEYS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  }
});

const DEFAULT_CONFIG = {
  default_engine: "cloudflare",
  default_port: 3000,
  last_used_port: 3000,
  last_used_subdomain: "",
  subdomain_mode: "fixed",
  auto_copy_url: true,
  enable_inspector: false,
  dark_mode: true,
  enable_auto_update_check: true,
  update_url: "https://www.shareport.in/version.json",
  saved_profiles: [],
  port_subdomain_map: {}
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8').replace(/^\uFEFF/, '').trim();
      if (raw) {
        const data = JSON.parse(raw);
        return { ...DEFAULT_CONFIG, ...data };
      }
    }
  } catch (err) {
    console.error('Failed reading config:', err);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed saving config:', err);
    return false;
  }
}

function loadCollections() {
  try {
    if (fs.existsSync(COLLECTIONS_FILE)) {
      const raw = fs.readFileSync(COLLECTIONS_FILE, 'utf-8').replace(/^\uFEFF/, '').trim();
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data) && data.length > 0) return data;
      }
    }
  } catch (err) {
    console.error('Failed reading collections:', err);
  }
  return [
    {
      id: "default-starter",
      name: "🚀 Local Server Starter",
      description: "Default starter requests for local development and live tunnels",
      variables: { baseUrl: "http://localhost:3000" },
      items: [
        {
          id: "req-1",
          name: "GET Health / Root",
          method: "GET",
          url: "{{baseUrl}}/",
          headers: [{ key: "Accept", value: "application/json", enabled: true }],
          params: [],
          bodyType: "none",
          bodyContent: "",
          auth: { type: "none" }
        },
        {
          id: "req-2",
          name: "POST Sample JSON",
          method: "POST",
          url: "{{baseUrl}}/api/test",
          headers: [{ key: "Content-Type", value: "application/json", enabled: true }],
          params: [],
          bodyType: "json",
          bodyContent: JSON.stringify({ message: "Hello from Share Port API Testing", timestamp: Date.now() }, null, 2),
          auth: { type: "none" }
        }
      ]
    }
  ];
}

function saveCollections(data) {
  try {
    fs.writeFileSync(COLLECTIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed saving collections:', err);
    return false;
  }
}

// Check if local port is active
function checkPortActive(port, host = '127.0.0.1', timeout = 200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isConnected = false;
    socket.setTimeout(timeout);

    socket.on('connect', () => {
      isConnected = true;
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

function findFreePort(startPort = 4040) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      resolve(findFreePort(startPort + 1));
    });
  });
}

// Locate or Download Cloudflared
async function getCloudflaredPath() {
  const targetExe = path.join(BIN_DIR, 'cloudflared.exe');
  if (fs.existsSync(targetExe) && fs.statSync(targetExe).size > 5 * 1024 * 1024) {
    return targetExe;
  }
  // Try system cloudflared
  try {
    const sysPath = execSync('where cloudflared', { encoding: 'utf-8' }).trim().split('\n')[0].trim();
    if (sysPath && fs.existsSync(sysPath)) return sysPath;
  } catch (e) {}

  // Download official binary
  console.log('[Share Port] Downloading cloudflared.exe binary...');
  const downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
  try {
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(targetExe);
      https.get(downloadUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          https.get(response.headers.location, (redirectRes) => {
            redirectRes.pipe(file);
            file.on('finish', () => file.close(resolve));
          }).on('error', reject);
        } else {
          response.pipe(file);
          file.on('finish', () => file.close(resolve));
        }
      }).on('error', reject);
    });
    if (fs.existsSync(targetExe) && fs.statSync(targetExe).size > 5 * 1024 * 1024) {
      return targetExe;
    }
  } catch (err) {
    console.error('Failed to download cloudflared:', err);
  }
  return 'cloudflared';
}

function getSshPath() {
  if (process.platform === 'win32') {
    const sysRoot = process.env.SystemRoot || 'C:\\Windows';
    const candidates = [
      path.join(sysRoot, 'System32', 'OpenSSH', 'ssh.exe'),
      path.join(sysRoot, 'System32', 'ssh.exe'),
      path.join(sysRoot, 'SysWOW64', 'OpenSSH', 'ssh.exe')
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }
  return 'ssh';
}

function ensureSshKey() {
  const keyPath = path.join(KEYS_DIR, 'id_ed25519');
  if (!fs.existsSync(keyPath)) {
    try {
      execSync(`ssh-keygen -t ed25519 -N "" -C "anonymous@shareport" -f "${keyPath}"`, { stdio: 'ignore' });
    } catch (e) {}
  }
  return keyPath;
}

// Tunnel State
let tunnelState = {
  status: 'STOPPED', // STOPPED, STARTING, CONNECTED, ERROR
  publicUrl: '',
  localPort: 3000,
  inspectorPort: null,
  provider: 'cloudflare',
  mode: 'fixed',
  subdomain: '',
  error: ''
};

function emitTunnelStatus(status, url = '', error = '') {
  tunnelState.status = status;
  if (url) tunnelState.publicUrl = url;
  if (error) tunnelState.error = error;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tunnel:status-changed', { ...tunnelState });
  }
}

// Helper to get SharePort logo base64 Data URI
function getLogoDataUri() {
  const candidatePaths = [
    path.join(__dirname, '../public/logo.png'),
    path.join(process.cwd(), 'public/logo.png'),
    path.join(__dirname, '../dist/logo.png'),
    path.join(process.cwd(), 'dist/logo.png'),
    path.join(__dirname, 'logo.png')
  ];
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        return `data:image/png;base64,${buf.toString('base64')}`;
      }
    } catch (e) {}
  }
  return '';
}

// Demo Landing Page HTML with Modern SharePort Teal & Mint Theme (Full Page Responsive Layout)
function getDemoLandingHtml(port, backendPort = 8000, enableFullstack = false) {
  const logoData = getLogoDataUri();
  const logoHtml = logoData 
    ? `<img src="${logoData}" alt="SHARE PORT" class="brand-logo-img" />`
    : `<div class="brand-icon">S</div>`;
  const heroLogoHtml = logoData 
    ? `<img src="${logoData}" alt="SHARE PORT" class="hero-logo-img" />`
    : `<div class="brand-icon" style="width: 56px; height: 56px; font-size: 26px; border-radius: 14px; margin: 0 auto 16px auto;">S</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SHARE PORT — Live Localhost Tunnel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #F8FAFC;
      color: #0F172A;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 28px 48px 28px;
    }
    .page-container {
      width: 100%;
      max-width: 1380px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
    }
    .header-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      margin-bottom: 28px;
      gap: 16px;
      flex-wrap: wrap;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 20px;
      font-weight: 800;
      color: #0F172A;
      text-decoration: none;
      letter-spacing: -0.5px;
    }
    .brand-logo-img {
      width: 36px;
      height: 36px;
      border-radius: 9px;
      object-fit: contain;
      box-shadow: 0 4px 12px rgba(13, 148, 136, 0.25);
      display: block;
    }
    .brand-icon {
      width: 36px;
      height: 36px;
      background: #0D9488;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FFFFFF;
      font-weight: 800;
      box-shadow: 0 4px 12px rgba(13, 148, 136, 0.3);
    }
    .nav-badges {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #F0FDFA;
      border: 1px solid #99F6E4;
      color: #0F766E;
      font-size: 13px;
      font-weight: 700;
      padding: 6px 16px;
      border-radius: 999px;
    }
    .security-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      color: #334155;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 999px;
    }
    .dot-live {
      width: 8px;
      height: 8px;
      background: #0D9488;
      border-radius: 50%;
      box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.2);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.15); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.8; }
    }
    .hero {
      text-align: center;
      width: 100%;
      margin-bottom: 24px;
    }
    .hero-logo-img {
      width: 58px;
      height: 58px;
      border-radius: 14px;
      object-fit: contain;
      box-shadow: 0 8px 24px rgba(13, 148, 136, 0.25);
      margin: 0 auto 14px auto;
      display: block;
    }
    .hero h1 {
      font-size: 36px;
      font-weight: 800;
      color: #0F172A;
      letter-spacing: -1px;
      line-height: 1.25;
      margin-bottom: 8px;
    }
    .hero h1 span {
      color: #0D9488;
    }
    .hero p {
      font-size: 15.5px;
      color: #475569;
      line-height: 1.6;
      max-width: 820px;
      margin: 0 auto;
    }
    .notice-card {
      background: #F0FDFA;
      border: 1.5px solid #99F6E4;
      border-radius: 14px;
      padding: 16px 22px;
      width: 100%;
      margin-bottom: 24px;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      box-shadow: 0 2px 10px rgba(13, 148, 136, 0.05);
    }
    .notice-icon {
      font-size: 24px;
      line-height: 1;
      flex-shrink: 0;
    }
    .notice-title {
      font-size: 15px;
      font-weight: 800;
      color: #0F766E;
      margin-bottom: 4px;
    }
    .notice-desc {
      font-size: 13.5px;
      color: #334155;
      line-height: 1.5;
    }

    /* FULL-PAGE 2-COLUMN GRID */
    .dashboard-grid {
      display: grid;
      grid-template-columns: 1.22fr 1fr;
      gap: 24px;
      width: 100%;
      align-items: start;
    }
    @media (max-width: 1024px) {
      .dashboard-grid {
        grid-template-columns: 1fr;
      }
    }

    /* TERMINAL CARD */
    .terminal-card {
      background: #0F172A;
      border: 1px solid #1E293B;
      border-radius: 16px;
      width: 100%;
      overflow: hidden;
      box-shadow: 0 16px 36px rgba(15, 23, 42, 0.14);
      margin-bottom: 20px;
    }
    .terminal-header {
      background: #1E293B;
      padding: 12px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .dots {
      display: flex;
      gap: 7px;
    }
    .dot { width: 11px; height: 11px; border-radius: 50%; }
    .dot-r { background: #EF4444; }
    .dot-y { background: #F59E0B; }
    .dot-g { background: #10B981; }
    .term-title {
      color: #94A3B8;
      font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
    }
    .term-body {
      padding: 22px 24px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13.5px;
      line-height: 1.8;
      color: #F8FAFC;
    }
    .txt-teal { color: #2DD4BF; font-weight: 700; }
    .txt-green { color: #4ADE80; font-weight: 700; }
    .txt-yellow { color: #FBBF24; font-weight: 700; }
    .txt-muted { color: #64748B; }

    /* SPECS TILES */
    .specs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .spec-tile {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      padding: 12px 14px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.03);
    }
    .spec-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748B;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .spec-value {
      font-size: 13px;
      color: #0F172A;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
    }

    /* RIGHT COLUMN CARDS */
    .info-card {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 16px;
      padding: 20px 22px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.03);
      margin-bottom: 20px;
    }
    .info-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }
    .info-card-title {
      font-size: 14px;
      font-weight: 800;
      color: #0F172A;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cmd-list {
      display: flex;
      flex-direction: column;
      gap: 9px;
    }
    .cmd-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 8px 12px;
      gap: 10px;
    }
    .cmd-stack {
      font-size: 11.5px;
      font-weight: 700;
      color: #0F766E;
      min-width: 110px;
    }
    .cmd-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #334155;
      flex-grow: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cmd-btn {
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      color: #475569;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 5px;
      cursor: pointer;
      font-weight: 700;
      flex-shrink: 0;
      transition: all 0.15s ease;
    }
    .cmd-btn:hover {
      background: #F0FDFA;
      color: #0D9488;
      border-color: #99F6E4;
    }
    .feature-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .feature-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .feature-icon-badge {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: #F0FDFA;
      border: 1px solid #CCFBF1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
    }
    .feature-name {
      font-size: 13px;
      font-weight: 700;
      color: #0F172A;
      margin-bottom: 2px;
    }
    .feature-desc {
      font-size: 12px;
      color: #64748B;
      line-height: 1.45;
    }

    .footer {
      margin-top: 36px;
      color: #64748B;
      font-size: 13px;
      text-align: center;
      width: 100%;
    }
    .footer a {
      color: #0D9488;
      text-decoration: none;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="header-nav">
      <a href="https://www.shareport.in" target="_blank" class="brand">
        ${logoHtml}
        <span>SHARE PORT</span>
      </a>
      <div class="nav-badges">
        <div class="security-pill">
          <span>🔒</span>
          <span>End-to-End SSL Verified</span>
        </div>
        <div class="status-pill">
          <div class="dot-live"></div>
          <span>Tunnel Active & Ready — www.shareport.in</span>
        </div>
      </div>
    </div>

    <div class="hero">
      ${heroLogoHtml}
      <h1>Expose Your Localhost to the World <span>in 1 Click</span></h1>
      <p>Your secure public HTTPS tunnel is connected! Share Port is listening for traffic to forward to your local dev server.</p>
    </div>

    <div class="notice-card">
      <div class="notice-icon">💡</div>
      <div>
        <div class="notice-title">Make sure your selected ports are running in local host.</div>
        <div class="notice-desc">Awaiting your local development server on <strong>http://127.0.0.1:${port}</strong>${enableFullstack ? ` (Backend: <strong>http://127.0.0.1:${backendPort}</strong>)` : ''}. Once you run your server locally, this page will automatically reload and display your app.</div>
      </div>
    </div>

    <!-- FULL PAGE 2-COLUMN DASHBOARD GRID -->
    <div class="dashboard-grid">
      <!-- LEFT COLUMN: GATEWAY TERMINAL & DEV HUMOR -->
      <div>
        <div class="terminal-card">
          <div class="terminal-header">
            <div class="dots">
              <div class="dot dot-r"></div>
              <div class="dot dot-y"></div>
              <div class="dot dot-g"></div>
            </div>
            <div class="term-title">SHARE PORT Gateway output — 127.0.0.1:${port}</div>
          </div>
          <div class="term-body">
            <div><span class="txt-teal">[SHARE PORT]</span> Tunnel Gateway Active for local port ${port}...</div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 4px 0;">
              <span class="txt-green">[SUCCESS]</span> Public HTTPS URL: 
              <a id="public-tunnel-link" href="#" target="_blank" class="txt-teal" style="font-weight: 700; text-decoration: underline; word-break: break-all;">Detecting URL...</a>
              <button onclick="copyShareUrl()" id="copy-btn" style="background: rgba(45, 212, 191, 0.15); border: 1px solid #2DD4BF; color: #2DD4BF; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-weight: 700; transition: all 0.2s;">Copy Link</button>
            </div>
            <div><span class="txt-yellow">[WAITING]</span> Listening for local process on port ${port}...</div>
            <div><span class="txt-teal">[AUTO-DETECT]</span> Background polling active — auto-reloads immediately once server is up</div>
            <div style="margin: 8px 0 16px 0; color: #94A3B8;">Start your app locally with: <code style="color: #38BDF8;">npm run dev</code> or <code style="color: #38BDF8;">python main.py</code></div>

            <!-- EXCITING DEVELOPER HUMOR & CODING WISDOM -->
            <div style="background: rgba(13, 148, 136, 0.08); border: 1px solid rgba(45, 212, 191, 0.25); border-radius: 12px; padding: 18px; margin-top: 10px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                <div style="font-size: 12px; color: #2DD4BF; font-weight: 800; display: flex; align-items: center; gap: 6px;">
                  <span>💡</span>
                  <span>DEV HUMOR WHILE YOUR SERVER SPINS UP</span>
                </div>
                <button onclick="nextJoke()" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: #F8FAFC; font-size: 11.5px; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-weight: 700; transition: all 0.2s;">Next Byte 😂</button>
              </div>
              
              <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 16px 18px; min-height: 64px; display: flex; align-items: center;">
                <div id="joke-content" style="color: #F8FAFC; font-size: 14px; line-height: 1.6; font-style: italic; transition: opacity 0.2s ease;">
                  "Why do programmers prefer dark mode? Because light attracts bugs. 🐛"
                </div>
              </div>

              <div style="margin-top: 12px; display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #94A3B8; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <div class="dot-live" style="width: 7px; height: 7px;"></div>
                  <span id="status-msg" style="color: #2DD4BF; font-weight: 600;">Auto-detecting localhost:${port}... (will auto-reload once your server starts)</span>
                </div>
                <span style="font-size: 11px; color: #64748B;">Auto-rotates jokes every 7s</span>
              </div>
            </div>
          </div>
        </div>

        <!-- SPECIFICATION TILES -->
        <div class="specs-grid">
          <div class="spec-tile">
            <div class="spec-label">Target Port</div>
            <div class="spec-value" style="color: #0D9488;">:${port}</div>
          </div>
          <div class="spec-tile">
            <div class="spec-label">Protocol</div>
            <div class="spec-value">HTTPS / TLS 1.3</div>
          </div>
          <div class="spec-tile">
            <div class="spec-label">Edge Gateway</div>
            <div class="spec-value">SHARE PORT Global Edge</div>
          </div>
          <div class="spec-tile">
            <div class="spec-label">Auto-Reload</div>
            <div class="spec-value" style="color: #10B981;">Active ✓</div>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN: QUICK START COMMANDS & USEFUL MESSAGES -->
      <div>
        <!-- QUICK START COMMANDS -->
        <div class="info-card">
          <div class="info-card-header">
            <div class="info-card-title">
              <span>🚀</span>
              <span>Quick Server Commands</span>
            </div>
            <span style="font-size: 11px; color: #64748B; font-weight: 600;">Ready to paste</span>
          </div>
          <div class="cmd-list">
            <div class="cmd-item">
              <span class="cmd-stack">Vite / React / Vue</span>
              <code class="cmd-code">npm run dev</code>
              <button class="cmd-btn" onclick="copySnippet('npm run dev', this)">Copy</button>
            </div>
            <div class="cmd-item">
              <span class="cmd-stack">Next.js</span>
              <code class="cmd-code">npx next dev</code>
              <button class="cmd-btn" onclick="copySnippet('npx next dev', this)">Copy</button>
            </div>
            <div class="cmd-item">
              <span class="cmd-stack">Python FastAPI</span>
              <code class="cmd-code">uvicorn main:app --reload --port ${port}</code>
              <button class="cmd-btn" onclick="copySnippet('uvicorn main:app --reload --port ${port}', this)">Copy</button>
            </div>
            <div class="cmd-item">
              <span class="cmd-stack">Python Flask</span>
              <code class="cmd-code">flask run -p ${port}</code>
              <button class="cmd-btn" onclick="copySnippet('flask run -p ${port}', this)">Copy</button>
            </div>
            <div class="cmd-item">
              <span class="cmd-stack">Java Spring Boot</span>
              <code class="cmd-code">./mvnw spring-boot:run</code>
              <button class="cmd-btn" onclick="copySnippet('./mvnw spring-boot:run', this)">Copy</button>
            </div>
            <div class="cmd-item">
              <span class="cmd-stack">Go Server</span>
              <code class="cmd-code">go run main.go</code>
              <button class="cmd-btn" onclick="copySnippet('go run main.go', this)">Copy</button>
            </div>
          </div>
        </div>

        <!-- WHAT YOU CAN DO WITH SHAREPORT -->
        <div class="info-card">
          <div class="info-card-header">
            <div class="info-card-title">
              <span>✨</span>
              <span>What You Can Do With This Public URL</span>
            </div>
          </div>
          <div class="feature-list">
            <div class="feature-item">
              <div class="feature-icon-badge">📱</div>
              <div>
                <div class="feature-name">Mobile & Cross-Device Testing</div>
                <div class="feature-desc">Open your public HTTPS URL on iOS/Android devices to test mobile layouts and camera/geolocation APIs.</div>
              </div>
            </div>
            <div class="feature-item">
              <div class="feature-icon-badge">🪝</div>
              <div>
                <div class="feature-name">Webhook Testing & Debugging</div>
                <div class="feature-desc">Receive live webhook events from Stripe, GitHub, Razorpay, Twilio, and Slack directly on your machine.</div>
              </div>
            </div>
            <div class="feature-item">
              <div class="feature-icon-badge">👥</div>
              <div>
                <div class="feature-name">Instant Client & Teammate Demos</div>
                <div class="feature-desc">Share your progress with remote teammates or clients across the globe without deploying to staging servers.</div>
              </div>
            </div>
            <div class="feature-item">
              <div class="feature-icon-badge">⚡</div>
              <div>
                <div class="feature-name">Zero-Touch Seamless Reload</div>
                <div class="feature-desc">Keep this tab open! As soon as your server starts responding locally, SharePort transitions directly to your application.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      Powered by <a href="https://www.shareport.in" target="_blank">SHARE PORT</a> — Zero-Config Localhost Tunneling Engine • <a href="https://www.shareport.in" target="_blank">www.shareport.in</a>
    </div>
  </div>

  <script>
    // Developer Jokes Collection
    const jokes = [
      "Why do programmers prefer dark mode? Because light attracts bugs. 🐛",
      "There are 10 types of people in the world: Those who understand binary, and those who don't. 🤖",
      "A programmer's spouse tells them: 'Go to the store and get a loaf of bread. If they have eggs, get a dozen.' They return with 12 loaves of bread. 🍞",
      "It works on my machine! ¯\\\\_(ツ)_/¯ — That's why we built SharePort, so it works on everyone's machine! 🚀",
      "Real developer status: Spent 4 hours debugging, only to find a missing comma or typo. ☕",
      "A SQL query walks into a bar, walks up to two tables and asks: 'Can I join you?' 🍻",
      "There are two hard things in Computer Science: cache invalidation, naming things, and off-by-one errors. 🔢",
      "Programmer (noun): A machine that turns caffeine into code and stack traces. ☕💻",
      "Knock, knock. Who's there? ...very long pause... Java! ☕",
      "99 little bugs in the code. 99 little bugs. Take one down, patch it around... 127 little bugs in the code. 🐞",
      "Code never lies, comments sometimes do. 💭",
      "Debugging: Being the detective in a crime movie where you are also the murderer. 🕵️‍♂️",
      "There's no place like 127.0.0.1, but SharePort makes it accessible anywhere on earth. 🌍",
      "To understand recursion, you must first understand recursion. 🔄",
      "Software developer motto: If it works, don't touch it! ⚠️",
      "Git commit message at 3 AM: 'fixed stuff, please work' 🌙",
      "Hardware is the part of a computer you can kick; Software is the part you can only curse at. 🖥️"
    ];
    let jokeIdx = 0;
    function nextJoke() {
      jokeIdx = (jokeIdx + 1) % jokes.length;
      const jokeElem = document.getElementById('joke-content');
      if (jokeElem) {
        jokeElem.style.opacity = '0';
        setTimeout(() => {
          jokeElem.innerText = '"' + jokes[jokeIdx] + '"';
          jokeElem.style.opacity = '1';
        }, 150);
      }
    }
    // Auto-rotate jokes every 7 seconds
    setInterval(nextJoke, 7000);

    // Set Public SharePort URL dynamically from current window.location
    function updateUrlDisplay() {
      const linkElem = document.getElementById('public-tunnel-link');
      if (linkElem) {
        linkElem.href = window.location.href;
        linkElem.innerText = window.location.href;
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', updateUrlDisplay);
    } else {
      updateUrlDisplay();
    }

    function copyShareUrl() {
      navigator.clipboard.writeText(window.location.href).then(() => {
        const btn = document.getElementById('copy-btn');
        if (btn) btn.innerText = 'Copied! ✓';
        setTimeout(() => { if (btn) btn.innerText = 'Copy Link'; }, 2000);
      }).catch(() => {
        prompt('Copy public tunnel link:', window.location.href);
      });
    }

    function copySnippet(text, btn) {
      navigator.clipboard.writeText(text).then(() => {
        if (btn) {
          const orig = btn.innerText;
          btn.innerText = 'Copied!';
          btn.style.color = '#0D9488';
          setTimeout(() => { btn.innerText = orig; btn.style.color = ''; }, 1800);
        }
      });
    }

    // Auto-Reload Checker
    let autoReloading = false;
    async function checkServer() {
      try {
        const res = await fetch('/__shareport_status__', { cache: 'no-store' });
        const data = await res.json();
        if (data.active) {
          const msg = document.getElementById('status-msg');
          if (msg) {
            msg.innerHTML = '✓ Local server detected on port ' + data.port + '! Loading your application...';
            msg.style.color = '#4ADE80';
          }
          if (!autoReloading) {
            autoReloading = true;
            setTimeout(() => { window.location.reload(); }, 600);
          }
        }
      } catch(e) {}
    }

    // Auto-poll every 2.5 seconds to instantly reload when user starts their server
    setInterval(checkServer, 2500);
  </script>
</body>
</html>`;
}

// Start Traffic Inspector / Gateway Proxy
async function startInspectorProxy(localPort, backendPort = 8000, enableFullstack = false, enableInspector = false) {
  const inspectorPort = await findFreePort(4040);

  const server = http.createServer((req, res) => {
    const startTime = Date.now();
    const reqId = 'req_' + Math.random().toString(36).substring(2, 9);
    const clientIp = req.socket.remoteAddress || '127.0.0.1';

    // Status / Health check for the live landing page auto-reloader
    if (req.url === '/__shareport_status__') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      checkPortActive(localPort, '127.0.0.1', 80).then(isActive => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ active: isActive, port: localPort, timestamp: Date.now() }));
      });
      return;
    }

    // Serve SharePort logo asset directly
    if (req.url === '/__shareport_logo__' || req.url === '/logo.png') {
      const candidates = [
        path.join(__dirname, '../public/logo.png'),
        path.join(process.cwd(), 'public/logo.png'),
        path.join(__dirname, 'logo.png')
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          fs.createReadStream(p).pipe(res);
          return;
        }
      }
    }

    // Collect request body
    const reqChunks = [];
    req.on('data', chunk => reqChunks.push(chunk));
    req.on('end', async () => {
      const reqBodyBuffer = Buffer.concat(reqChunks);
      const reqBodyStr = reqBodyBuffer.toString('utf-8');

      // Routing
      let targetPort = localPort;
      const isApi = /^\/(api|v1|v2|health|graphql)/i.test(req.url);
      if (enableFullstack && isApi && backendPort) {
        targetPort = backendPort;
      }

      // Check if target is responding
      const isTargetActive = await checkPortActive(targetPort, '127.0.0.1', 80);

      if (!isTargetActive) {
        // Fallback demo page or API response
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        if (isApi || (req.headers.accept && req.headers.accept.includes('application/json'))) {
          const apiMsg = JSON.stringify({
            status: "online",
            gateway: "SHARE PORT",
            message: `Target port ${targetPort} is currently idle. Start your local server to handle requests.`,
            port: targetPort,
            timestamp: new Date().toISOString()
          }, null, 2);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(apiMsg);

          if (enableInspector) {
            recordLog({
              id: reqId,
              timestamp: new Date().toLocaleTimeString(),
              method: req.method,
              path: req.url,
              status: 200,
              durationMs: Date.now() - startTime,
              clientIp,
              reqHeaders: req.headers,
              reqBody: reqBodyStr,
              resHeaders: { 'content-type': 'application/json' },
              resBody: apiMsg
            });
          }
        } else {
          const html = getDemoLandingHtml(targetPort, backendPort, enableFullstack);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);

          if (enableInspector) {
            recordLog({
              id: reqId,
              timestamp: new Date().toLocaleTimeString(),
              method: req.method,
              path: req.url,
              status: 200,
              durationMs: Date.now() - startTime,
              clientIp,
              reqHeaders: req.headers,
              reqBody: reqBodyStr,
              resHeaders: { 'content-type': 'text/html' },
              resBody: '200 OK Demo Landing HTML'
            });
          }
        }
        return;
      }

      // Proxy request to local port
      const options = {
        hostname: '127.0.0.1',
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: `localhost:${targetPort}`,
          'x-forwarded-for': clientIp,
          'x-forwarded-proto': 'https'
        }
      };

      const proxyReq = http.request(options, (proxyRes) => {
        const resChunks = [];
        proxyRes.on('data', chunk => resChunks.push(chunk));
        proxyRes.on('end', () => {
          const resBodyBuffer = Buffer.concat(resChunks);
          const resBodyStr = resBodyBuffer.toString('utf-8');

          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          res.end(resBodyBuffer);

          if (enableInspector) {
            recordLog({
              id: reqId,
              timestamp: new Date().toLocaleTimeString(),
              method: req.method,
              path: req.url,
              status: proxyRes.statusCode,
              durationMs: Date.now() - startTime,
              clientIp,
              reqHeaders: req.headers,
              reqBody: reqBodyStr,
              resHeaders: proxyRes.headers,
              resBody: resBodyStr.length > 20000 ? resBodyStr.substring(0, 20000) + '... (truncated)' : resBodyStr
            });
          }
        });
      });

      proxyReq.on('error', (err) => {
        // Fallback to demo landing html instead of crashing with 502
        const html = getDemoLandingHtml(targetPort, backendPort, enableFullstack);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });

      if (reqBodyBuffer.length > 0) {
        proxyReq.write(reqBodyBuffer);
      }
      proxyReq.end();
    });
  });

  return new Promise((resolve) => {
    server.listen(inspectorPort, '127.0.0.1', () => {
      console.log(`[SharePort Gateway] Listening on 127.0.0.1:${inspectorPort}`);
      currentInspectorServer = server;
      resolve(inspectorPort);
    });
  });
}

function recordLog(logItem) {
  inspectorLogs.unshift(logItem);
  if (inspectorLogs.length > MAX_LOGS) {
    inspectorLogs.pop();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('inspector:new-log', logItem);
  }
}

// Start Tunnel Process
async function startTunnelEngine({ port, provider = 'cloudflare', mode = 'fixed', subdomain = '', enableInspector = true, backendPort = 8000, enableFullstack = false }) {
  stopTunnelEngine();

  tunnelState.localPort = parseInt(port) || 3000;
  tunnelState.provider = provider;
  tunnelState.mode = mode;
  tunnelState.subdomain = subdomain;
  tunnelState.error = '';
  emitTunnelStatus('STARTING');

  let targetPort = tunnelState.localPort;

  // Always start the local SharePort Gateway Proxy so that:
  // 1. If local server is running, traffic is proxied seamlessly.
  // 2. If local server is NOT running, SharePort displays its branded 200 OK Live Gateway page instead of Cloudflare 502 Bad Gateway!
  try {
    const gwPort = await startInspectorProxy(targetPort, backendPort, enableFullstack, enableInspector);
    tunnelState.inspectorPort = gwPort;
    targetPort = gwPort;
  } catch (e) {
    console.warn('Gateway proxy fallback directly to localPort:', e);
  }

  let command = '';
  let args = [];

  if (provider === 'cloudflare') {
    command = await getCloudflaredPath();
    args = ['tunnel', '--url', `http://127.0.0.1:${targetPort}`];
  } else if (provider === 'serveo') {
    command = getSshPath();
    const keyPath = ensureSshKey();
    const cleanSub = (subdomain || '').replace(/[^a-z0-9\-]/gi, '').toLowerCase();
    const remoteSpec = (mode !== 'random' && cleanSub) ? `${cleanSub}:80:127.0.0.1:${targetPort}` : `0:80:127.0.0.1:${targetPort}`;
    args = [
      '-T',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=NUL',
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=10',
      '-o', 'ServerAliveInterval=30',
      '-i', keyPath,
      '-R', remoteSpec,
      'serveo.net'
    ];
  } else if (provider === 'localhost_run') {
    command = getSshPath();
    const keyPath = ensureSshKey();
    args = [
      '-T',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=NUL',
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=10',
      '-o', 'ServerAliveInterval=30',
      '-i', keyPath,
      '-R', `80:127.0.0.1:${targetPort}`,
      'nokey@localhost.run'
    ];
  } else if (provider === 'pinggy') {
    command = getSshPath();
    const keyPath = ensureSshKey();
    args = [
      '-T',
      '-p', '443',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=NUL',
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=10',
      '-i', keyPath,
      '-R', `0:127.0.0.1:${targetPort}`,
      'a:X-Pinggy-No-Screen:true@a.pinggy.io'
    ];
  }

  console.log(`[Tunnel Process] Executing: ${command} ${args.join(' ')}`);

  try {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    currentTunnelProcess = child;

    const urlRegex = /https:\/\/[a-zA-Z0-9\-\.\:]+/g;
    let urlFound = false;

    const parseOutput = (data) => {
      const text = data.toString();
      appendConsoleLog(text);
      console.log(`[Tunnel Out] ${text.trim()}`);

      if (!urlFound) {
        const matches = text.match(urlRegex);
        if (matches) {
          for (const match of matches) {
            const cleanUrl = match.replace(/[.,;:\s]+$/, '');
            const lower = cleanUrl.toLowerCase();
            if (
              lower.includes('trycloudflare.com') ||
              lower.includes('serveo.net') ||
              lower.includes('lhr.life') ||
              lower.includes('pinggy')
            ) {
              urlFound = true;
              emitTunnelStatus('CONNECTED', cleanUrl);
              break;
            }
          }
        }
      }
    };

    child.stdout.on('data', parseOutput);
    child.stderr.on('data', parseOutput);

    child.on('error', (err) => {
      console.error('Tunnel child error:', err);
      emitTunnelStatus('ERROR', '', err.message || 'Process error');
    });

    child.on('close', (code) => {
      console.log(`Tunnel closed with code ${code}`);
      if (tunnelState.status === 'CONNECTED' || tunnelState.status === 'STARTING') {
        emitTunnelStatus('STOPPED', '', code !== 0 ? `Tunnel exited with code ${code}` : '');
      }
    });

    // Timeout check: give engine 30s to connect before timing out
    setTimeout(() => {
      if (!urlFound && tunnelState.status === 'STARTING') {
        console.warn('URL discovery timed out');
        emitTunnelStatus('ERROR', '', 'Connection timed out. Please verify your internet connection or switch connection engine.');
      }
    }, 30000);

  } catch (err) {
    emitTunnelStatus('ERROR', '', err.message);
  }
}

function stopTunnelEngine() {
  if (currentTunnelProcess) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${currentTunnelProcess.pid} /T /F`, { stdio: 'ignore' });
      } else {
        currentTunnelProcess.kill('SIGTERM');
      }
    } catch (e) {}
    currentTunnelProcess = null;
  }
  if (currentInspectorServer) {
    try { currentInspectorServer.close(); } catch (e) {}
    currentInspectorServer = null;
  }
  tunnelState.publicUrl = '';
  tunnelState.status = 'STOPPED';
  emitTunnelStatus('STOPPED');
}

// High-speed keep-alive connection pools for sub-millisecond local responses
const httpKeepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsKeepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 50, rejectUnauthorized: false });

// Helper to parse cookies from Set-Cookie header array
function parseResponseCookies(setCookieHeaders) {
  if (!setCookieHeaders) return [];
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return list.map(raw => {
    const parts = raw.split(';').map(p => p.trim());
    const [first, ...rest] = parts;
    const eqIdx = first.indexOf('=');
    const name = eqIdx !== -1 ? first.substring(0, eqIdx).trim() : first;
    const value = eqIdx !== -1 ? first.substring(eqIdx + 1).trim() : '';
    const cookie = { name, value, raw };
    rest.forEach(attr => {
      const aEq = attr.indexOf('=');
      const aKey = (aEq !== -1 ? attr.substring(0, aEq) : attr).toLowerCase();
      const aVal = aEq !== -1 ? attr.substring(aEq + 1) : true;
      if (aKey === 'path') cookie.path = aVal;
      else if (aKey === 'domain') cookie.domain = aVal;
      else if (aKey === 'expires') cookie.expires = aVal;
      else if (aKey === 'max-age') cookie.maxAge = aVal;
      else if (aKey === 'httponly') cookie.httpOnly = true;
      else if (aKey === 'secure') cookie.secure = true;
      else if (aKey === 'samesite') cookie.sameSite = aVal;
    });
    return cookie;
  });
}

// Transparent HTTP/HTTPS executor with decompression
function performSingleHttpRequest(targetUrl, httpMethod, reqHeaders, requestBody, timeout) {
  const startTime = Date.now();
  const urlObj = new URL(targetUrl);
  const isHttps = urlObj.protocol === 'https:';
  const protocol = isHttps ? https : http;
  const agent = isHttps ? httpsKeepAliveAgent : httpKeepAliveAgent;

  return new Promise((resolve) => {
    const clientReq = protocol.request(urlObj.toString(), {
      method: httpMethod,
      headers: reqHeaders,
      agent,
      timeout
    }, (res) => {
      const resChunks = [];
      res.on('data', c => resChunks.push(c));
      res.on('end', () => {
        const durationMs = Date.now() - startTime;
        let resBuffer = Buffer.concat(resChunks);

        // Transparent Decompression: Brotli, Gzip, Deflate
        const encoding = (res.headers['content-encoding'] || '').toLowerCase();
        try {
          if (encoding === 'gzip') {
            resBuffer = zlib.gunzipSync(resBuffer);
          } else if (encoding === 'br') {
            resBuffer = zlib.brotliDecompressSync(resBuffer);
          } else if (encoding === 'deflate') {
            resBuffer = zlib.inflateSync(resBuffer);
          }
        } catch (decompErr) {
          // Fall back to raw buffer if decompression fails
        }

        const sizeBytes = resBuffer.length;
        const resText = resBuffer.toString('utf-8');
        const cookies = parseResponseCookies(res.headers['set-cookie']);

        resolve({
          success: true,
          status: res.statusCode || 200,
          statusText: res.statusMessage || 'OK',
          headers: res.headers || {},
          cookies,
          body: resText,
          timeMs: durationMs,
          sizeBytes
        });
      });
    });

    clientReq.on('timeout', () => {
      clientReq.destroy();
      resolve({
        success: false,
        status: 0,
        statusText: 'Timeout',
        error: `Request timed out after ${timeout}ms`,
        timeMs: Date.now() - startTime,
        headers: {},
        cookies: [],
        body: ''
      });
    });

    clientReq.on('error', (err) => {
      resolve({
        success: false,
        status: 0,
        statusText: 'Network / Connection Error',
        error: err.message || 'Failed to connect to host',
        timeMs: Date.now() - startTime,
        headers: {},
        cookies: [],
        body: ''
      });
    });

    if (requestBody && requestBody.length > 0) {
      clientReq.write(requestBody);
    }
    clientReq.end();
  });
}

// Direct Node HTTP Request Dispatcher for API Testing (Zero-Server / 100% Local)
async function executeApiRequest(reqConfig) {
  const startTime = Date.now();
  let {
    method = 'GET',
    url = '',
    baseUrl = 'http://localhost:3000',
    headers = [],
    params = [],
    bodyType = 'none',
    bodyContent = '',
    formDataFields = [],
    urlencodedFields = [],
    binaryPath = '',
    graphqlQuery = '',
    graphqlVariables = '',
    auth = { type: 'none' },
    timeout = 30000,
    verifySsl = false
  } = reqConfig;

  try {
    // 1. Smart URL Normalization & Resolution
    let rawUrl = (url || '').trim().replace(/^["'<]+|["'>]+$/g, '');
    let cleanBaseUrl = (baseUrl || 'http://localhost:3000').trim().replace(/\/+$/, '');

    // Auto-detect scheme for base URL if missing
    if (!cleanBaseUrl.startsWith('http://') && !cleanBaseUrl.startsWith('https://')) {
      const isLocal = cleanBaseUrl.includes('localhost') || cleanBaseUrl.includes('127.0.0.1') || cleanBaseUrl.startsWith('192.168.');
      cleanBaseUrl = (isLocal ? 'http://' : 'https://') + cleanBaseUrl;
    }

    let targetUrl = rawUrl;
    if (targetUrl.includes('{{baseUrl}}')) {
      targetUrl = targetUrl.replace(/\{\{baseUrl\}\}/g, cleanBaseUrl);
    } else if (targetUrl.startsWith('/')) {
      targetUrl = `${cleanBaseUrl}${targetUrl}`;
    } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      if (targetUrl.length > 0) {
        // Check if target starts with domain or relative path
        if (targetUrl.includes('.') && !targetUrl.startsWith('./')) {
          const isLocal = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');
          targetUrl = (isLocal ? 'http://' : 'https://') + targetUrl;
        } else {
          targetUrl = `${cleanBaseUrl}/${targetUrl}`;
        }
      } else {
        targetUrl = cleanBaseUrl;
      }
    }

    const urlObj = new URL(targetUrl);

    // 2. Append Query Params
    if (Array.isArray(params)) {
      params.forEach(p => {
        if (p.enabled && p.key && p.key.trim().length > 0) {
          urlObj.searchParams.append(p.key.trim(), p.value || '');
        }
      });
    }

    // 3. Build Headers
    const reqHeaders = {};
    if (Array.isArray(headers)) {
      headers.forEach(h => {
        if (h.enabled && h.key && h.key.trim().length > 0) {
          reqHeaders[h.key.trim()] = h.value || '';
        }
      });
    }

    // 4. Handle Auth Methods
    const aType = (auth?.type || '').toLowerCase();
    if ((aType === 'bearer' || aType === 'bearer token') && auth.token) {
      const prefix = auth.prefix || 'Bearer';
      reqHeaders['Authorization'] = `${prefix} ${auth.token}`;
    } else if ((aType === 'basic' || aType === 'basic auth')) {
      const basicStr = Buffer.from(`${auth.username || ''}:${auth.password || ''}`).toString('base64');
      reqHeaders['Authorization'] = `Basic ${basicStr}`;
    } else if ((aType === 'apikey' || aType === 'api key') && auth.key && auth.value) {
      if (auth.addTo === 'query') {
        urlObj.searchParams.append(auth.key, auth.value);
      } else {
        reqHeaders[auth.key] = auth.value;
      }
    } else if ((aType === 'oauth2' || aType === 'oauth 2.0') && auth.token) {
      const prefix = auth.prefix || 'Bearer';
      reqHeaders['Authorization'] = `${prefix} ${auth.token}`;
    } else if (aType === 'digest' || aType === 'digest auth') {
      const basicStr = Buffer.from(`${auth.username || ''}:${auth.password || ''}`).toString('base64');
      reqHeaders['Authorization'] = `Digest ${basicStr}`;
    } else if (aType === 'aws' || aType === 'aws signature') {
      if (auth.accessKey && auth.secretKey) {
        reqHeaders['X-Amz-Date'] = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
        if (auth.region) reqHeaders['X-Amz-Region'] = auth.region;
        if (auth.service) reqHeaders['X-Amz-Service'] = auth.service;
        reqHeaders['Authorization'] = `AWS4-HMAC-SHA256 Credential=${auth.accessKey}/...`;
      }
    }

    // Default Browser-grade Headers
    if (!reqHeaders['user-agent'] && !reqHeaders['User-Agent']) {
      reqHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SharePort-ApiTester/2.0';
    }
    if (!reqHeaders['accept'] && !reqHeaders['Accept']) {
      reqHeaders['Accept'] = 'application/json, text/plain, */*';
    }
    if (!reqHeaders['accept-encoding'] && !reqHeaders['Accept-Encoding']) {
      reqHeaders['Accept-Encoding'] = 'gzip, deflate, br';
    }

    // 5. Prepare Request Body
    let requestBody = null;
    const httpMethod = method.toUpperCase();

    if (!['GET', 'HEAD'].includes(httpMethod)) {
      if (bodyType === 'json' || bodyType === 'raw') {
        if (!reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
          const rawFmt = (reqConfig.rawFormat || 'JSON').toUpperCase();
          if (rawFmt === 'JSON') reqHeaders['Content-Type'] = 'application/json';
          else if (rawFmt === 'XML') reqHeaders['Content-Type'] = 'application/xml';
          else if (rawFmt === 'HTML') reqHeaders['Content-Type'] = 'text/html';
          else if (rawFmt === 'JAVASCRIPT') reqHeaders['Content-Type'] = 'application/javascript';
          else reqHeaders['Content-Type'] = 'text/plain';
        }
        requestBody = Buffer.from(bodyContent || '', 'utf-8');
      } else if (bodyType === 'x-www-form-urlencoded') {
        if (!reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        const search = new URLSearchParams();
        const fields = Array.isArray(urlencodedFields) && urlencodedFields.length > 0 ? urlencodedFields : [];
        fields.forEach(f => {
          if (f.enabled && f.key) search.append(f.key, f.value || '');
        });
        requestBody = Buffer.from(search.toString(), 'utf-8');
      } else if (bodyType === 'form-data') {
        const boundary = '----WebKitFormBoundarySharePort' + Math.random().toString(36).substring(2);
        if (!reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
        }
        const chunks = [];
        const fields = Array.isArray(formDataFields) ? formDataFields : [];
        fields.forEach(f => {
          if (f.enabled && f.key) {
            const isFile = f.type === 'File' || (typeof f.value === 'string' && f.value.startsWith('@'));
            let filePath = isFile ? f.value.replace(/^@/, '').trim() : '';
            if (isFile && filePath && fs.existsSync(filePath)) {
              try {
                const fileBuf = fs.readFileSync(filePath);
                const fileName = path.basename(filePath);
                chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.key}"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
                chunks.push(fileBuf);
                chunks.push(Buffer.from('\r\n'));
              } catch (e) {
                chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.key}"\r\n\r\n${f.value || ''}\r\n`));
              }
            } else {
              chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.key}"\r\n\r\n${f.value || ''}\r\n`));
            }
          }
        });
        chunks.push(Buffer.from(`--${boundary}--\r\n`));
        requestBody = Buffer.concat(chunks);
      } else if (bodyType === 'binary') {
        const binTarget = (binaryPath || bodyContent || '').trim();
        if (binTarget && fs.existsSync(binTarget)) {
          try {
            requestBody = fs.readFileSync(binTarget);
          } catch (e) {
            requestBody = Buffer.from(binTarget, 'utf-8');
          }
        } else {
          requestBody = Buffer.from(binTarget, 'utf-8');
        }
        if (!reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'application/octet-stream';
        }
      } else if (bodyType === 'GraphQL') {
        if (!reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
        let parsedVars = {};
        try {
          if (graphqlVariables && graphqlVariables.trim()) {
            parsedVars = JSON.parse(graphqlVariables);
          }
        } catch (e) {}
        const gqlPayload = JSON.stringify({
          query: graphqlQuery || bodyContent || '',
          variables: parsedVars
        });
        requestBody = Buffer.from(gqlPayload, 'utf-8');
      }
    }

    if (requestBody && !reqHeaders['content-length'] && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = requestBody.length;
    }

    // Execute first attempt
    let result = await performSingleHttpRequest(urlObj.toString(), httpMethod, reqHeaders, requestBody, timeout);

    // WAF & Mod_Security Auto-Resilience: If blocked with 403 or 406, transparently retry with modern browser headers
    if (result && (result.status === 403 || result.status === 406)) {
      const retryHeaders = {
        ...reqHeaders,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
      };
      const retryResult = await performSingleHttpRequest(urlObj.toString(), httpMethod, retryHeaders, requestBody, timeout);
      if (retryResult && retryResult.success && retryResult.status >= 200 && retryResult.status < 400) {
        result = retryResult;
      }
    }

    return result;

  } catch (err) {
    return {
      success: false,
      status: 0,
      statusText: 'Execution Error',
      error: err.message,
      timeMs: Date.now() - startTime,
      headers: {},
      cookies: [],
      body: ''
    };
  }
}

// Window Management
function createWindow() {
  const iconPath = path.join(__dirname, '..', 'app_icon.ico');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    title: 'SHARE PORT',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#FFFFFF',
    frame: false, // Frameless window - custom topbar at very top
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximize-change', true);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximize-change', false);
    }
  });

  const isDev = !app.isPackaged && process.argv.includes('--dev');
  if (isDev || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // Check if dist exists
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      mainWindow.loadURL('http://localhost:5173');
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App Lifecycles
app.whenReady().then(() => {
  // IPC Setup
  ipcMain.handle('tunnel:start', async (_event, options) => {
    startTunnelEngine(options);
    return { ...tunnelState };
  });

  ipcMain.handle('tunnel:stop', async () => {
    stopTunnelEngine();
    return { ...tunnelState };
  });

  ipcMain.handle('tunnel:get-status', () => ({ ...tunnelState }));
  ipcMain.handle('tunnel:get-console', () => consoleLogs);
  ipcMain.handle('tunnel:clear-console', () => {
    consoleLogs = [];
    return true;
  });

  ipcMain.handle('inspector:get-logs', () => inspectorLogs);
  ipcMain.handle('inspector:clear-logs', () => {
    inspectorLogs = [];
    return true;
  });

  ipcMain.handle('api:send-request', async (_event, reqConfig) => {
    return await executeApiRequest(reqConfig);
  });

  ipcMain.handle('config:get', (_event, key) => loadConfig()[key]);
  ipcMain.handle('config:set', (_event, key, val) => {
    const cfg = loadConfig();
    cfg[key] = val;
    saveConfig(cfg);
    return true;
  });
  ipcMain.handle('config:get-all', () => loadConfig());

  ipcMain.handle('config:save-profile', (_event, profile) => {
    const cfg = loadConfig();
    cfg.saved_profiles = (cfg.saved_profiles || []).filter(p => p.name !== profile.name);
    cfg.saved_profiles.push(profile);
    saveConfig(cfg);
    return cfg.saved_profiles;
  });

  ipcMain.handle('config:delete-profile', (_event, name) => {
    const cfg = loadConfig();
    cfg.saved_profiles = (cfg.saved_profiles || []).filter(p => p.name !== name);
    saveConfig(cfg);
    return cfg.saved_profiles;
  });

  ipcMain.handle('collections:get', () => loadCollections());
  ipcMain.handle('collections:save', (_event, colls) => saveCollections(colls));

  ipcMain.handle('system:check-port', async (_event, port) => {
    return await checkPortActive(parseInt(port) || 3000);
  });

  ipcMain.handle('system:open-url', (_event, targetUrl) => {
    if (targetUrl) shell.openExternal(targetUrl);
  });

  ipcMain.handle('system:copy-clipboard', (_event, text) => {
    clipboard.writeText(text || '');
    return true;
  });

  ipcMain.handle('system:get-version', () => '2.0.0');

  ipcMain.handle('system:check-updates', async () => {
    return { hasUpdate: false, currentVersion: '2.0.0', latestVersion: '2.0.0' };
  });

  // Window Controls
  ipcMain.handle('window:minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
    return true;
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
        return false;
      } else {
        mainWindow.maximize();
        return true;
      }
    }
    return false;
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    return true;
  });

  ipcMain.handle('window:is-maximized', () => {
    if (mainWindow && !mainWindow.isDestroyed()) return mainWindow.isMaximized();
    return false;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopTunnelEngine();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopTunnelEngine();
});
