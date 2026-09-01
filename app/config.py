import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

CONFIG_DIR = Path.home() / ".lloop"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULT_CONFIG: Dict[str, Any] = {
    "default_engine": "cloudflare",  # cloudflare, localhost_run, serveo, pinggy
    "default_port": 3000,
    "last_used_port": 3000,
    "last_used_subdomain": "",
    "subdomain_mode": "fixed",  # fixed, custom, random
    "auto_copy_url": True,
    "enable_inspector": True,
    "dark_mode": True,
    "enable_auto_update_check": True,
    "update_url": "https://loop-tunnel.vercel.app/version.json",
    "saved_profiles": [],
    "port_subdomain_map": {}
}


class ConfigManager:
    """Manages LLOOP persistent configuration and user preferences."""

    def __init__(self, config_file: Path = CONFIG_FILE):
        self.config_file = config_file
        self.config_dir = config_file.parent
        self._ensure_config_dir()
        self.data: Dict[str, Any] = self.load()

    def _ensure_config_dir(self) -> None:
        try:
            self.config_dir.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass

    def load(self) -> Dict[str, Any]:
        """Loads configuration from JSON file or returns defaults."""
        if not self.config_file.exists():
            self.save(DEFAULT_CONFIG)
            return DEFAULT_CONFIG.copy()

        try:
            with open(self.config_file, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                config = DEFAULT_CONFIG.copy()
                config.update(loaded)
                # Default to cloudflare (trycloudflare.com)
                if not config.get("default_engine") or config.get("default_engine") == "localhost_run":
                    config["default_engine"] = "cloudflare"
                return config
        except Exception as e:
            print(f"[Warning] Failed to load config: {e}. Using defaults.")
            return DEFAULT_CONFIG.copy()

    def save(self, data: Optional[Dict[str, Any]] = None) -> bool:
        """Saves current or provided data to JSON config file."""
        if data is not None:
            self.data = data

        try:
            with open(self.config_file, "w", encoding="utf-8") as f:
                json.dump(self.data, f, indent=2)
            return True
        except Exception as e:
            print(f"[Error] Failed to save config: {e}")
            return False

    def get(self, key: str, default: Any = None) -> Any:
        return self.data.get(key, default)

    def set(self, key: str, value: Any) -> None:
        self.data[key] = value
        self.save()

    def get_fixed_subdomain(self, port: int) -> str:
        """Retrieves fixed subdomain for a given port, if configured."""
        port_str = str(port)
        mapping = self.data.get("port_subdomain_map", {})
        return mapping.get(port_str, "")

    def set_fixed_subdomain(self, port: int, subdomain: str) -> None:
        """Saves fixed subdomain mapping for a specific port."""
        if "port_subdomain_map" not in self.data:
            self.data["port_subdomain_map"] = {}
        self.data["port_subdomain_map"][str(port)] = subdomain.strip()
        self.save()

    def add_profile(self, name: str, port: int, subdomain: str, mode: str = "fixed") -> None:
        profiles = self.data.get("saved_profiles", [])
        # Check if profile with same name or port already exists
        profiles = [p for p in profiles if p.get("name") != name]
        profiles.append({
            "name": name,
            "port": port,
            "subdomain": subdomain.strip(),
            "mode": mode
        })
        self.data["saved_profiles"] = profiles
        self.save()

    def delete_profile(self, name: str) -> None:
        profiles = self.data.get("saved_profiles", [])
        self.data["saved_profiles"] = [p for p in profiles if p.get("name") != name]
        self.save()
