import requests
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

POLICY_URL = "https://lloop-tunnel.vercel.app/access_control.json"

class AccessStatus:
    def __init__(
        self,
        is_restricted: bool = False,
        title: str = "",
        message: str = "",
        action_type: str = "ok",
        action_button_text: str = "OK",
        action_url: str = ""
    ):
        self.is_restricted = is_restricted
        self.title = title
        self.message = message
        self.action_type = action_type.lower().strip()
        self.action_button_text = action_button_text
        self.action_url = action_url

class AccessControlManager:
    """Manages remote GUI access policy, mandatory update locks, and custom notices."""

    @staticmethod
    def _parse_version(v_str: str):
        parts = []
        for p in v_str.replace("v", "").split("."):
            try:
                parts.append(int(p))
            except ValueError:
                parts.append(0)
        return tuple(parts)

    @classmethod
    def _build_status(cls, data: Dict[str, Any], current_version: str) -> AccessStatus:
        restricted = bool(data.get("restricted", False))
        min_version = str(data.get("min_supported_version", ""))
        title = str(data.get("title", "🔒 Access Restricted"))
        message = str(data.get("message", "Access to LLOOP PORT is currently restricted."))
        action_type = str(data.get("action_type", "ok"))
        action_btn = str(data.get("action_button_text", "OK, Continue"))
        action_url = str(data.get("action_url", ""))

        if min_version:
            cur_v = cls._parse_version(current_version)
            min_v = cls._parse_version(min_version)
            if cur_v < min_v:
                restricted = True
                if not data.get("title"):
                    title = "🔒 Update Required"
                if not data.get("message"):
                    message = f"Version {min_version} or higher is required. Please update to restore full access."
                if not data.get("action_type"):
                    action_type = "update"
                    action_btn = "📥 Update App Now"

        return AccessStatus(
            is_restricted=restricted,
            title=title,
            message=message,
            action_type=action_type,
            action_button_text=action_btn,
            action_url=action_url
        )

    @classmethod
    def check_access(cls, current_version: str) -> AccessStatus:
        """Fetches remote policy and checks if current version/access is restricted."""
        import json
        from pathlib import Path

        # 1. Check local public/access_control.json first (for instant local testing)
        local_path = Path(__file__).resolve().parent.parent / "public" / "access_control.json"
        if local_path.exists():
            try:
                with open(local_path, "r", encoding="utf-8") as f:
                    local_data = json.load(f)
                    if local_data.get("restricted"):
                        return cls._build_status(local_data, current_version)
            except Exception as e:
                logger.warning(f"Failed to read local access policy: {e}")

        # 2. Check remote Vercel policy
        try:
            resp = requests.get(POLICY_URL, timeout=4)
            if resp.status_code == 200:
                data: Dict[str, Any] = resp.json()
                return cls._build_status(data, current_version)
        except Exception as e:
            logger.warning(f"Failed to fetch access policy: {e}")

        # Default fallback: Access granted
        return AccessStatus(is_restricted=False)
