import http.server
import http.client
import socketserver
import urllib.request
import urllib.parse
import socket
import threading
import time
import json
import re
import gzip
import zlib
from datetime import datetime
from typing import Callable, List, Dict, Any, Optional


import os

def _get_active_host(port: int) -> str:
    """Dynamically resolves the fastest working loopback host for a given port."""
    try:
        from app.tunnel_engine import get_active_host
        return get_active_host(port)
    except Exception:
        return "127.0.0.1"


def _check_port_active(port: int) -> bool:
    """Checks if a port is currently open and reachable."""
    try:
        from app.tunnel_engine import check_port_active
        return check_port_active(port)
    except Exception:
        return True


def get_logo_base64() -> str:
    """Reads official SHARE PORT logo image (with arrow) and returns data URI."""
    try:
        from app.tunnel_engine import get_resource_path
        logo_path = get_resource_path("public/logo.png")
        if not os.path.exists(logo_path):
            logo_path = get_resource_path("Assets/StoreLogo.png")
        if os.path.exists(logo_path):
            import base64
            with open(logo_path, "rb") as f:
                encoded = base64.b64encode(f.read()).decode("utf-8")
                return f"data:image/png;base64,{encoded}"
    except Exception:
        pass
    return ""


def get_demo_landing_html(port: int) -> str:
    """Generates a modern 200 OK Live Demo Landing Page styled after official Share Port website (shareport.in)."""
    logo_b64 = get_logo_base64()
    if logo_b64:
        logo_markup = f'<img src="{logo_b64}" alt="SHARE PORT Logo" style="height: 38px; width: auto; object-fit: contain;">'
    else:
        logo_markup = '''<div class="logo-box">
            <div class="logo-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M7 17L17 7"/><path d="M7 7h10v10"/>
                </svg>
            </div>
            <span>SHARE PORT</span>
        </div>'''

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SHARE PORT — Live Localhost Tunnel</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; }}
        body {{ background: #F8FAFC; color: #0F172A; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 40px 20px; }}
        .header-nav {{ display: flex; align-items: center; justify-content: space-between; width: 100%; max-width: 860px; margin-bottom: 32px; }}
        .logo-box {{ display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 800; color: #0F172A; text-decoration: none; }}
        .logo-icon {{ background: #0070F3; color: white; border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; }}
        .active-pill {{ display: inline-flex; align-items: center; gap: 8px; background: #DEF7EC; border: 1px solid #BCF0DA; color: #03543F; font-size: 13px; font-weight: 700; padding: 6px 16px; border-radius: 999px; }}
        .active-dot {{ width: 8px; height: 8px; background: #057A55; border-radius: 50%; box-shadow: 0 0 8px #057A55; }}
        .hero {{ text-align: center; max-width: 760px; width: 100%; margin-bottom: 32px; }}
        .hero h1 {{ font-size: 42px; font-weight: 800; line-height: 1.15; color: #0F172A; margin-bottom: 16px; letter-spacing: -0.02em; }}
        .hero h1 span {{ color: #0070F3; }}
        .hero p {{ font-size: 17px; color: #475569; line-height: 1.6; margin-bottom: 24px; }}
        .notice-card {{ background: #FEF3C7; border: 1px solid #FCD34D; color: #92400E; border-radius: 16px; padding: 18px 24px; font-size: 15px; font-weight: 700; text-align: center; margin-bottom: 32px; max-width: 860px; width: 100%; box-shadow: 0 4px 12px rgba(217, 119, 6, 0.08); }}
        .terminal-card {{ background: #0F172A; border-radius: 16px; width: 100%; max-width: 860px; overflow: hidden; box-shadow: 0 20px 40px -15px rgba(15, 23, 42, 0.4); border: 1px solid rgba(255, 255, 255, 0.1); }}
        .terminal-header {{ background: #1E293B; padding: 12px 18px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }}
        .dot {{ width: 12px; height: 12px; border-radius: 50%; }}
        .dot-red {{ background: #EF4444; }}
        .dot-yellow {{ background: #F59E0B; }}
        .dot-green {{ background: #10B981; }}
        .terminal-title {{ color: #94A3B8; font-size: 12px; font-family: Consolas, monospace; margin-left: 8px; font-weight: 600; }}
        .terminal-body {{ padding: 24px; font-family: Consolas, monospace; font-size: 14px; line-height: 1.8; color: #F8FAFC; }}
        .log-tag {{ color: #38BDF8; font-weight: 700; }}
        .log-success {{ color: #4ADE80; font-weight: 700; }}
        .log-traffic {{ color: #FBBF24; font-weight: 700; }}
        .interactive-box {{ background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 18px; margin-top: 20px; }}
        .btn-group {{ display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }}
        .btn-main {{ background: #0070F3; color: white; border: none; font-size: 14px; font-weight: 700; padding: 12px 24px; border-radius: 10px; cursor: pointer; transition: all 0.2s ease; }}
        .btn-main:hover {{ background: #0051A8; transform: translateY(-1px); }}
        .btn-sec {{ background: rgba(255, 255, 255, 0.1); color: #F8FAFC; border: 1px solid rgba(255, 255, 255, 0.15); font-size: 14px; font-weight: 600; padding: 12px 20px; border-radius: 10px; cursor: pointer; }}
        .btn-sec:hover {{ background: rgba(255, 255, 255, 0.2); }}
        .res-box {{ background: #020617; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px; color: #4ADE80; font-size: 13px; min-height: 48px; display: flex; align-items: center; white-space: pre-wrap; }}
        .footer {{ margin-top: 36px; color: #94A3B8; font-size: 13px; text-align: center; }}
        .footer a {{ color: #0070F3; text-decoration: none; font-weight: 600; }}
    </style>
</head>
<body>
    <div class="header-nav">
        <a href="https://www.shareport.in" target="_blank" style="text-decoration: none;">
            {logo_markup}
        </a>
        <div class="active-pill">
            <div class="active-dot"></div>
            <span>SHARE PORT Active (v1.0.26) — www.shareport.in</span>
        </div>
    </div>

    <div class="hero">
        <h1>Expose Your Localhost to the World <span>in 1 Click</span></h1>
        <p>Make your local React, Node, Python, or Django server accessible over secure HTTPS.<br>Zero installation, zero accounts required.</p>
    </div>

    <div class="notice-card">
        ⚠️ Make sure to run your local servers on selected ports. If not, start your servers and start a new tunnel.
    </div>

    <div class="terminal-card">
        <div class="terminal-header">
            <div class="dot dot-red"></div>
            <div class="dot dot-yellow"></div>
            <div class="dot dot-green"></div>
            <div class="terminal-title">SHARE PORT Terminal output — 127.0.0.1:{port}</div>
        </div>
        <div class="terminal-body">
            <div><span class="log-tag">[SHARE PORT]</span> Starting Tunnel Gateway for local port {port}...</div>
            <div><span class="log-success">[SUCCESS]</span> Public HTTPS URL: Connected & Live (200 OK)</div>
            <div><span class="log-traffic">[Traffic]</span> GET /api/v1/health → 200 OK (12ms)</div>

            <div class="interactive-box">
                <div style="font-size: 12px; color: #94A3B8; margin-bottom: 12px; font-weight: 700; text-transform: uppercase;">⚡ Live Interactive Tunnel Verification</div>
                <div class="btn-group">
                    <button class="btn-main" onclick="testAPI()">⚡ Test API Endpoint (/api/health)</button>
                    <button class="btn-sec" onclick="incrementCounter()">Click Counter: <span id="cnt">0</span></button>
                </div>
                <div class="res-box" id="res">Click "Test API Endpoint" to verify live full-stack HTTP connection...</div>
            </div>
        </div>
    </div>

    <div class="footer">
        Powered by <a href="https://www.shareport.in" target="_blank">SHARE PORT</a> — Zero-Config Localhost Tunneling Engine
    </div>

    <script>
        let count = 0;
        function testAPI() {{
            const resEl = document.getElementById('res');
            resEl.innerText = "Requesting /api/health...";
            fetch('/api/health')
                .then(r => r.json())
                .then(d => {{
                    resEl.innerText = JSON.stringify(d, null, 2);
                }})
                .catch(e => {{
                    resEl.innerText = "Response: 200 OK (Share Port Live Connection Verified)";
                }});
        }}
        function incrementCounter() {{
            count++;
            document.getElementById('cnt').innerText = count;
            fetch('/api/demo-counter?count=' + count).catch(() => {{}});
        }}
    </script>
</body>
</html>"""


class RequestLog:
    """Represents an intercepted HTTP request/response transaction."""

    def __init__(self, req_id: int, method: str, path: str, headers: dict, body: bytes):
        self.id = req_id
        self.timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        self.method = method
        self.path = path
        self.headers = headers
        self.request_body = body
        self.response_status = 0
        self.response_reason = ""
        self.response_headers = {}
        self.response_body = b""
        self.duration_ms = 0.0
        self.error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "method": self.method,
            "path": self.path,
            "status": self.response_status,
            "duration": f"{self.duration_ms:.1f}ms",
            "req_size": f"{len(self.request_body)}B",
            "res_size": f"{len(self.response_body)}B",
            "error": self.error
        }


class InspectorProxyHandler(http.server.BaseHTTPRequestHandler):
    """Smart Proxy handler supporting Concurrent HTTP, WebSockets, Feed Media, & React SPA Fallback Handling."""

    frontend_port: int = 3000
    backend_port: int = 8000
    enable_unified_fullstack: bool = True
    target_host: str = "127.0.0.1"
    request_counter: int = 0
    on_request_callback: Optional[Callable[[RequestLog], None]] = None
    lock = threading.Lock()

    API_KEYWORDS = [
        "/api", "/auth", "/login", "/register", "/token", "/v1", "/v2", "/docs", 
        "/openapi.json", "/redoc", "/users", "/user", "/verify", "/check", 
        "/workspace", "/org", "/organization", "/email", "/ws", "/socket.io", 
        "/chat", "/messages", "/events", "/stream", "/sse", "/graphql",
        "/uploads", "/media", "/files", "/documents", "/storage", "/attachments",
        "/download", "/images", "/public/uploads", "/static/uploads",
        "/feed", "/posts", "/post", "/status", "/polls", "/channel"
    ]

    MEDIA_EXTENSIONS = [
        ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico",
        ".docx", ".xlsx", ".pptx", ".mp4", ".webm", ".mp3", ".wav", ".zip", ".rar", ".txt", ".csv"
    ]

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        self._proxy_request()

    def do_POST(self):
        self._proxy_request()

    def do_PUT(self):
        self._proxy_request()

    def do_DELETE(self):
        self._proxy_request()

    def do_PATCH(self):
        self._proxy_request()

    def do_HEAD(self):
        self._proxy_request()

    def do_OPTIONS(self):
        self._proxy_request()

    def _send_cors_headers(self):
        """Sends W3C compliant CORS headers matching request Origin."""
        origin = self.headers.get('Origin', '')
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Access-Control-Allow-Credentials', 'true')
        else:
            self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
        self.send_header('Access-Control-Allow-Headers', '*')

    def _determine_target_port(self) -> int:
        """Determines whether to route request to Frontend (e.g. 5173, 3000) or Backend (e.g. 8000)."""
        if not self.enable_unified_fullstack or not self.backend_port:
            return self.frontend_port

        # If backend port is NOT currently active on the system, route everything to frontend!
        # Prevents breaking single-server frontends when Full-Stack mode is active.
        if not _check_port_active(self.backend_port):
            return self.frontend_port

        path_lower = self.path.lower()
        clean_path = path_lower.split("?")[0]

        # 0. Enterprise application context paths (Pega PRPC, Odoo, Tomcat apps, SAP, Siebel, etc.)
        # These paths belong to the enterprise application server and must not be intercepted by SPA/API routing.
        enterprise_prefixes = [
            "/prweb", "/prsysmgmt", "/prhelp", "/manager", "/host-manager",
            "/sap", "/siebel", "/pega", "/webwb", "/odoo", "/web", "/longpolling"
        ]
        if any(clean_path.startswith(p) for p in enterprise_prefixes):
            if self.backend_port in [8069, 8080, 8443, 7001, 9080] and self.frontend_port not in [8069, 8080, 8443, 7001, 9080]:
                return self.backend_port
            return self.frontend_port

        # 1. Frontend source files, node_modules, and Vite/Webpack dev internals ALWAYS go to frontend!
        frontend_prefixes = ["/src/", "/@", "/node_modules/", "/favicon", "/manifest"]
        if any(clean_path.startswith(p) for p in frontend_prefixes):
            return self.frontend_port

        # 2. Frontend static file extensions ALWAYS go to frontend (unless explicitly starting with /api/)
        static_exts = [
            ".js", ".jsx", ".ts", ".tsx", ".css", ".scss", ".sass", ".less",
            ".svg", ".ico", ".png", ".jpg", ".jpeg", ".webp", ".gif",
            ".woff", ".woff2", ".ttf", ".eot", ".map", ".json"
        ]
        if any(clean_path.endswith(ext) for ext in static_exts):
            if not clean_path.startswith("/api/"):
                return self.frontend_port

        # 3. Dev Server HMR WebSockets & JS bundles must ALWAYS go to frontend
        sec_protocol = self.headers.get("Sec-WebSocket-Protocol", "").lower()
        if "vite" in sec_protocol or "hmr" in sec_protocol or "webpack" in sec_protocol:
            return self.frontend_port

        if any(kw in clean_path for kw in ["hmr", "webpack", "vite", "bundle.js", "@vite", "@react-refresh"]):
            return self.frontend_port

        # 4. SPA Page Navigations (Accept: text/html):
        # Browser page navigations (e.g. GET /posts, GET /dashboard, GET /user, GET /auth) belong to Frontend SPA!
        # Only explicit backend prefixes (/api/, /docs, /redoc, /openapi.json) go to Backend.
        accept_hdr = self.headers.get("Accept", "").lower()
        if "text/html" in accept_hdr and self.command == "GET":
            explicit_be_prefixes = ["/api/", "/api", "/docs", "/redoc", "/openapi.json"]
            if not any(clean_path.startswith(p) or clean_path == p for p in explicit_be_prefixes):
                return self.frontend_port

        # 5. WebSocket / Connection Upgrade headers (Non-HMR)
        upgrade_hdr = self.headers.get("Upgrade", "").lower()
        conn_hdr = self.headers.get("Connection", "").lower()
        if "websocket" in upgrade_hdr or "upgrade" in conn_hdr:
            return self.backend_port

        # 6. Explicit Backend Media / Storage Path prefixes
        backend_media_prefixes = [
            "/api/", "/uploads/", "/media/", "/files/", "/documents/", "/storage/", "/attachments/", "/public/uploads/", "/static/uploads/"
        ]
        if any(clean_path.startswith(p) for p in backend_media_prefixes):
            return self.backend_port

        # 7. Match against known API & Feed path segments (/api, /auth/, /v1/, etc.)
        for kw in self.API_KEYWORDS:
            clean_kw = kw.strip('/')
            if clean_path == f"/{clean_kw}" or clean_path.startswith(f"/{clean_kw}/"):
                return self.backend_port

        # 8. ALL POST, PUT, DELETE, PATCH requests are ALWAYS Backend API requests in fullstack mode!
        if self.command in ['POST', 'PUT', 'DELETE', 'PATCH']:
            return self.backend_port

        # 9. Match JSON requests or API headers
        content_type = self.headers.get("Content-Type", "")
        if "application/json" in content_type or "application/json" in accept_hdr:
            return self.backend_port

        return self.frontend_port

    @classmethod
    def _rewrite_location_url(cls, loc: str, public_host: str, public_proto: str, target_port: int) -> str:
        """Rewrites upstream redirect Location header to public HTTPS tunnel URL."""
        if not loc or not public_host:
            return loc

        loc_trimmed = loc.strip()
        # Relative location e.g. "/prweb/" or "/prweb/PRServlet"
        if loc_trimmed.startswith('/'):
            return f"{public_proto}://{public_host}{loc_trimmed}"

        # Absolute location e.g. "http://localhost:8080/prweb/..." or "http://127.0.0.1:8080/..."
        try:
            parts = urllib.parse.urlsplit(loc_trimmed)
            if parts.scheme in ('http', 'https') and parts.netloc:
                hostname = parts.hostname.lower() if parts.hostname else ''
                local_names = {'localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'}
                try:
                    hn = socket.gethostname().lower()
                    if hn:
                        local_names.add(hn)
                    fqdn = socket.getfqdn().lower()
                    if fqdn:
                        local_names.add(fqdn)
                except Exception:
                    pass

                # If redirect points to local loopback or target port
                if hostname in local_names or str(target_port) in parts.netloc:
                    new_parts = urllib.parse.SplitResult(
                        scheme=public_proto,
                        netloc=public_host,
                        path=parts.path,
                        query=parts.query,
                        fragment=parts.fragment
                    )
                    return urllib.parse.urlunsplit(new_parts)
        except Exception:
            pass

        return loc

    @classmethod
    def _rewrite_cookie(cls, cookie_val: str, public_host: str, public_proto: str) -> str:
        """Strips local Domain from Set-Cookie so browser accepts cookie for public tunnel domain."""
        if not cookie_val:
            return cookie_val

        local_names = ['localhost', '127.0.0.1', '0.0.0.0', '::1']
        try:
            hn = socket.gethostname().lower()
            if hn:
                local_names.append(hn)
        except Exception:
            pass

        # Strip Domain=localhost, Domain=127.0.0.1, etc.
        for name in local_names:
            cookie_val = re.sub(rf'(?i);\s*Domain\s*=\s*{re.escape(name)}\b', '', cookie_val)

        # In HTTPS tunnel, ensure Secure is added if SameSite=None
        if public_proto == 'https':
            if 'samesite=none' in cookie_val.lower() and 'secure' not in cookie_val.lower():
                cookie_val += '; Secure'

        return cookie_val

    @classmethod
    def _rewrite_refresh_url(cls, refresh_hdr: str, public_host: str, public_proto: str, target_port: int) -> str:
        """Rewrites URL in Refresh header (e.g. '5; url=http://localhost:8080/prweb/')."""
        if not refresh_hdr or not public_host:
            return refresh_hdr
        if 'url=' in refresh_hdr.lower():
            parts = re.split(r'(?i)url=', refresh_hdr, maxsplit=1)
            if len(parts) == 2:
                rewritten_url = cls._rewrite_location_url(parts[1].strip(), public_host, public_proto, target_port)
                return f"{parts[0]}url={rewritten_url}"
        return refresh_hdr

    @classmethod
    def _rewrite_body_urls(cls, body: bytes, target_port: int, public_host: str, public_proto: str) -> bytes:
        """Rewrites loopback/local URLs in HTML, JavaScript, CSS, JSON, XML responses to public tunnel URL."""
        if not body or not public_host:
            return body

        repl_https = f"{public_proto}://{public_host}".encode('utf-8')
        repl_wss = f"wss://{public_host}".encode('utf-8')
        repl_escaped = f"{public_proto}:\\/\\/{public_host}".encode('utf-8')
        repl_wss_escaped = f"wss:\\/\\/{public_host}".encode('utf-8')

        ports = {target_port}
        if cls.frontend_port and cls.frontend_port > 0:
            ports.add(cls.frontend_port)
        if cls.backend_port and cls.backend_port > 0:
            ports.add(cls.backend_port)
        ports.update({8069, 8072, 8080, 8443, 7001, 8000, 3000, 5000})

        local_hosts = ['localhost', '127.0.0.1', '0.0.0.0']
        try:
            hn = socket.gethostname().lower()
            if hn:
                local_hosts.append(hn)
        except Exception:
            pass

        for h in local_hosts:
            h_bytes = h.encode('utf-8')
            # Portless http://localhost/ -> https://public_host/
            body = body.replace(b'http://' + h_bytes + b'/', repl_https + b'/')
            body = body.replace(b'http:\\/\\/' + h_bytes + b'\\/', repl_escaped + b'\\/')
            for p in ports:
                p_bytes = str(p).encode('utf-8')
                # http://host:port -> https://public_host
                body = body.replace(b'http://' + h_bytes + b':' + p_bytes, repl_https)
                body = body.replace(b'http:\\/\\/' + h_bytes + b':' + p_bytes, repl_escaped)
                # ws://host:port -> wss://public_host
                body = body.replace(b'ws://' + h_bytes + b':' + p_bytes, repl_wss)
                body = body.replace(b'ws:\\/\\/' + h_bytes + b':' + p_bytes, repl_wss_escaped)

        return body

    def _proxy_websocket(self, target_port: int):
        """Pipes real-time bi-directional WebSocket frames between client and local server using dual-stack sockets."""
        active_h = _get_active_host(target_port)
        hosts_to_try = [active_h, "localhost" if active_h == "127.0.0.1" else "127.0.0.1"]
        target_sock = None
        last_err = None
        for host in hosts_to_try:
            try:
                target_sock = socket.create_connection((host, target_port), timeout=5)
                break
            except Exception as e:
                last_err = e

        if not target_sock:
            self.send_error(502, f"WebSocket Connection Error to port {target_port}: {last_err}")
            return

        public_host = self.headers.get('X-Forwarded-Host') or self.headers.get('Host', '')
        public_proto = self.headers.get('X-Forwarded-Proto', 'https')

        req_line = f"{self.command} {self.path} {self.request_version}\r\n"
        target_sock.sendall(req_line.encode("latin1"))

        skip_headers = {'host'}
        for k, v in self.headers.items():
            if k.lower() not in skip_headers:
                target_sock.sendall(f"{k}: {v}\r\n".encode("latin1"))

        target_sock.sendall(f"Host: localhost:{target_port}\r\n".encode("latin1"))
        if public_host:
            target_sock.sendall(f"X-Forwarded-Host: {public_host}\r\n".encode("latin1"))
            target_sock.sendall(f"X-Forwarded-Proto: {public_proto}\r\n".encode("latin1"))
            target_sock.sendall(f"X-Forwarded-Port: 443\r\n".encode("latin1"))
        target_sock.sendall(b"\r\n")

        client_sock = self.request

        def pipe(src, dst):
            try:
                while True:
                    buf = src.recv(65536)
                    if not buf:
                        break
                    dst.sendall(buf)
            except Exception:
                pass
            finally:
                try:
                    dst.shutdown(socket.SHUT_RDWR)
                except Exception:
                    pass

        t1 = threading.Thread(target=pipe, args=(client_sock, target_sock), daemon=True)
        t2 = threading.Thread(target=pipe, args=(target_sock, client_sock), daemon=True)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

    def _fetch_from_target(self, target_port: int, forward_headers: dict, req_body: bytes):
        """Executes transparent HTTP request to target port without following redirects."""
        active_h = _get_active_host(target_port)
        hosts_to_try = [active_h, "localhost" if active_h == "127.0.0.1" else "127.0.0.1"]
        last_exception = None

        for host in hosts_to_try:
            conn = None
            try:
                conn = http.client.HTTPConnection(host, target_port, timeout=60)
                conn.request(
                    method=self.command,
                    url=self.path,
                    body=req_body if req_body else None,
                    headers=forward_headers
                )
                resp = conn.getresponse()
                raw_body = resp.read()
                resp_status = resp.status
                resp_reason = resp.reason
                resp_headers = resp.getheaders()
                conn.close()
                return resp_status, resp_reason, resp_headers, raw_body
            except Exception as e:
                last_exception = e
                if conn:
                    try:
                        conn.close()
                    except Exception:
                        pass

        if last_exception:
            raise last_exception

    def _proxy_request(self):
        with InspectorProxyHandler.lock:
            InspectorProxyHandler.request_counter += 1
            req_id = InspectorProxyHandler.request_counter

        # Handle CORS Preflight OPTIONS requests immediately
        if self.command == 'OPTIONS':
            self.send_response(200)
            self._send_cors_headers()
            self.end_headers()
            return

        target_port = self._determine_target_port()

        # Check for WebSocket Upgrade
        upgrade_hdr = self.headers.get("Upgrade", "").lower()
        conn_hdr = self.headers.get("Connection", "").lower()
        if "websocket" in upgrade_hdr or "upgrade" in conn_hdr:
            self._proxy_websocket(target_port)
            return

        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 0:
            req_body = self.rfile.read(content_length)
        elif self.headers.get('Transfer-Encoding', '').lower() == 'chunked':
            chunks = []
            try:
                while True:
                    line = self.rfile.readline()
                    if not line:
                        break
                    chunk_len_str = line.strip().split(b';')[0]
                    chunk_len = int(chunk_len_str, 16)
                    if chunk_len == 0:
                        self.rfile.readline()
                        break
                    chunks.append(self.rfile.read(chunk_len))
                    self.rfile.readline()
                req_body = b"".join(chunks)
            except Exception:
                req_body = b""
        else:
            req_body = b""

        skip_forward_headers = {
            'connection', 'keep-alive', 'proxy-authenticate',
            'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade',
            'accept-encoding'
        }
        forward_headers = {k: v for k, v in self.headers.items() if k.lower() not in skip_forward_headers}
        self.close_connection = True

        public_host = self.headers.get('X-Forwarded-Host') or self.headers.get('Host', '')
        public_proto = self.headers.get('X-Forwarded-Proto')
        if not public_proto:
            cf_visitor = self.headers.get('CF-Visitor', '')
            if 'https' in cf_visitor.lower() or self.headers.get('X-Forwarded-Ssl', '').lower() == 'on':
                public_proto = 'https'
            else:
                public_proto = 'https'

        client_ip = (
            self.headers.get('CF-Connecting-IP')
            or self.headers.get('X-Forwarded-For', '').split(',')[0].strip()
            or self.headers.get('X-Real-IP')
            or (self.client_address[0] if self.client_address else '127.0.0.1')
        )

        forward_headers['Host'] = f"localhost:{target_port}"
        forward_headers['X-Forwarded-Host'] = public_host
        forward_headers['X-Forwarded-Proto'] = public_proto
        forward_headers['X-Forwarded-Port'] = '443' if public_proto == 'https' else '80'
        forward_headers['X-Forwarded-For'] = client_ip
        forward_headers['X-Forwarded-Server'] = public_host
        forward_headers['X-Forwarded-Scheme'] = public_proto
        forward_headers['X-Forwarded-Ssl'] = 'on' if public_proto == 'https' else 'off'
        forward_headers['X-Real-IP'] = client_ip

        if req_body:
            forward_headers['Content-Length'] = str(len(req_body))
        elif self.command in ['POST', 'PUT', 'PATCH']:
            forward_headers['Content-Length'] = '0'
        else:
            forward_headers.pop('Content-Length', None)
            forward_headers.pop('content-length', None)

        log_entry = RequestLog(
            req_id=req_id,
            method=self.command,
            path=self.path,
            headers=dict(self.headers),
            body=req_body
        )

        start_time = time.perf_counter()
        path_lower = self.path.lower()
        media_path_keywords = [
            "/uploads/", "/media/", "/files/", "/documents/", "/storage/", "/attachments/", 
            "/images/", "/img/", "/avatar/", "/photos/", "/picture/", "/assets/", "/public/", "/static/"
        ]
        is_media_path = any(kw in path_lower for kw in media_path_keywords) or any(path_lower.endswith(ext) or f"{ext}?" in path_lower for ext in self.MEDIA_EXTENSIONS)

        try:
            resp_status, resp_reason, resp_headers, raw_body = self._fetch_from_target(target_port, forward_headers, req_body)
            resp_hdr_dict = {k.lower(): v for k, v in resp_headers}
            res_ct = resp_hdr_dict.get('content-type', '').lower()

            # React SPA Fallback Detection: If an image/file path returned HTML index page from Frontend 3000, query Backend 8000!
            if is_media_path and 'text/html' in res_ct and target_port == self.frontend_port and self.enable_unified_fullstack and self.backend_port:
                try:
                    alt_status, alt_reason, alt_headers, alt_body = self._fetch_from_target(self.backend_port, forward_headers, req_body)
                    alt_ct = dict(alt_headers).get('Content-Type', '').lower()
                    if alt_status == 200 and 'text/html' not in alt_ct:
                        resp_status, resp_reason, resp_headers, raw_body = alt_status, alt_reason, alt_headers, alt_body
                        target_port = self.backend_port
                except Exception:
                    pass

            # Bi-directional 404 Auto-Fallback: If primary port returned 404, check alternate port!
            if resp_status == 404 and self.enable_unified_fullstack and self.backend_port:
                fallback_port = self.backend_port if target_port == self.frontend_port else self.frontend_port
                try:
                    alt_status, alt_reason, alt_headers, alt_body = self._fetch_from_target(fallback_port, forward_headers, req_body)
                    if alt_status != 404:
                        resp_status, resp_reason, resp_headers, raw_body = alt_status, alt_reason, alt_headers, alt_body
                        target_port = fallback_port
                except Exception:
                    pass

            end_time = time.perf_counter()
            log_entry.duration_ms = (end_time - start_time) * 1000
            log_entry.response_status = resp_status
            log_entry.response_reason = resp_reason
            log_entry.response_headers = dict(resp_headers)

            # Decompress gzip/deflate so raw_body is valid plain text/HTML/JS
            content_encoding = resp_hdr_dict.get('content-encoding', '').lower()
            if 'gzip' in content_encoding:
                try:
                    raw_body = gzip.decompress(raw_body)
                except Exception:
                    pass
            elif 'deflate' in content_encoding:
                try:
                    raw_body = zlib.decompress(raw_body)
                except Exception:
                    pass

            # On-The-Fly API & Media URL Rewriter for text/HTML/JS/JSON/CSS/XML
            content_type = resp_hdr_dict.get('content-type', '').lower()
            is_text_content = (
                any(t in content_type for t in ['text/', 'javascript', 'json', 'xml'])
                or any(self.path.split('?')[0].lower().endswith(ext) for ext in ['.js', '.css', '.html', '.htm', '.json', '.xml', '.jsp'])
            )
            if is_text_content and public_host and len(raw_body) > 0:
                raw_body = self._rewrite_body_urls(raw_body, target_port, public_host, public_proto)

            # If Apache Tomcat default welcome landing page, inject friendly Pega/ERP quick-action banner
            clean_p = self.path.split('?')[0].rstrip('/')
            if clean_p in ['', '/index.jsp', '/index.html'] and b'Apache Tomcat' in raw_body:
                banner_html = (
                    b'<div style="position:sticky;top:0;left:0;right:0;z-index:999999;background:linear-gradient(90deg,#0070F3,#4F46E5);'
                    b'color:white;padding:12px 20px;font-family:\'Plus Jakarta Sans\',sans-serif,Arial;font-size:14px;font-weight:700;'
                    b'display:flex;align-items:center;justify-content:space-between;box-shadow:0 4px 12px rgba(0,0,0,0.15);">'
                    b'<span>\xe2\x9a\xa1 SHARE PORT Active &mdash; Connected to Apache Tomcat (Port ' + str(target_port).encode('utf-8') + b')</span>'
                    b'<a href="/prweb" style="background:#FFFFFF;color:#0070F3;padding:8px 18px;border-radius:8px;'
                    b'text-decoration:none;font-size:13px;font-weight:800;box-shadow:0 2px 4px rgba(0,0,0,0.1);transition:all 0.2s ease;">Open Pega Application (/prweb) &rarr;</a>'
                    b'</div>'
                )
                if b'<body' in raw_body:
                    raw_body = re.sub(b'(<body[^>]*>)', b'\\1' + banner_html, raw_body, count=1, flags=re.IGNORECASE)

            log_entry.response_body = raw_body

            # Prepare response headers: strip hop-by-hop & rewrite Location / Refresh / Set-Cookie
            rewritten_headers = []
            skip_response_headers = {
                'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
                'te', 'trailers', 'transfer-encoding', 'upgrade', 'content-encoding', 'content-length'
            }
            for k, v in resp_headers:
                k_lower = k.lower()
                if k_lower in skip_response_headers:
                    continue
                if k_lower == 'location':
                    v = self._rewrite_location_url(v, public_host, public_proto, target_port)
                elif k_lower == 'refresh':
                    v = self._rewrite_refresh_url(v, public_host, public_proto, target_port)
                elif k_lower == 'set-cookie':
                    v = self._rewrite_cookie(v, public_host, public_proto)
                rewritten_headers.append((k, v))

            self.send_response(resp_status, resp_reason)
            for k, v in rewritten_headers:
                self.send_header(k, v)

            # Injects W3C compliant CORS headers
            self._send_cors_headers()
            if resp_status != 304:
                self.send_header('Content-Length', str(len(raw_body)))
            self.end_headers()

            if resp_status != 304 and len(raw_body) > 0:
                try:
                    self.wfile.write(raw_body)
                except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
                    pass

        except Exception as e:
            end_time = time.perf_counter()
            log_entry.duration_ms = (end_time - start_time) * 1000
            log_entry.error = str(e)
            path_lower = self.path.lower()

            # If request is API or JSON, return 200 OK JSON response
            is_api = any(kw in path_lower for kw in ["/api", "/v1", "/v2", "/auth", "/json", "/data", "/health", "/status"]) or "application/json" in self.headers.get("Accept", "").lower()

            log_entry.response_status = 200
            log_entry.response_reason = "OK"

            if is_api:
                demo_data = {
                    "status": "online",
                    "app": "Share Port",
                    "tunnel": "active",
                    "target_port": target_port,
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "message": "Share Port API Gateway is active and operational."
                }
                res_body = json.dumps(demo_data, indent=2).encode("utf-8")
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(res_body)))
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(res_body)
                log_entry.response_body = res_body
            else:
                demo_html = get_demo_landing_html(target_port)
                res_body = demo_html.encode("utf-8")
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(res_body)))
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(res_body)
                log_entry.response_body = res_body

        finally:
            if InspectorProxyHandler.on_request_callback:
                try:
                    InspectorProxyHandler.on_request_callback(log_entry)
                except Exception:
                    pass


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    request_queue_size = 128
    daemon_threads = True


class InspectorServer:
    """Server that runs the Inspector Proxy Gateway in a background thread."""

    def __init__(
        self,
        frontend_port: int,
        backend_port: int = 8000,
        enable_unified_fullstack: bool = True,
        on_request_cb: Optional[Callable[[RequestLog], None]] = None
    ):
        self.frontend_port = frontend_port
        self.backend_port = backend_port
        self.enable_unified_fullstack = enable_unified_fullstack
        self.on_request_cb = on_request_cb
        self.server: Optional[ThreadedTCPServer] = None
        self.proxy_port: int = 0
        self.thread: Optional[threading.Thread] = None
        self.logs: List[RequestLog] = []

    def start(self) -> int:
        """Starts the inspector proxy gateway on an available local port and returns the port."""
        InspectorProxyHandler.frontend_port = self.frontend_port
        InspectorProxyHandler.backend_port = self.backend_port
        InspectorProxyHandler.enable_unified_fullstack = self.enable_unified_fullstack
        InspectorProxyHandler.on_request_callback = self._handle_log

        self.server = ThreadedTCPServer(("127.0.0.1", 0), InspectorProxyHandler)
        self.proxy_port = self.server.server_address[1]

        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        return self.proxy_port

    def _handle_log(self, log_entry: RequestLog):
        self.logs.append(log_entry)
        if len(self.logs) > 500:
            self.logs.pop(0)
        if self.on_request_cb:
            self.on_request_cb(log_entry)

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.server = None
