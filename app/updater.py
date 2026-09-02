import os
import sys
import time
import json
import hashlib
import threading
import subprocess
import tempfile
import requests
from typing import Optional, Callable, Dict, Any

APP_VERSION = "1.0.10"


class AppUpdater:
    """Handles fault-tolerant background update checks and one-click executable self-updating for LLOOP PORT."""

    def __init__(self, current_version: str = APP_VERSION, update_url: Optional[str] = None):
        self.current_version = current_version
        self.update_url = update_url or "https://lloop-tunnel.vercel.app/version.json"
        self.is_checking = False
        self.is_updating = False
        self.pending_update_path = None

    @staticmethod
    def _parse_version(v_str: str) -> tuple:
        """Parses semver string like '1.0.1' into tuple (1, 0, 1) for reliable comparison."""
        try:
            clean = str(v_str).strip().lstrip('vV')
            return tuple(int(x) for x in clean.split('.'))
        except Exception:
            return (0, 0, 0)

    def check_for_updates_async(
        self,
        on_update_available: Callable[[Dict[str, Any]], None],
        timeout: float = 3.0
    ) -> None:
        """Silently checks remote URL for updates in a non-blocking background thread.
        Swallows all network/parsing errors silently to ensure ZERO interruption to main app logic or tunneling.
        """
        def _worker():
            self.is_checking = True
            try:
                if not self.update_url or not self.update_url.startswith("http"):
                    return

                headers = {"User-Agent": f"LLOOP-PORT-Updater/{self.current_version}"}
                response = requests.get(self.update_url, headers=headers, timeout=timeout)
                if response.status_code == 200:
                    data = response.json()
                    remote_ver = data.get("version", "")
                    download_url = data.get("download_url", "")

                    if remote_ver and download_url:
                        if self._parse_version(remote_ver) > self._parse_version(self.current_version):
                            # Trigger callback on UI thread
                            on_update_available(data)
            except Exception:
                # Intentionally silent on error - zero popups or logs
                pass
            finally:
                self.is_checking = False

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()

    def download_and_install_async(
        self,
        download_url: str,
        on_progress: Callable[[float, float, float], None],
        on_complete: Callable[[bool, str], None],
        expected_sha256: Optional[str] = None
    ) -> None:
        """Downloads the new executable in background with live progress, verifies size integrity, and applies atomic replacement."""
        def _worker():
            self.is_updating = True
            try:
                headers = {"User-Agent": "LLOOP-PORT-Updater/1.0"}
                response = requests.get(download_url, headers=headers, stream=True, timeout=60, allow_redirects=True)
                response.raise_for_status()

                # Get content-length or fallback to estimated 54.5 MB for chunked CDNs
                header_len = response.headers.get("content-length")
                total_bytes = int(header_len) if (header_len and header_len.isdigit() and int(header_len) > 0) else 54500000
                downloaded_bytes = 0

                temp_dir = tempfile.gettempdir()
                new_exe_path = os.path.join(temp_dir, "LLOOP_PORT_update_new.exe")

                digest = hashlib.sha256()
                with open(new_exe_path, "wb") as f:
                    for chunk in response.iter_content(chunk_size=131072):  # 128 KB chunks
                        if chunk:
                            f.write(chunk)
                            digest.update(chunk)
                            downloaded_bytes += len(chunk)

                            pct = min(0.99, downloaded_bytes / max(total_bytes, downloaded_bytes))
                            dl_mb = downloaded_bytes / (1024 * 1024)
                            tot_mb = max(total_bytes, downloaded_bytes) / (1024 * 1024)
                            on_progress(pct, dl_mb, tot_mb)

                # Set 100% progress state upon completion
                dl_final_mb = downloaded_bytes / (1024 * 1024)
                on_progress(1.0, dl_final_mb, dl_final_mb)

                # Final integrity validation: file must be at least 10 MB
                final_size = os.path.getsize(new_exe_path)
                if final_size < 10 * 1024 * 1024:
                    if os.path.exists(new_exe_path):
                        os.remove(new_exe_path)
                    raise ValueError(f"Downloaded file incomplete ({final_size} bytes).")

                if expected_sha256 and digest.hexdigest().lower() != expected_sha256.lower():
                    if os.path.exists(new_exe_path):
                        os.remove(new_exe_path)
                    raise ValueError("Checksum verification failed.")

                # Store downloaded update binary path for user-triggered restart
                self.pending_update_path = new_exe_path
                on_complete(True, "🎉 Update Ready! Click 'Restart & Apply' below.")
            except Exception as e:
                on_complete(False, "Download failed. Please try again.")
            finally:
                self.is_updating = False

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()

    def apply_pending_update(self) -> None:
        """Applies pending downloaded update binary and restarts application."""
        if self.pending_update_path and os.path.exists(self.pending_update_path):
            self._apply_self_replacement(self.pending_update_path)

    def _apply_self_replacement(self, new_exe_path: str) -> None:
        """Creates a batch script that waits for parent process exit cleanly, overwrites executable, and restarts."""
        current_exe = sys.executable

        # Only apply batch overwrite if running as compiled PyInstaller frozen binary
        if getattr(sys, 'frozen', False):
            bat_script_path = os.path.join(tempfile.gettempdir(), "_update_lloop_port.bat")

            # Clean batch script: wait 3s for parent process exit, copy new executable over old, launch app, delete batch
            bat_content = f"""@echo off
timeout /t 3 /nobreak > NUL
:retry_copy
copy /Y "{new_exe_path}" "{current_exe}" > NUL 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak > NUL
    goto retry_copy
)
del "{new_exe_path}" > NUL 2>&1
start "" "{current_exe}"
(goto) 2>nul & del "%~f0" & exit
"""
            with open(bat_script_path, "w", encoding="utf-8") as f:
                f.write(bat_content)

            # Spawn batch script detached and exit current process cleanly
            subprocess.Popen(
                ["cmd.exe", "/c", bat_script_path],
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )
            time.sleep(1.0)
            os._exit(0)
        else:
            print(f"[LLOOP PORT Updater Dev Mode] Downloaded update to: {new_exe_path}")
