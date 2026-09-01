# ⚡ LLOOP - Zero-Config Localhost Tunneling with Fixed URLs

**LLOOP** is a modern, user-friendly alternative to ngrok that allows anyone to expose local servers (frontend, backend, APIs, dev servers) to a live, secure HTTPS public URL accessible from anywhere on the internet.

Unlike free tier ngrok which generates inconvenient random URLs on every restart, **LLOOP** supports **fixed custom subdomains/URLs** (so your public URL remains constant every time you launch), live HTTP request inspection, mobile QR code previewing, and automated Python `venv` virtual environment setup.

---

## ✨ Features

- 🔗 **Fixed & Custom URLs**: Keep the exact same HTTPS URL every time you launch (`https://my-app.serveo.net`), or prompt for custom slugs/random URLs.
- ⚡ **Zero-Config Port Tunneling**: Works instantly with any local port (3000, 5000, 8000, 8080, etc.). Supports frontend frameworks (React, Next.js, Vite, Vue) and backends (FastAPI, Express, Django, Flask).
- 🔒 **Live HTTPS SSL**: Public URLs use valid SSL/TLS certificates out of the box — ideal for testing webhooks (Stripe, GitHub, Twilio, OAuth callbacks) and mobile apps.
- 🖥️ **Modern Desktop GUI**: Beautiful dark-mode interface built with CustomTkinter.
- 🔍 **Live Traffic Inspector**: Webhook/Request inspector capturing method, path, status, headers, body, and latency in real time.
- 📱 **Mobile QR Code Generator**: Instantly scan the QR code on your phone or tablet camera to open the live site.
- 🛠️ **Python Venv Ready**: Includes automated virtual environment setup and one-click launch scripts (`setup.bat`, `run.bat`, `setup.ps1`).
- 💻 **CLI & GUI Modes**: Run visually via the GUI app or headlessly in terminal/CI using command-line arguments.

---

## 🚀 Quick Start Guide

### Option 1: One-Click GUI Launcher (Windows)
Double click `run.bat` or `setup.bat`. It will automatically:
1. Create a Python `.venv` virtual environment if not already present.
2. Install all required dependencies.
3. Launch the LLOOP Desktop Application!

### Option 2: Command Line (CLI Mode)

Run using the Python virtual environment:

```bash
# Launch GUI mode
.\.venv\Scripts\python app\main.py

# Launch CLI mode for port 3000 with a fixed subdomain
.\.venv\Scripts\python app\main.py --port 3000 --fixed --subdomain my-frontend-app

# Launch CLI mode for port 8000 with random URL
.\.venv\Scripts\python app\main.py --port 8000 --random --cli
```

---

## 💡 How Fixed URLs Work

When you select **Fixed Subdomain Mode**:
1. LLOOP maps your local port (e.g., `3000`) to your chosen subdomain slug (e.g., `my-frontend-dev`).
2. Your public HTTPS URL becomes `https://my-frontend-dev.serveo.net`.
3. Next time you open LLOOP for port `3000`, it automatically retrieves your saved fixed subdomain and re-establishes the same public URL!

---

## 📁 Project Structure

```
TTT/
├── app/
│   ├── __init__.py
│   ├── main.py          # Entry point (CLI & GUI dispatcher)
│   ├── gui.py           # CustomTkinter Dark Mode GUI Interface
│   ├── tunnel_engine.py # SSH Tunnel Manager (Serveo/Pinggy/Localhost.run)
│   ├── inspector.py     # Local HTTP Traffic Inspector Proxy
│   ├── config.py        # Persistent JSON Configuration Manager
│   └── qr_generator.py  # Mobile QR Code Generator (PIL & ASCII)
├── requirements.txt     # Python Dependencies
├── setup.bat            # Automated Venv & Launcher Script (CMD)
├── setup.ps1            # Automated Venv & Launcher Script (PowerShell)
├── run.bat              # One-click Silent Launcher
└── README.md            # Documentation
```

---

## ⚙️ Configuration & Saved Profiles

Preferences and fixed URL mappings are automatically saved to `~/.lloop/config.json`. You can manage saved profiles directly within the **⭐ Saved Profiles** tab in the LLOOP GUI.
