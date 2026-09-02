import os
import sys
import time
import json
import threading
import subprocess
import tempfile
import requests
from typing import Optional, Callable, Dict, Any

APP_VERSION = "1.0.0"


class AppUpdater:
    """Handles fault-tolerant background update checks and one-click executable self-updating."""

    def __init__(self, current_version: str = APP_VERSION, update_url: Optional[str] = None):
        self.current_version = current_version
        self.update_url = update_url or "https://raw.githubusercontent.com/lloop/lloop/main/version.json"
        self.is_checking = False
        self.is_updating = False

    @staticmethod
    def _parse_version(v_str: str) -> tuple:
        """Parses semver string like '1.0.1' into tuple (1, 0, 1) for reliable comparison."""
        try:
            clean = v_str.strip().lstrip('vV')
            return tuple(int(x) for x in clean.split('.'))
        except Exception:
            return (0, 0, 0)

    def check_for_updates_async(
        self,
        on_update_available: Callable[[Dict[str, Any]], None],
        timeout: float = 3.0
    ) -> None:
        """Silently checks remote URL for updates in a non-blocking background thread.
        Swallows all network/parsing errors silently to ensure ZERO interruption to main app logic.
        """
        def _worker():
            self.is_checking = True
            try:
                if not self.update_url or not self.update_url.startswith("http"):
                    return

                headers = {"User-Agent": f"LLOOP-Updater/{self.current_version}"}
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
        on_progress: Callable[[float], None],
        on_complete: Callable[[bool, str], None]
    ) -> None:
        """Downloads the new LLOOP.exe in background, creates self-overwriting batch script, and restarts."""
        def _worker():
            self.is_updating = True
            try:
                response = requests.get(download_url, stream=True, timeout=15)
                response.raise_for_status()

                total_size = int(response.headers.get("content-length", 0))
                downloaded = 0

                # Temporary file for new executable
                temp_dir = tempfile.gettempdir()
                new_exe_path = os.path.join(temp_dir, "LLOOP_new.exe")

                with open(new_exe_path, "wb") as f:
                    for chunk in response.iter_content(chunk_size=65536):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total_size > 0:
                                progress = downloaded / total_size
                                on_progress(progress)

                # Execute self-replacement script
                self._apply_self_replacement(new_exe_path)
                on_complete(True, "Update downloaded successfully. Restarting LLOOP...")
            except Exception as e:
                on_complete(False, f"Update failed: {e}")
            finally:
                self.is_updating = False

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()

    def _apply_self_replacement(self, new_exe_path: str) -> None:
        """Creates a batch script that waits for current process exit, overwrites executable, and restarts."""
        current_exe = sys.executable

        # Only apply batch overwrite if running as compiled PyInstaller frozen binary
        if getattr(sys, 'frozen', False):
            bat_script_path = os.path.join(tempfile.gettempdir(), "_update_lloop.bat")

            # Batch script content: wait 1.5s for app exit, copy new file over old, launch new app, delete batch script
            bat_content = f"""@echo off
timeout /t 2 /nobreak > NUL
copy /Y "{new_exe_path}" "{current_exe}" > NUL
del "{new_exe_path}" > NUL
start "" "{current_exe}"
del "%~f0" & exit
"""
            with open(bat_script_path, "w", encoding="utf-8") as f:
                f.write(bat_content)

            # Spawn batch script detached and exit current application
            subprocess.Popen(
                ["cmd.exe", "/c", bat_script_path],
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )
            time.sleep(0.2)
            sys.exit(0)
        else:
            print(f"[LLOOP Updater Script Mode] Downloaded update to: {new_exe_path}")
