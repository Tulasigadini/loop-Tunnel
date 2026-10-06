# ⚡ SHARE PORT - Zero-Config Localhost Tunneling & API Testing Suite

**SHARE PORT** is a modern, high-performance developer workspace built with **React** and **Electron**. It provides seamless localhost port tunneling to public HTTPS endpoints and a built-in, zero-CORS **API Testing** studio.

---

## ✨ Key Features

### 🌐 Share Port (Port Tunneling & Inspector)
- 🔗 **Fixed & Custom URLs**: Keep the exact same HTTPS URL every time you launch (`https://my-app.serveo.net`), or choose custom slugs or random URLs.
- ⚡ **Zero-Config Port Tunneling**: Supports any local port (3000, 5173, 8000, 8080). Works with Vite, React, Next.js, Node, FastAPI, Django, Flask, Express, and Docker.
- 🔒 **Cloudflare & OpenSSH Tunnel Engines**: Native support for Cloudflare Tunnels (Zero browser warnings) and OpenSSH (Serveo, localhost.run, Pinggy).
- 🔍 **Live Traffic & Webhook Inspector**: Real-time HTTP proxy gateway recording method, path, headers, request/response body, latency, and status codes.
- 📱 **Mobile Camera QR Preview**: Instant on-screen QR code for direct mobile and tablet camera testing.
- 🔄 **Replay in API Testing**: 1-click transfer of intercepted traffic directly into the API Testing workbench.

### 🚀 API Testing (Zero-CORS REST Studio)
- ⚡ **Zero CORS Restrictions**: Dispatched directly via Node.js native engine.
- 🎨 **Full Request Builder**: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS.
- 📁 **Collections & Environments**: Organize requests into folders and use `{{baseUrl}}` variable interpolation.
- 🔐 **Authentication**: Bearer Token, Basic Auth, and API Key support.
- 📊 **Rich Response Inspector**: Formatted Pretty JSON viewer, headers inspector, latency metrics, and 1-click cURL export.

---

## 🚀 Quick Start Guide

### Option 1: Double-Click Desktop Launcher
Double-click `run_desktop.bat` to launch the Electron application.

### Option 2: Running via Terminal
```bash
# Run in Electron Desktop mode
npm start

# Run React frontend in development mode
npm run dev
```

### Production Build
```bash
npm run build
```

---

## 📁 Architecture Overview

```
├── electron/
│   ├── main.cjs         # Electron main process (Tunnel process manager, proxy & request runner)
│   └── preload.cjs      # Secure context bridge IPC adapter
├── src/
│   ├── components/
│   │   ├── LandingPage.jsx      # 2-card interactive dashboard (Share Port & API Testing)
│   │   ├── Navbar.jsx           # Global status bar & navigation
│   │   ├── SharePort/
│   │   │   ├── SharePortView.jsx    # Port tunneling manager & engine selectors
│   │   │   ├── TrafficInspector.jsx # Live traffic & webhook log viewer
│   │   │   └── QrCodeModal.jsx      # Mobile QR code generator
│   │   ├── ApiTesting/
│   │   │   └── ApiTestingView.jsx   # REST & GraphQL API test workbench
│   │   └── Settings/
│   │       └── SettingsView.jsx     # Profiles, engine defaults & update checks
│   ├── services/
│   │   └── api.js               # Unified IPC adapter with fallback
│   ├── App.jsx                  # Root layout & view router
│   ├── index.css                # Modern design system & dark tokens
│   └── main.jsx                 # React root entry
├── vite.config.mjs              # Vite configuration
└── package.json                 # Project configuration
```

---

Official Website: [https://www.shareport.in](https://www.shareport.in)
