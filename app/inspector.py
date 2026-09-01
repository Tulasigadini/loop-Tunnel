import http.server
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

    def _determine_target_port(self) -> int:
        """Determines whether to route request to Frontend (3000) or Backend (8000)."""
        if not self.enable_unified_fullstack or not self.backend_port:
            return self.frontend_port

        path_lower = self.path.lower()

        # Frontend Dev Server HMR WebSockets & JS bundles
        if "hmr" in path_lower or "webpack" in path_lower or "vite" in path_lower or "bundle.js" in path_lower:
            return self.frontend_port

        # WebSocket / Connection Upgrade headers
        upgrade_hdr = self.headers.get("Upgrade", "").lower()
        conn_hdr = self.headers.get("Connection", "").lower()
        if "websocket" in upgrade_hdr or "upgrade" in conn_hdr:
            return self.backend_port

        # ALL POST, PUT, DELETE, PATCH requests are ALWAYS Backend API requests!
        if self.command in ['POST', 'PUT', 'DELETE', 'PATCH']:
            return self.backend_port

        # Explicit Backend Media / Storage Path prefixes
        backend_media_prefixes = [
            "/api/", "/uploads/", "/media/", "/files/", "/documents/", "/storage/", "/attachments/", "/public/uploads/", "/static/uploads/"
        ]
        if any(p in path_lower for p in backend_media_prefixes):
            return self.backend_port

        # Match against known API & Feed path keywords
        for kw in self.API_KEYWORDS:
            if kw in path_lower:
                return self.backend_port

        # Match JSON requests or API headers
        content_type = self.headers.get("Content-Type", "")
        accept_type = self.headers.get("Accept", "")

        if "application/json" in content_type or "application/json" in accept_type:
            if not any(path_lower.endswith(ext) for ext in [".js", ".css", ".png", ".jpg", ".svg", ".ico", ".html"]):
                return self.backend_port

        return self.frontend_port

    def _proxy_websocket(self, target_port: int):
        """Pipes real-time bi-directional WebSocket frames between client and local server."""
        try:
            target_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            target_sock.connect((self.target_host, target_port))
        except Exception as e:
            self.send_error(502, f"WebSocket Connection Error to port {target_port}: {e}")
            return

        req_line = f"{self.command} {self.path} {self.request_version}\r\n"
        target_sock.sendall(req_line.encode("latin1"))

        skip_headers = {'host'}
        for k, v in self.headers.items():
            if k.lower() not in skip_headers:
                target_sock.sendall(f"{k}: {v}\r\n".encode("latin1"))
        target_sock.sendall(f"Host: {self.target_host}:{target_port}\r\n\r\n".encode("latin1"))

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
        """Executes HTTP request to specific target port and returns response tuple."""
        target_url = f"http://{self.target_host}:{target_port}{self.path}"
        req_headers = forward_headers.copy()
        req_headers['Host'] = f"{self.target_host}:{target_port}"

        req = urllib.request.Request(
            url=target_url,
            data=req_body if self.command in ['POST', 'PUT', 'PATCH'] else None,
            headers=req_headers,
            method=self.command
        )
        try:
            return urllib.request.urlopen(req, timeout=15)
        except urllib.error.HTTPError as e:
            return e

    def _proxy_request(self):
        with InspectorProxyHandler.lock:
            InspectorProxyHandler.request_counter += 1
            req_id = InspectorProxyHandler.request_counter

        # Handle CORS Preflight OPTIONS requests immediately
        if self.command == 'OPTIONS':
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
            self.send_header('Access-Control-Allow-Headers', '*')
            self.send_header('Access-Control-Allow-Credentials', 'true')
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
        req_body = self.rfile.read(content_length) if content_length > 0 else b""

        skip_headers = {
            'host', 'connection', 'keep-alive', 'proxy-authenticate',
            'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade'
        }
        forward_headers = {k: v for k, v in self.headers.items() if k.lower() not in skip_headers}

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
            resp = self._fetch_from_target(target_port, forward_headers, req_body)
            resp_status = getattr(resp, 'status', getattr(resp, 'code', 200))
            res_ct = resp.headers.get('Content-Type', '').lower()

            # React SPA Fallback Detection: If an image/file path returned HTML index page from Frontend 3000, query Backend 8000!
            if is_media_path and 'text/html' in res_ct and target_port == self.frontend_port and self.enable_unified_fullstack and self.backend_port:
                try:
                    alt_resp = self._fetch_from_target(self.backend_port, forward_headers, req_body)
                    alt_status = getattr(alt_resp, 'status', getattr(alt_resp, 'code', 404))
                    alt_ct = alt_resp.headers.get('Content-Type', '').lower()
                    if alt_status == 200 and 'text/html' not in alt_ct:
                        resp = alt_resp
                        resp_status = alt_status
                        target_port = self.backend_port
                except Exception:
                    pass

            # Bi-directional 404 Auto-Fallback: If primary port returned 404, check alternate port!
            if resp_status == 404 and self.enable_unified_fullstack and self.backend_port:
                fallback_port = self.backend_port if target_port == self.frontend_port else self.frontend_port
                try:
                    alt_resp = self._fetch_from_target(fallback_port, forward_headers, req_body)
                    alt_status = getattr(alt_resp, 'status', getattr(alt_resp, 'code', 404))
                    if alt_status != 404:
                        resp = alt_resp
                        resp_status = alt_status
                        target_port = fallback_port
                except Exception:
                    pass

            with resp:
                end_time = time.perf_counter()
                log_entry.duration_ms = (end_time - start_time) * 1000
                log_entry.response_status = resp_status
                log_entry.response_reason = getattr(resp, 'reason', '')
                log_entry.response_headers = dict(resp.headers)
                
                try:
                    raw_body = resp.read()
                except Exception:
                    raw_body = b""

                # Decompress gzip/deflate so raw_body is valid plain text/HTML/JS
                content_encoding = resp.headers.get('Content-Encoding', '').lower()
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

                # On-The-Fly API & Media URL Rewriter for text/HTML/JS/JSON
                content_type = resp.headers.get('Content-Type', '').lower()
                if resp_status == 200 and (any(t in content_type for t in ['text/html', 'javascript', 'json', 'text/plain']) or self.path.endswith('.js')):
                    try:
                        be_port_str = str(self.backend_port).encode('utf-8')
                        if be_port_str in raw_body:
                            public_host = self.headers.get('Host', '')
                            if public_host:
                                repl_https = f"https://{public_host}".encode('utf-8')
                                repl_wss = f"wss://{public_host}".encode('utf-8')

                                raw_body = raw_body.replace(rb'http://localhost:' + be_port_str, repl_https)
                                raw_body = raw_body.replace(rb'http://127.0.0.1:' + be_port_str, repl_https)
                                raw_body = raw_body.replace(rb'ws://localhost:' + be_port_str, repl_wss)
                                raw_body = raw_body.replace(rb'ws://127.0.0.1:' + be_port_str, repl_wss)

                                escaped_host = public_host.replace(".", "\\.").encode('utf-8')
                                raw_body = raw_body.replace(rb'http:\\/\\/localhost:' + be_port_str, f"https:\\/\\/{public_host}".encode('utf-8'))
                                raw_body = raw_body.replace(rb'http:\\/\\/127.0.0.1:' + be_port_str, f"https:\\/\\/{public_host}".encode('utf-8'))
                                raw_body = raw_body.replace(rb'ws:\\/\\/localhost:' + be_port_str, f"wss:\\/\\/{public_host}".encode('utf-8'))
                                raw_body = raw_body.replace(rb'ws:\\/\\/127.0.0.1:' + be_port_str, f"wss:\\/\\/{public_host}".encode('utf-8'))
                    except Exception as ex:
                        print(f"[LLOOP Rewriter Exception] {ex}")

                log_entry.response_body = raw_body

                self.send_response(resp_status)
                for k, v in resp.headers.items():
                    if k.lower() not in skip_headers and k.lower() not in ['content-length', 'content-encoding']:
                        self.send_header(k, v)
                
                # Injects CORS & Binary Media headers
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Credentials', 'true')
                if resp_status != 304:
                    self.send_header('Content-Length', str(len(raw_body)))
                self.end_headers()

                if resp_status != 304 and len(raw_body) > 0:
                    try:
                        self.wfile.write(raw_body)
                    except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
                        pass

        except urllib.error.HTTPError as e:
            end_time = time.perf_counter()
            log_entry.duration_ms = (end_time - start_time) * 1000
            log_entry.response_status = e.code
            log_entry.response_reason = str(e.reason)
            log_entry.response_headers = dict(e.headers)
            log_entry.response_body = e.read()

            self.send_response(e.code)
            for k, v in e.headers.items():
                if k.lower() not in skip_headers and k.lower() != 'content-encoding':
                    self.send_header(k, v)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Credentials', 'true')
            self.end_headers()
            self.wfile.write(log_entry.response_body)

        except Exception as e:
            end_time = time.perf_counter()
            log_entry.duration_ms = (end_time - start_time) * 1000
            log_entry.response_status = 502
            log_entry.response_reason = "Bad Gateway"
            log_entry.error = str(e)
            error_msg = f"LLOOP Gateway Error: Failed to reach target on port {target_port}. ({e})".encode('utf-8')
            log_entry.response_body = error_msg

            self.send_response(502)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(error_msg)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Credentials', 'true')
            self.end_headers()
            self.wfile.write(error_msg)

        finally:
            if InspectorProxyHandler.on_request_callback:
                try:
                    InspectorProxyHandler.on_request_callback(log_entry)
                except Exception:
                    pass


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True


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
