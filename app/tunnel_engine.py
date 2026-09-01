import subprocess
import threading
import re
import time
import shutil
import os
import sys
import socket
from typing import Callable, Optional, Dict, Any
from app.inspector import InspectorServer, RequestLog


def check_port_active(port: int, host: str = "127.0.0.1", timeout: float = 1.0) -> bool:
    """Checks if a local port is currently active and accepting connections."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (OSError, ConnectionRefusedError):
        return False


def get_resource_path(relative_path: str) -> str:
    """Get absolute path to resource, works for dev and PyInstaller _MEIPASS bundle."""
    if hasattr(sys, '_MEIPASS'):
        p = os.path.join(sys._MEIPASS, relative_path)
        if os.path.exists(p):
            return p
    dev_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), relative_path)
    if os.path.exists(dev_path):
        return dev_path
    sub_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path.replace("app" + os.sep, ""))
    return sub_path


def get_ssh_binary_path() -> str:
    """Resolves absolute path to Windows OpenSSH executable for bundled PyInstaller binaries."""
    if sys.platform == "win32":
        system_root = os.environ.get("SystemRoot", r"C:\Windows")
        candidates = [
            os.path.join(system_root, "System32", "OpenSSH", "ssh.exe"),
            os.path.join(system_root, "System32", "ssh.exe"),
            os.path.join(system_root, "SysWOW64", "OpenSSH", "ssh.exe"),
        ]
        for path in candidates:
            if os.path.exists(path):
                return path

    return shutil.which("ssh") or "ssh"


class TunnelEngine:
    """Orchestrates reverse tunneling process with fixed subdomains and traffic inspector."""

    PROVIDERS = {
        "cloudflare": "Cloudflare Tunnel (Zero Warning)",
        "localhost_run": "Fast Direct Engine",
        "pinggy": "Secure Fallback Engine",
        "serveo": "Auto High-Speed Engine",
    }

    IGNORE_PATTERNS = [
        "console.serveo.net",
        "twitter.com",
        "github.com",
        "ssh.localhost.run",
        "admin.localhost.run",
        "localhost.run/docs",
        "dashboard.pinggy.io",
        "pinggy.io/docs",
        "pinggy-free.link"
    ]

    def __init__(
        self,
        local_port: int,
        subdomain: str = "",
        mode: str = "fixed",  # fixed, custom, random
        provider: str = "cloudflare",
        backend_port: int = 8000,
        enable_unified_fullstack: bool = True,
        enable_inspector: bool = True,
        on_status_change: Optional[Callable[[str, str, str], None]] = None,
        on_request_log: Optional[Callable[[RequestLog], None]] = None
    ):
        self.local_port = local_port
        self.subdomain = subdomain.strip().lower() if subdomain else ""
        self.mode = mode
        self.provider = provider if provider in self.PROVIDERS else "cloudflare"
        self.backend_port = backend_port
        self.enable_unified_fullstack = enable_unified_fullstack
        self.enable_inspector = enable_inspector
        self.on_status_change = on_status_change
        self.on_request_log = on_request_log

        self.process: Optional[subprocess.Popen] = None
        self.inspector_server: Optional[InspectorServer] = None
        self.effective_port: int = local_port
        self.public_url: str = ""
        self.status: str = "STOPPED"  # STOPPED, STARTING, CONNECTED, ERROR
        self.error_message: str = ""
        self._stop_requested: bool = False
        self._monitor_thread: Optional[threading.Thread] = None

    def start(self):
        """Starts the tunneling workflow in a background thread."""
        self._stop_requested = False
        self._set_status("STARTING", "", "")

        # 1. Verify SSH Binary exists
        ssh_bin = get_ssh_binary_path()
        if not shutil.which("ssh") and not os.path.exists(ssh_bin):
            self._set_status(
                "ERROR",
                error="OpenSSH client ('ssh.exe') was not found on this computer. Please enable OpenSSH Client in Windows Optional Features."
            )
            return

        # Ensure anonymous SSH Key exists for zero-config passwordless tunnels
        try:
            key_path = os.path.expanduser("~/.lloop/keys/id_ed25519")
            if not os.path.exists(key_path):
                os.makedirs(os.path.dirname(key_path), exist_ok=True)
                subprocess.run(["ssh-keygen", "-t", "ed25519", "-N", "", "-C", "anonymous@lloop", "-f", key_path], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass

        # 2. Check if local port is active
        if not check_port_active(self.local_port):
            print(f"[LLOOP Warning] Port {self.local_port} is not active on this machine yet. Proceeding with tunnel setup...")

        # 3. Start Inspector Proxy Gateway if enabled
        if self.enable_inspector:
            try:
                self.inspector_server = InspectorServer(
                    frontend_port=self.local_port,
                    backend_port=self.backend_port,
                    enable_unified_fullstack=self.enable_unified_fullstack,
                    on_request_cb=self.on_request_log
                )
                self.effective_port = self.inspector_server.start()
                print(f"[LLOOP Gateway] Listening on 127.0.0.1:{self.effective_port} -> Frontend:{self.local_port} & Backend:{self.backend_port}")
            except Exception as e:
                print(f"[LLOOP Warning] Failed to start Inspector Proxy: {e}. Tunneling directly.")
                self.effective_port = self.local_port
        else:
            self.effective_port = self.local_port

        # 4. Launch SSH Tunnel process in background
        self._monitor_thread = threading.Thread(target=self._run_tunnel_loop, daemon=True)
        self._monitor_thread.start()

    def _set_status(self, status: str, url: str = "", error: str = ""):
        self.status = status
        if url:
            self.public_url = url
        if error:
            self.error_message = error

        if self.on_status_change:
            try:
                self.on_status_change(self.status, self.public_url, self.error_message)
            except Exception as e:
                print(f"[LLOOP Callback Error] {e}")

    def _build_command(self, provider_name: str) -> list:
        """Constructs SSH command with BatchMode=yes & UserKnownHostsFile=NUL to prevent hanging on new machines."""
        ssh_bin = get_ssh_binary_path()
        null_hosts = "NUL" if sys.platform == "win32" else "/dev/null"

        common_opts = [
            "-T",
            "-o", "StrictHostKeyChecking=no",
            "-o", f"UserKnownHostsFile={null_hosts}",
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=8",
            "-o", "ServerAliveInterval=30",
            "-o", "ServerAliveCountMax=3",
            "-o", "LogLevel=ERROR",
            "-o", "ExitOnForwardFailure=yes",
        ]

        key_path = os.path.expanduser("~/.lloop/keys/id_ed25519")
        if os.path.exists(key_path):
            common_opts.extend(["-i", key_path])
        else:
            user_key = os.path.expanduser("~/.ssh/id_ed25519")
            if os.path.exists(user_key):
                common_opts.extend(["-i", user_key])

        if provider_name == "cloudflare":
            bin_path = get_resource_path(os.path.join("app", "bin", "cloudflared.exe"))
            if not os.path.exists(bin_path):
                bin_path = shutil.which("cloudflared") or "cloudflared"
            return [
                bin_path,
                "tunnel",
                "--url", f"http://127.0.0.1:{self.effective_port}"
            ]

        elif provider_name == "pinggy":
            return [
                ssh_bin,
                *common_opts,
                "-p", "443",
                "-R", f"0:127.0.0.1:{self.effective_port}",
                "a:X-Pinggy-No-Screen:true@a.pinggy.io"
            ]

        elif provider_name == "localhost_run":
            return [
                ssh_bin,
                *common_opts,
                "-R", f"80:127.0.0.1:{self.effective_port}",
                "nokey@localhost.run"
            ]

        elif provider_name == "serveo":
            if self.subdomain and self.mode in ["fixed", "custom"]:
                clean_sub = re.sub(r'[^a-z0-9\-]', '', self.subdomain.lower())
                remote_arg = f"{clean_sub}:80:127.0.0.1:{self.effective_port}"
            else:
                remote_arg = f"0:80:127.0.0.1:{self.effective_port}"

            return [
                ssh_bin,
                *common_opts,
                "-o", "ServerAliveCountMax=3",
                "-R", remote_arg,
                "serveo.net"
            ]

        else:
            raise ValueError(f"Unknown provider: {provider_name}")

    def _is_valid_tunnel_url(self, url: str) -> bool:
        """Checks if a matched URL is a real public tunnel endpoint."""
        url_lower = url.lower()
        for ignored in self.IGNORE_PATTERNS:
            if ignored in url_lower:
                return False
        valid_suffixes = [
            ".pinggy-free.link",
            ".free.pinggy.net",
            ".pinggy.link",
            ".pinggy.online",
            ".lhr.life",
            ".lhrtunnel.link",
            ".serveo.net",
            ".trycloudflare.com",
            ".loca.lt"
        ]
        return any(url_lower.endswith(suf) or f"{suf}/" in url_lower for suf in valid_suffixes)

    def _run_tunnel_loop(self):
        """Monitors SSH tunnel stdout/stderr and extracts public HTTPS URL with 8s timeout fallback."""
        providers_to_try = [self.provider]
        if "cloudflare" not in providers_to_try:
            providers_to_try.append("cloudflare")
        if "localhost_run" not in providers_to_try:
            providers_to_try.append("localhost_run")
        if "serveo" not in providers_to_try:
            providers_to_try.append("serveo")

        creationflags = 0
        if sys.platform == "win32":
            creationflags = subprocess.CREATE_NO_WINDOW

        url_pattern = re.compile(r'https?://[a-zA-Z0-9\-\.\:]+')

        for current_provider in providers_to_try:
            if self._stop_requested:
                break

            cmd = self._build_command(current_provider)
            print(f"[LLOOP Exec] {' '.join(cmd)}")

            try:
                self.process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.PIPE,
                    text=True,
                    bufsize=1,
                    creationflags=creationflags
                )

                found_url = False
                start_time = time.time()

                # Read output lines until URL found or 8 second timeout reached
                while not self._stop_requested and self.process and self.process.poll() is None:
                    # Timeout check: If no URL within 8 seconds, try next provider!
                    if time.time() - start_time > 8 and not found_url:
                        print(f"[LLOOP Timeout] {current_provider} took >8s. Switching provider...")
                        break

                    line = self.process.stdout.readline()
                    if not line:
                        time.sleep(0.1)
                        continue

                    line_str = line.strip()
                    print(f"[Tunnel Output] {line_str}")

                    # Scan line for public HTTPS URL
                    matches = url_pattern.findall(line_str)
                    for raw_url in matches:
                        clean_url = raw_url.rstrip('.,;)')
                        if self._is_valid_tunnel_url(clean_url) and not found_url:
                            self.public_url = clean_url
                            found_url = True
                            self._set_status("CONNECTED", url=self.public_url)
                            break

                    if found_url:
                        break

                # If URL found, stay connected and keep monitoring stdout
                if found_url:
                    while not self._stop_requested and self.process and self.process.poll() is None:
                        line = self.process.stdout.readline()
                        if line:
                            print(f"[Tunnel Stream] {line.strip()}")
                        else:
                            time.sleep(0.2)
                    break  # Exit provider loop once finished

                # Clean up process before trying next provider
                if self.process:
                    try:
                        self.process.terminate()
                    except Exception:
                        pass
                    self.process = None

            except FileNotFoundError:
                self._set_status("ERROR", error="'ssh.exe' command not found on this system PATH. Please ensure OpenSSH Client is enabled in Windows Features.")
                return
            except Exception as e:
                print(f"[LLOOP Provider Error] {current_provider} failed: {e}")

        if not self._stop_requested and not self.public_url and self.status != "CONNECTED":
            self._set_status("ERROR", error=f"Could not establish tunnel for port {self.local_port}. Ensure your local app server is running on port {self.local_port}.")

    def stop(self):
        """Stops the tunnel process and inspector proxy."""
        self._stop_requested = True
        self._set_status("STOPPED", "", "")

        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None

        if self.inspector_server:
            try:
                self.inspector_server.stop()
            except Exception:
                pass
            self.inspector_server = None
