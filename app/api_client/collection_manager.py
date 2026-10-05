"""
Collection Manager for Share Port API Client.
Fully compatible with standard Collection Schema v2.1.
Stores data locally in ~/.shareport/collections.json without requiring any external server.
"""

import json
import uuid
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Union
from urllib.parse import urlparse

COLLECTIONS_FILE = Path.home() / ".shareport" / "collections.json"


def generate_uuid() -> str:
    return str(uuid.uuid4())


def generate_copy_name(original_name: str, existing_names: List[str]) -> str:
    """
    Generates a duplicate name using the '(copy)' convention in brackets.
    If 'My Collection' is duplicated -> 'My Collection (copy)'
    If 'My Collection (copy)' is duplicated -> 'My Collection (copy 2)'
    If 'My Collection (copy 2)' is duplicated -> 'My Collection (copy 3)'
    """
    match = re.search(r"^(.*?)\s*\((copy(?:\s+(\d+))?)\)$", original_name, flags=re.IGNORECASE)
    if match:
        base_name = match.group(1).strip()
    else:
        base_name = original_name.strip()

    first_candidate = f"{base_name} (copy)"
    existing_lower = {n.strip().lower() for n in existing_names if n}

    if first_candidate.lower() not in existing_lower:
        return first_candidate

    idx = 2
    while f"{base_name} (copy {idx})".lower() in existing_lower:
        idx += 1
    return f"{base_name} (copy {idx})"


def get_default_starter_collection() -> Dict[str, Any]:
    """Provides an initial collection for testing local servers and tunnels immediately."""
    col_id = generate_uuid()
    return {
        "id": col_id,
        "name": "🚀 Share Port Localhost Starter",
        "description": "Pre-configured requests for testing local dev servers and public tunnels.",
        "variables": {
            "baseUrl": "http://localhost:3000"
        },
        "items": [
            {
                "id": generate_uuid(),
                "name": "GET Local Server Root",
                "request": {
                    "method": "GET",
                    "url": "{{baseUrl}}/",
                    "headers": [
                        {"key": "Accept", "value": "application/json, text/html, */*", "enabled": True}
                    ],
                    "params": [],
                    "body_type": "none",
                    "body_content": "",
                    "auth_type": "none",
                    "auth_data": {},
                    "tests": [
                        {"type": "status_code", "value": "200", "name": "Status code is 200", "enabled": True},
                        {"type": "response_time", "value": "500", "name": "Response time < 500 ms", "enabled": True}
                    ]
                }
            },
            {
                "id": generate_uuid(),
                "name": "GET Health Check",
                "request": {
                    "method": "GET",
                    "url": "{{baseUrl}}/health",
                    "headers": [
                        {"key": "Accept", "value": "application/json", "enabled": True}
                    ],
                    "params": [
                        {"key": "check_db", "value": "true", "description": "Verify DB connection", "enabled": True}
                    ],
                    "body_type": "none",
                    "body_content": "",
                    "auth_type": "none",
                    "auth_data": {},
                    "tests": [
                        {"type": "status_code", "value": "200", "name": "Status code is 200", "enabled": True},
                        {"type": "response_time", "value": "500", "name": "Response time < 500 ms", "enabled": True},
                        {"type": "body_is_json", "value": "", "name": "Body is valid JSON", "enabled": True}
                    ]
                }
            },
            {
                "id": generate_uuid(),
                "name": "POST Sample JSON Echo",
                "request": {
                    "method": "POST",
                    "url": "{{baseUrl}}/api/echo",
                    "headers": [
                        {"key": "Content-Type", "value": "application/json", "enabled": True},
                        {"key": "Accept", "value": "application/json", "enabled": True}
                    ],
                    "params": [],
                    "body_type": "json",
                    "body_content": json.dumps({
                        "message": "Hello from Share Port API Client!",
                        "status": "testing",
                        "sender": "SharePort Desktop"
                    }, indent=2),
                    "auth_type": "none",
                    "auth_data": {},
                    "tests": [
                        {"type": "status_code", "value": "200", "name": "Status code is 200", "enabled": True},
                        {"type": "response_time", "value": "500", "name": "Response time < 500 ms", "enabled": True},
                        {"type": "body_is_json", "value": "", "name": "Body is valid JSON", "enabled": True},
                        {"type": "json_value", "target": "status", "value": "testing", "name": "JSON 'status' == 'testing'", "enabled": True}
                    ]
                }
            },
            {
                "id": generate_uuid(),
                "name": "GET Active Tunnel Test",
                "request": {
                    "method": "GET",
                    "url": "{{baseUrl}}/",
                    "headers": [
                        {"key": "User-Agent", "value": "SharePort-API-Client/1.0", "enabled": True}
                    ],
                    "params": [],
                    "body_type": "none",
                    "body_content": "",
                    "auth_type": "none",
                    "auth_data": {},
                    "tests": [
                        {"type": "status_code", "value": "200", "name": "Status code is 200", "enabled": True},
                        {"type": "response_time", "value": "1000", "name": "Response time < 1000 ms", "enabled": True}
                    ]
                }
            }
        ]
    }


class CollectionManager:
    """Manages persistent collections on the local filesystem."""

    def __init__(self, filepath: Union[Path, str] = COLLECTIONS_FILE):
        self.filepath = Path(filepath)
        self.filepath.parent.mkdir(parents=True, exist_ok=True)
        self.collections: List[Dict[str, Any]] = self.load()

    def load(self) -> List[Dict[str, Any]]:
        """Loads collections from disk or creates default starter collection."""
        if not self.filepath.exists():
            default_cols = [get_default_starter_collection()]
            self.save(default_cols)
            return default_cols

        try:
            with open(self.filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
                elif isinstance(data, dict) and "collections" in data:
                    return data["collections"]
                return [get_default_starter_collection()]
        except Exception as e:
            print(f"[Warning] Failed to load collections from {self.filepath}: {e}")
            return [get_default_starter_collection()]

    def save(self, collections: Optional[List[Dict[str, Any]]] = None) -> bool:
        """Saves collections to disk."""
        if collections is not None:
            self.collections = collections
        try:
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(self.collections, f, indent=2)
            return True
        except Exception as e:
            print(f"[Error] Failed to save collections: {e}")
            return False

    def get_collection(self, col_id: str) -> Optional[Dict[str, Any]]:
        for c in self.collections:
            if c.get("id") == col_id:
                return c
        return None

    def create_collection(self, name: str, description: str = "") -> Dict[str, Any]:
        new_col = {
            "id": generate_uuid(),
            "name": name.strip() or "Untitled Collection",
            "description": description.strip(),
            "variables": {
                "baseUrl": "http://localhost:3000"
            },
            "items": []
        }
        self.collections.append(new_col)
        self.save()
        return new_col

    def rename_collection(self, col_id: str, new_name: str) -> bool:
        col = self.get_collection(col_id)
        if col:
            col["name"] = new_name.strip()
            self.save()
            return True
        return False

    def rename_request(self, col_id: str, req_id: str, new_name: str) -> bool:
        col = self.get_collection(col_id)
        if not col:
            return False
        for item in col.get("items", []):
            if item.get("id") == req_id:
                item["name"] = new_name.strip()
                self.save()
                return True
        return False

    def delete_collection(self, col_id: str) -> bool:
        initial_len = len(self.collections)
        self.collections = [c for c in self.collections if c.get("id") != col_id]
        if len(self.collections) < initial_len:
            self.save()
            return True
        return False

    def save_request(
        self,
        col_id: str,
        name: str,
        request_dict: Dict[str, Any],
        req_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Adds or updates a request in the specified collection."""
        col = self.get_collection(col_id)
        if not col:
            col = self.create_collection("My API Tests")

        items = col.setdefault("items", [])
        if req_id:
            # Update existing
            for item in items:
                if item.get("id") == req_id:
                    item["name"] = name
                    item["request"] = request_dict
                    self.save()
                    return item

        # Create new
        new_item = {
            "id": generate_uuid(),
            "name": name,
            "request": request_dict
        }
        items.append(new_item)
        self.save()
        return new_item

    def delete_request(self, col_id: str, req_id: str) -> bool:
        col = self.get_collection(col_id)
        if not col:
            return False
        items = col.get("items", [])
        col["items"] = [it for it in items if it.get("id") != req_id]
        self.save()
        return True

    def duplicate_collection(self, col_id: str) -> Optional[Dict[str, Any]]:
        col = self.get_collection(col_id)
        if not col:
            return None
        for idx, c in enumerate(list(self.collections)):
            if c.get("id") == col_id:
                dup = json.loads(json.dumps(c))
                dup["id"] = generate_uuid()
                existing_names = [x.get("name", "") for x in self.collections]
                dup["name"] = generate_copy_name(c.get("name", "Collection"), existing_names)
                for it in dup.get("items", []):
                    it["id"] = generate_uuid()
                self.collections.insert(idx + 1, dup)
                self.save()
                return dup
        return None

    def duplicate_request(self, col_id: str, req_id: str) -> Optional[Dict[str, Any]]:
        col = self.get_collection(col_id)
        if not col:
            return None
        items = col.setdefault("items", [])
        for idx, it in enumerate(list(items)):
            if it.get("id") == req_id:
                dup = json.loads(json.dumps(it))
                dup["id"] = generate_uuid()
                existing_names = [x.get("name", "") for x in items]
                dup["name"] = generate_copy_name(it.get("name", "Request"), existing_names)
                items.insert(idx + 1, dup)
                self.save()
                return dup
        return None

    def reorder_request(self, col_id: str, req_id: str, new_index: int) -> bool:
        """Changes the position of a request within the same collection."""
        col = self.get_collection(col_id)
        if not col:
            return False
        items = col.get("items", [])
        old_index = next((i for i, it in enumerate(items) if it.get("id") == req_id), None)
        if old_index is None:
            return False
        item = items.pop(old_index)
        if old_index < new_index:
            new_index -= 1
        new_index = max(0, min(len(items), new_index))
        items.insert(new_index, item)
        self.save()
        return True

    def move_request(self, src_col_id: str, dest_col_id: str, req_id: str, dest_index: Optional[int] = None) -> bool:
        """Moves a request from one collection to another at an optional target index."""
        src_col = self.get_collection(src_col_id)
        dest_col = self.get_collection(dest_col_id)
        if not src_col or not dest_col:
            return False

        src_items = src_col.get("items", [])
        old_index = next((i for i, it in enumerate(src_items) if it.get("id") == req_id), None)
        if old_index is None:
            return False

        item = src_items.pop(old_index)
        dest_items = dest_col.setdefault("items", [])
        if dest_index is None or dest_index < 0 or dest_index > len(dest_items):
            dest_items.append(item)
        else:
            dest_items.insert(dest_index, item)

        self.save()
        return True

    def export_collection_format(self, col_id: str) -> Dict[str, Any]:
        """
        Converts the collection to official standard Collection v2.1 Schema.
        Compatible with modern API clients, Insomnia, Thunder Client, Bruno, and Hoppscotch.
        """
        col = self.get_collection(col_id)
        if not col:
            raise ValueError(f"Collection {col_id} not found.")

        collection_items = []
        for it in col.get("items", []):
            req_data = it.get("request", {})
            method = req_data.get("method", "GET").upper()
            raw_url = req_data.get("url", "")

            # Headers
            headers_list = []
            for h in req_data.get("headers", []):
                if isinstance(h, dict):
                    headers_list.append({
                        "key": h.get("key", ""),
                        "value": h.get("value", ""),
                        "disabled": not h.get("enabled", True)
                    })
                elif isinstance(h, (list, tuple)) and len(h) >= 2:
                    headers_list.append({
                        "key": h[0],
                        "value": h[1],
                        "disabled": not h[2] if len(h) > 2 else False
                    })

            # Query params
            query_list = []
            for q in req_data.get("params", []):
                if isinstance(q, dict):
                    query_list.append({
                        "key": q.get("key", ""),
                        "value": q.get("value", ""),
                        "disabled": not q.get("enabled", True)
                    })
                elif isinstance(q, (list, tuple)) and len(q) >= 2:
                    query_list.append({
                        "key": q[0],
                        "value": q[1],
                        "disabled": not q[2] if len(q) > 2 else False
                    })

            # Body
            body_type = req_data.get("body_type", "none")
            body_content = req_data.get("body_content", "")
            collection_body = {"mode": "none"}
            if body_type == "json":
                collection_body = {
                    "mode": "raw",
                    "raw": body_content,
                    "options": {"raw": {"language": "json"}}
                }
            elif body_type == "form":
                form_params = []
                for line in body_content.splitlines():
                    if "=" in line:
                        k, v = line.split("=", 1)
                        form_params.append({"key": k.strip(), "value": v.strip(), "type": "text"})
                collection_body = {
                    "mode": "urlencoded",
                    "urlencoded": form_params
                }
            elif body_type == "text":
                collection_body = {
                    "mode": "raw",
                    "raw": body_content,
                    "options": {"raw": {"language": "text"}}
                }

            # Auth
            auth_type = req_data.get("auth_type", "none")
            auth_data = req_data.get("auth_data", {})
            collection_auth = None
            if auth_type == "bearer":
                collection_auth = {
                    "type": "bearer",
                    "bearer": [{"key": "token", "value": auth_data.get("token", ""), "type": "string"}]
                }
            elif auth_type == "basic":
                collection_auth = {
                    "type": "basic",
                    "basic": [
                        {"key": "username", "value": auth_data.get("username", ""), "type": "string"},
                        {"key": "password", "value": auth_data.get("password", ""), "type": "string"}
                    ]
                }
            elif auth_type == "apikey":
                collection_auth = {
                    "type": "apikey",
                    "apikey": [
                        {"key": "key", "value": auth_data.get("key", ""), "type": "string"},
                        {"key": "value", "value": auth_data.get("value", ""), "type": "string"},
                        {"key": "in", "value": auth_data.get("add_to", "header"), "type": "string"}
                    ]
                }

            # Construct standard v2.1 URL object
            url_obj = {
                "raw": raw_url,
                "query": query_list
            }
            if raw_url.startswith("http://") or raw_url.startswith("https://"):
                try:
                    from urllib.parse import urlparse
                    p = urlparse(raw_url)
                    url_obj["protocol"] = p.scheme
                    url_obj["host"] = [p.hostname] if p.hostname else ["localhost"]
                    if p.port:
                        url_obj["port"] = str(p.port)
                    url_obj["path"] = [x for x in p.path.split("/") if x]
                except Exception:
                    pass
            elif "{{baseUrl}}" in raw_url:
                clean_path = raw_url.replace("{{baseUrl}}", "").lstrip("/")
                url_obj["host"] = ["{{baseUrl}}"]
                url_obj["path"] = [x for x in clean_path.split("/") if x]

            # Assemble Collection Item
            collection_item = {
                "name": it.get("name", "Request"),
                "request": {
                    "method": method,
                    "header": headers_list,
                    "url": url_obj,
                    "body": collection_body
                },
                "response": []
            }
            if collection_auth:
                collection_item["request"]["auth"] = collection_auth

            collection_items.append(collection_item)

        # Environment variables to standard collection variables
        collection_vars = []
        for k, v in col.get("variables", {}).items():
            collection_vars.append({
                "key": k,
                "value": str(v),
                "type": "string"
            })

        return {
            "info": {
                "_postman_id": col.get("id", generate_uuid()),
                "name": col.get("name", "Share Port API Collection"),
                "description": col.get("description", "Generated with Share Port Zero-Server API Client"),
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            "item": collection_items,
            "variable": collection_vars
        }



    def import_collection_format(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Imports a standard Collection v2.1 JSON or Share Port collection dict.
        Normalizes it into the local store format.
        """
        # Check if input is OpenAPI 3.x or Swagger 2.0
        if "openapi" in data or "swagger" in data or ("paths" in data and isinstance(data.get("paths"), dict)):
            return self.import_openapi_format(data)

        info = data.get("info", {})
        col_name = info.get("name") or data.get("name") or "Imported Collection"
        col_desc = info.get("description") or data.get("description") or ""

        # Extract variables
        variables = {}
        for var in data.get("variable", []):
            if isinstance(var, dict) and "key" in var and "value" in var:
                variables[var["key"]] = var["value"]

        if not variables and "variables" in data and isinstance(data["variables"], dict):
            variables = data["variables"]

        if "baseUrl" not in variables:
            variables["baseUrl"] = "http://localhost:3000"

        # Flatten nested items/folders into a list of requests
        items_to_process = data.get("item", []) or data.get("items", [])
        parsed_items = []

        def _extract_items(items_list, folder_name=""):
            for it in items_list:
                if not isinstance(it, dict):
                    continue
                # If folder (contains nested 'item')
                if "item" in it and isinstance(it["item"], list):
                    sub_folder = f"{folder_name}/{it.get('name')}" if folder_name else it.get("name", "")
                    _extract_items(it["item"], sub_folder)
                    continue

                # It is a request
                req_obj = it.get("request", {})
                req_name = it.get("name", "Request")
                if folder_name:
                    req_name = f"[{folder_name}] {req_name}"

                method = "GET"
                raw_url = ""
                headers = []
                params = []
                body_type = "none"
                body_content = ""
                auth_type = "none"
                auth_data = {}

                if isinstance(req_obj, str):
                    raw_url = req_obj
                elif isinstance(req_obj, dict):
                    method = req_obj.get("method", "GET").upper()

                    # URL
                    url_field = req_obj.get("url")
                    if isinstance(url_field, str):
                        raw_url = url_field
                    elif isinstance(url_field, dict):
                        raw_url = url_field.get("raw", "")
                        for q in url_field.get("query", []):
                            if isinstance(q, dict):
                                params.append({
                                    "key": q.get("key", ""),
                                    "value": q.get("value", ""),
                                    "enabled": not q.get("disabled", False)
                                })

                    # Headers
                    for h in req_obj.get("header", []):
                        if isinstance(h, dict):
                            headers.append({
                                "key": h.get("key", ""),
                                "value": h.get("value", ""),
                                "enabled": not h.get("disabled", False)
                            })

                    # Body
                    body_obj = req_obj.get("body", {})
                    mode = body_obj.get("mode", "none")
                    if mode == "raw":
                        body_content = body_obj.get("raw", "")
                        lang = body_obj.get("options", {}).get("raw", {}).get("language", "text")
                        body_type = "json" if lang == "json" or body_content.strip().startswith(("{", "[")) else "text"
                    elif mode in ("urlencoded", "formdata"):
                        lines = []
                        for param in (body_obj.get("urlencoded") or body_obj.get("formdata") or []):
                            if isinstance(param, dict):
                                lines.append(f"{param.get('key', '')}={param.get('value', '')}")
                        body_content = "\n".join(lines)
                        body_type = "form"

                    # Auth
                    auth_obj = req_obj.get("auth", {})
                    auth_type_raw = auth_obj.get("type", "none")
                    if auth_type_raw == "bearer":
                        auth_type = "bearer"
                        for b in auth_obj.get("bearer", []):
                            if b.get("key") == "token":
                                auth_data["token"] = b.get("value", "")
                    elif auth_type_raw == "basic":
                        auth_type = "basic"
                        for b in auth_obj.get("basic", []):
                            if b.get("key") == "username":
                                auth_data["username"] = b.get("value", "")
                            elif b.get("key") == "password":
                                auth_data["password"] = b.get("value", "")

                parsed_items.append({
                    "id": generate_uuid(),
                    "name": req_name,
                    "request": {
                        "method": method,
                        "url": raw_url,
                        "headers": headers,
                        "params": params,
                        "body_type": body_type,
                        "body_content": body_content,
                        "auth_type": auth_type,
                        "auth_data": auth_data
                    }
                })

        _extract_items(items_to_process)

        imported_col = {
            "id": generate_uuid(),
            "name": col_name,
            "description": col_desc,
            "variables": variables,
            "items": parsed_items
        }

        self.collections.append(imported_col)
        self.save()
        return imported_col



    def import_openapi_format(self, data: Dict[str, Any], default_base_url: str = "http://localhost:8000") -> Dict[str, Any]:
        """
        Parses OpenAPI 3.x / Swagger 2.0 specifications (e.g. FastAPI's /openapi.json).
        Converts endpoints into a structured collection grouped by tags/paths.
        """
        info = data.get("info", {})
        col_name = info.get("title") or "OpenAPI Collection"
        col_desc = info.get("description") or f"Imported from OpenAPI {data.get('openapi', data.get('swagger', ''))}"

        # Determine baseUrl from servers or default
        base_url = default_base_url
        servers = data.get("servers", [])
        if servers and isinstance(servers, list) and isinstance(servers[0], dict):
            s_url = servers[0].get("url", "")
            if s_url and not s_url.startswith("/"):
                base_url = s_url

        paths = data.get("paths", {})
        parsed_items = []
        for path_str, path_obj in paths.items():
            if not isinstance(path_obj, dict):
                continue
            for method in ["get", "post", "put", "delete", "patch", "head", "options"]:
                if method in path_obj:
                    op = path_obj[method]
                    tags = op.get("tags", [])
                    tag_prefix = f"[{tags[0]}] " if tags else ""
                    summary = op.get("summary") or op.get("operationId") or f"{method.upper()} {path_str}"
                    req_name = f"{tag_prefix}{summary}"

                    params = []
                    # Path/Query parameters
                    for p in op.get("parameters", []) + path_obj.get("parameters", []):
                        if isinstance(p, dict) and p.get("in") == "query":
                            params.append({
                                "key": p.get("name", ""),
                                "value": str(p.get("example") or p.get("default") or ""),
                                "enabled": p.get("required", False)
                            })

                    headers = [
                        {"key": "Accept", "value": "application/json", "enabled": True}
                    ]

                    # Request Body
                    body_type = "none"
                    body_content = ""
                    req_body = op.get("requestBody", {})
                    if req_body and isinstance(req_body, dict):
                        content = req_body.get("content", {})
                        if "application/json" in content:
                            body_type = "json"
                            headers.append({"key": "Content-Type", "value": "application/json", "enabled": True})
                            example = content["application/json"].get("example")
                            if example:
                                body_content = json.dumps(example, indent=2)
                            else:
                                schema = content["application/json"].get("schema", {})
                                sample = {}
                                properties = schema.get("properties", {})
                                for prop_name, prop_data in properties.items():
                                    sample[prop_name] = prop_data.get("example", prop_data.get("default", ""))
                                body_content = json.dumps(sample, indent=2) if sample else "{}"

                    parsed_items.append({
                        "id": generate_uuid(),
                        "name": req_name,
                        "request": {
                            "method": method.upper(),
                            "url": f"{{{{baseUrl}}}}{path_str}",
                            "headers": headers,
                            "params": params,
                            "body_type": body_type,
                            "body_content": body_content,
                            "auth_type": "none",
                            "auth_data": {}
                        }
                    })

        imported_col = {
            "id": generate_uuid(),
            "name": col_name,
            "description": col_desc,
            "variables": {
                "baseUrl": base_url
            },
            "items": parsed_items
        }
        self.collections.append(imported_col)
        self.save()
        return imported_col

