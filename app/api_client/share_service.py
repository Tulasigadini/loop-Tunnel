"""
Zero-Server Collection Sharing Service for Share Port.
Generates instant external public links for collections without requiring any custom backend server.
Completely serverless: uses anonymous instant public JSON endpoints and client-side compression.
(No Git/GitHub account required).
"""

import json
import zlib
import base64
import requests
from typing import Dict, Any, Optional, Tuple


class ShareService:
    """Handles publishing and importing collections from zero-server public sources."""

    @staticmethod
    def share_online(
        collection_json: Dict[str, Any],
        title: str = "Share Port API Collection"
    ) -> Tuple[bool, str]:
        """
        Publishes collection to a high-speed, instant public JSON endpoint.
        Returns a direct JSON URL that can be imported directly into:
        - Any standard API Client (Import > Paste Link)
        - Share Port (API Client > Import > Paste Link)
        - Web Browser / Curl
        No account or server required.
        """
        payload_str = json.dumps(collection_json, indent=2)

        # Primary: bytebin.lucko.me (Super-fast, CORS-enabled, reliable raw JSON store)
        try:
            resp = requests.post(
                "https://bytebin.lucko.me/post",
                data=payload_str.encode('utf-8'),
                headers={"Content-Type": "application/json", "User-Agent": "SharePort-Desktop-Client"},
                timeout=5
            )
            if resp.status_code in [200, 201]:
                res_data = resp.json()
                key = res_data.get("key")
                if key:
                    return True, f"https://bytebin.lucko.me/{key}"
        except Exception:
            pass

        # Fallback 1: paste.c-net.org
        try:
            resp = requests.post(
                "https://paste.c-net.org/",
                data=payload_str.encode('utf-8'),
                headers={"User-Agent": "SharePort-Desktop-Client"},
                timeout=5
            )
            if resp.status_code == 200:
                raw_url = resp.text.strip()
                if raw_url.startswith("http"):
                    return True, raw_url
        except Exception:
            pass

        # Fallback 2: Client-side compressed self-contained URL
        compressed_url = ShareService.generate_compressed_link(collection_json)
        return True, compressed_url

    @staticmethod
    def generate_compressed_link(
        collection_json: Dict[str, Any],
        base_landing_url: str = "https://www.shareport.in/client"
    ) -> str:
        """
        Generates a 100% serverless, self-contained compressed URL.
        The entire collection is zlib compressed + base64url encoded in the URL hash.
        """
        compact_str = json.dumps(collection_json, separators=(',', ':'))
        compressed = zlib.compress(compact_str.encode('utf-8'), level=9)
        b64_str = base64.urlsafe_b64encode(compressed).decode('utf-8').rstrip('=')
        return f"{base_landing_url}#data={b64_str}"

    @classmethod
    def decode_compressed_link(cls, url_or_fragment: str) -> Optional[Dict[str, Any]]:
        """Decompresses and reconstructs collection from a self-contained compressed link."""
        try:
            if "#data=" in url_or_fragment:
                encoded = url_or_fragment.split("#data=")[1].split("&")[0]
            else:
                encoded = url_or_fragment.strip()

            missing_padding = len(encoded) % 4
            if missing_padding:
                encoded += '=' * (4 - missing_padding)

            compressed = base64.urlsafe_b64decode(encoded)
            decompressed = zlib.decompress(compressed).decode('utf-8')
            return json.loads(decompressed)
        except Exception as e:
            print(f"[ShareService] Failed to decode link: {e}")
            return None

    @classmethod
    def fetch_collection_from_url(cls, link_url: str) -> Tuple[bool, Optional[Dict[str, Any]], str]:
        """
        Fetches collection data from any external source:
        - Direct Raw JSON URL (e.g. bytebin, paste.c-net.org, raw.githubusercontent)
        - Share Port Web Client link with ?url= or #data=
        - Standard Collection public links
        - FastAPI /docs or /openapi.json
        """
        import urllib.parse
        url = link_url.strip()
        if not url:
            return False, None, "URL is empty."

        # Case 1: Compressed self-contained link
        if "#data=" in url:
            data = cls.decode_compressed_link(url)
            if data:
                return True, data, "Successfully unpacked collection from link."
            return False, None, "Failed to decode collection payload from link fragment."

        # Case 2: Web client link with query param ?url= or #url=
        if "url=" in url:
            parsed = urllib.parse.urlparse(url)
            query_params = urllib.parse.parse_qs(parsed.query)
            if "url" in query_params:
                url = query_params["url"][0]
            elif "#url=" in url:
                url = urllib.parse.unquote(url.split("#url=")[1].split("&")[0])

        # Case 3: dpaste URL without .json
        if "dpaste.org" in url and not url.endswith(".json") and not url.endswith("/raw"):
            url = f"{url.rstrip('/')}.json"

        # Case 4: FastAPI / Swagger UI /docs URL -> auto-probe /openapi.json
        if url.endswith("/docs") or url.endswith("/docs/"):
            openapi_candidate = url.rstrip("/").replace("/docs", "/openapi.json")
            try:
                r = requests.get(openapi_candidate, timeout=4)
                if r.status_code == 200:
                    return True, r.json(), "Successfully detected & imported OpenAPI endpoints from FastAPI docs!"
            except Exception:
                pass

        # Direct HTTP Fetch
        try:
            headers = {
                "User-Agent": "SharePort-Desktop-Client",
                "Accept": "application/json, text/plain, */*"
            }
            resp = requests.get(url, headers=headers, timeout=8)
            if resp.status_code != 200:
                return False, None, f"Failed to fetch collection (HTTP {resp.status_code})"

            try:
                parsed_json = resp.json()
            except Exception:
                parsed_json = json.loads(resp.text)

            # If wrapped in {"collection": {...}} (standard export format)
            if isinstance(parsed_json, dict) and "collection" in parsed_json and isinstance(parsed_json["collection"], dict):
                parsed_json = parsed_json["collection"]

            return True, parsed_json, "Successfully fetched collection."

        except requests.exceptions.Timeout:
            return False, None, "Connection timed out while fetching link."
        except Exception as e:
            return False, None, f"Network error: {str(e)}"
