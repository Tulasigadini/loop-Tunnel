"""
Local HTTP Request Execution Engine for Share Port.
Executes requests 100% locally with high-speed connection pooling.
Supports test assertions, cURL generation, and zero-server execution.
"""

import time
import json
import threading
from typing import Dict, Any, Optional, Callable, Tuple, List
from urllib.parse import urlparse, urlencode, parse_qsl
import requests
from requests.auth import HTTPBasicAuth
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class RequestConfig:
    def __init__(
        self,
        method: str = "GET",
        url: str = "",
        params: Optional[List[Tuple[str, str, bool]]] = None,
        headers: Optional[List[Tuple[str, str, bool]]] = None,
        body_type: str = "none",  # none, form-data, x-www-form-urlencoded, raw, binary, GraphQL, json, form, text
        body_content: str = "",
        body_raw_format: str = "JSON",  # JSON, Text, JavaScript, HTML, XML
        form_data: Optional[List[Dict[str, Any]]] = None,  # [{"key": str, "value": str, "type": "text"|"file", "enabled": bool}]
        urlencoded_data: Optional[List[Tuple[str, str, bool]]] = None,
        binary_path: str = "",
        graphql_query: str = "",
        graphql_variables: str = "",
        auth_type: str = "none",  # none, bearer, basic, apikey, oauth2, digest, aws
        auth_data: Optional[Dict[str, str]] = None,
        tests: Optional[List[Dict[str, Any]]] = None,
        timeout: float = 30.0,
        verify_ssl: bool = False
    ):
        self.method = method.upper().strip()
        self.url = url.strip()
        self.params = params or []  # List of (key, value, enabled)
        self.headers = headers or []  # List of (key, value, enabled)
        self.body_type = body_type
        self.body_content = body_content
        self.body_raw_format = body_raw_format
        self.form_data = form_data or []
        self.urlencoded_data = urlencoded_data or []
        self.binary_path = binary_path
        self.graphql_query = graphql_query
        self.graphql_variables = graphql_variables
        self.auth_type = auth_type
        self.auth_data = auth_data or {}
        self.tests = tests or []
        self.timeout = timeout
        self.verify_ssl = verify_ssl


class ResponseData:
    def __init__(
        self,
        status_code: int = 0,
        status_text: str = "",
        time_ms: float = 0.0,
        size_bytes: int = 0,
        headers: Optional[Dict[str, str]] = None,
        body: str = "",
        cookies: Optional[Dict[str, str]] = None,
        test_results: Optional[List[Dict[str, Any]]] = None,
        extracted_variables: Optional[Dict[str, str]] = None,
        error: Optional[str] = None
    ):
        self.status_code = status_code
        self.status_text = status_text
        self.time_ms = time_ms
        self.size_bytes = size_bytes
        self.headers = headers or {}
        self.body = body
        self.cookies = cookies or {}
        self.test_results = test_results or []
        self.extracted_variables = extracted_variables or {}
        self.error = error

    @property
    def is_success(self) -> bool:
        return 200 <= self.status_code < 300

    @property
    def formatted_size(self) -> str:
        if self.size_bytes < 1024:
            return f"{self.size_bytes} B"
        elif self.size_bytes < 1024 * 1024:
            return f"{self.size_bytes / 1024:.1f} KB"
        else:
            return f"{self.size_bytes / (1024 * 1024):.2f} MB"

    @property
    def formatted_time(self) -> str:
        if self.time_ms < 1000:
            return f"{self.time_ms:.0f} ms"
        return f"{self.time_ms / 1000:.2f} s"


class RequestEngine:
    """High-speed local HTTP execution engine with connection pooling and test assertions."""

    _session_pool: Optional[requests.Session] = None
    _session_lock = threading.Lock()

    @classmethod
    def get_session(cls) -> requests.Session:
        """Returns a pooled requests session with keep-alive for sub-millisecond local requests."""
        with cls._session_lock:
            if cls._session_pool is None:
                s = requests.Session()
                # Connection pooling for high concurrency & instant localhost testing
                adapter = HTTPAdapter(pool_connections=20, pool_maxsize=50, max_retries=Retry(total=0))
                s.mount("http://", adapter)
                s.mount("https://", adapter)
                cls._session_pool = s
            return cls._session_pool

    @staticmethod
    def interpolate_variables(text: str, variables: Dict[str, str]) -> str:
        """Substitutes {{variable}} placeholders with active values."""
        if not text or not variables:
            return text
        result = text
        for key, value in variables.items():
            result = result.replace(f"{{{{{key}}}}}", str(value))
        return result

    @classmethod
    def generate_curl(cls, config: RequestConfig, variables: Optional[Dict[str, str]] = None) -> str:
        """Generates an executable cURL command for the request."""
        vars_dict = variables or {}
        url = cls.interpolate_variables(config.url, vars_dict).strip()
        if not url.startswith("http://") and not url.startswith("https://"):
            url = "http://" + url

        parts = ["curl", "-X", config.method, f'"{url}"']

        # Headers
        for k, v, enabled in config.headers:
            if enabled and k.strip():
                ik = cls.interpolate_variables(k.strip(), vars_dict)
                iv = cls.interpolate_variables(v.strip(), vars_dict)
                parts.extend(["-H", f'"{ik}: {iv}"'])

        # Auth
        if config.auth_type in ["bearer", "oauth2"]:
            tok = cls.interpolate_variables(config.auth_data.get("token", ""), vars_dict).strip()
            if tok:
                parts.extend(["-H", f'"Authorization: Bearer {tok}"'])
        elif config.auth_type in ["basic", "digest"]:
            u = cls.interpolate_variables(config.auth_data.get("username", ""), vars_dict)
            p = cls.interpolate_variables(config.auth_data.get("password", ""), vars_dict)
            parts.extend(["-u", f'"{u}:{p}"'])
        elif config.auth_type == "apikey":
            k = cls.interpolate_variables(config.auth_data.get("key", ""), vars_dict).strip()
            v = cls.interpolate_variables(config.auth_data.get("value", ""), vars_dict).strip()
            if k and v and config.auth_data.get("add_to", "header") == "header":
                parts.extend(["-H", f'"{k}: {v}"'])

        # Body
        if config.method not in ["GET", "HEAD"] and config.body_type != "none":
            if config.body_type == "form-data":
                for item in config.form_data:
                    if item.get("enabled", True) and item.get("key", "").strip():
                        ik = cls.interpolate_variables(item["key"].strip(), vars_dict)
                        iv = cls.interpolate_variables(str(item.get("value", "")).strip(), vars_dict)
                        if item.get("type") == "file":
                            parts.extend(["-F", f'"{ik}=@{iv}"'])
                        else:
                            parts.extend(["-F", f'"{ik}={iv}"'])
            elif config.body_type == "x-www-form-urlencoded":
                for k, v, enabled in config.urlencoded_data:
                    if enabled and k.strip():
                        ik = cls.interpolate_variables(k.strip(), vars_dict)
                        iv = cls.interpolate_variables(v.strip(), vars_dict)
                        parts.extend(["--data-urlencode", f'"{ik}={iv}"'])
            elif config.body_type in ["raw", "json", "text"]:
                content = cls.interpolate_variables(config.body_content, vars_dict)
                if content.strip():
                    escaped = content.replace('"', '\\"')
                    parts.extend(["-d", f'"{escaped}"'])
            elif config.body_type == "binary" and config.binary_path.strip():
                parts.extend(["--data-binary", f'"@{config.binary_path.strip()}"'])
            elif config.body_type == "GraphQL" and config.graphql_query.strip():
                gql_payload = json.dumps({"query": config.graphql_query, "variables": json.loads(config.graphql_variables or "{}")})
                escaped = gql_payload.replace('"', '\\"')
                parts.extend(["-H", '"Content-Type: application/json"', "-d", f'"{escaped}"'])

        return " ".join(parts)

    @classmethod
    def execute(
        cls,
        config: RequestConfig,
        variables: Optional[Dict[str, str]] = None
    ) -> ResponseData:
        """Executes the HTTP request synchronously with connection pooling."""
        vars_dict = variables or {}

        # 1. Resolve URL
        url = cls.interpolate_variables(config.url, vars_dict).strip()
        if not url:
            return ResponseData(error="URL cannot be empty.")

        if not url.startswith("http://") and not url.startswith("https://"):
            url = "http://" + url

        # 2. Build Query Params
        active_params = {}
        for k, v, enabled in config.params:
            if enabled and k.strip():
                interp_k = cls.interpolate_variables(k.strip(), vars_dict)
                interp_v = cls.interpolate_variables(v.strip(), vars_dict)
                active_params[interp_k] = interp_v

        # 3. Build Headers
        active_headers = {}
        for k, v, enabled in config.headers:
            if enabled and k.strip():
                interp_k = cls.interpolate_variables(k.strip(), vars_dict)
                interp_v = cls.interpolate_variables(v.strip(), vars_dict)
                active_headers[interp_k] = interp_v

        # 4. Handle Auth
        auth_obj = None
        if config.auth_type in ["bearer", "oauth2"]:
            token = cls.interpolate_variables(config.auth_data.get("token", ""), vars_dict).strip()
            if token:
                active_headers["Authorization"] = f"Bearer {token}"
        elif config.auth_type == "basic":
            user = cls.interpolate_variables(config.auth_data.get("username", ""), vars_dict)
            pwd = cls.interpolate_variables(config.auth_data.get("password", ""), vars_dict)
            auth_obj = HTTPBasicAuth(user, pwd)
        elif config.auth_type == "digest":
            from requests.auth import HTTPDigestAuth
            user = cls.interpolate_variables(config.auth_data.get("username", ""), vars_dict)
            pwd = cls.interpolate_variables(config.auth_data.get("password", ""), vars_dict)
            auth_obj = HTTPDigestAuth(user, pwd)
        elif config.auth_type == "apikey":
            key_name = cls.interpolate_variables(config.auth_data.get("key", ""), vars_dict).strip()
            key_val = cls.interpolate_variables(config.auth_data.get("value", ""), vars_dict).strip()
            add_to = config.auth_data.get("add_to", "header")
            if key_name and key_val:
                if add_to == "header":
                    active_headers[key_name] = key_val
                else:
                    active_params[key_name] = key_val

        # 5. Handle Body & Files
        data = None
        json_data = None
        files = None
        open_file_handles = []
        body_content = cls.interpolate_variables(config.body_content, vars_dict)

        try:
            if config.method not in ["GET", "HEAD"] and config.body_type != "none":
                if config.body_type == "form-data":
                    # Multipart Form Data with optional file attachments
                    form_fields = {}
                    files_dict = {}
                    for item in config.form_data:
                        if item.get("enabled", True) and item.get("key", "").strip():
                            ik = cls.interpolate_variables(item["key"].strip(), vars_dict)
                            raw_val = item.get("value", "")
                            if item.get("type") == "file":
                                file_path = str(raw_val).strip()
                                if file_path and os.path.exists(file_path):
                                    import os
                                    fh = open(file_path, "rb")
                                    open_file_handles.append(fh)
                                    filename = os.path.basename(file_path)
                                    files_dict[ik] = (filename, fh)
                                else:
                                    files_dict[ik] = ("", b"")
                            else:
                                iv = cls.interpolate_variables(str(raw_val), vars_dict)
                                form_fields[ik] = iv
                    data = form_fields if form_fields else None
                    files = files_dict if files_dict else None

                elif config.body_type == "x-www-form-urlencoded":
                    form_dict = {}
                    for k, v, enabled in config.urlencoded_data:
                        if enabled and k.strip():
                            ik = cls.interpolate_variables(k.strip(), vars_dict)
                            iv = cls.interpolate_variables(v.strip(), vars_dict)
                            form_dict[ik] = iv
                    data = form_dict
                    if "Content-Type" not in active_headers:
                        active_headers["Content-Type"] = "application/x-www-form-urlencoded"

                elif config.body_type in ["raw", "json", "text"]:
                    raw_fmt = getattr(config, "body_raw_format", "JSON")
                    content_types = {
                        "JSON": "application/json",
                        "Text": "text/plain",
                        "JavaScript": "application/javascript",
                        "HTML": "text/html",
                        "XML": "application/xml"
                    }
                    if "Content-Type" not in active_headers:
                        active_headers["Content-Type"] = content_types.get(raw_fmt, "application/json" if config.body_type == "json" else "text/plain")

                    if raw_fmt == "JSON" or config.body_type == "json":
                        if body_content.strip():
                            try:
                                json_data = json.loads(body_content)
                            except json.JSONDecodeError as err:
                                return ResponseData(error=f"Invalid JSON Body: {str(err)}")
                    else:
                        data = body_content.encode("utf-8")

                elif config.body_type == "binary":
                    if "Content-Type" not in active_headers:
                        active_headers["Content-Type"] = "application/octet-stream"
                    bpath = config.binary_path.strip()
                    if bpath and os.path.exists(bpath):
                        with open(bpath, "rb") as bf:
                            data = bf.read()

                elif config.body_type == "GraphQL":
                    if "Content-Type" not in active_headers:
                        active_headers["Content-Type"] = "application/json"
                    gql_vars = {}
                    if config.graphql_variables.strip():
                        try:
                            gql_vars = json.loads(config.graphql_variables)
                        except Exception:
                            gql_vars = {}
                    json_data = {"query": config.graphql_query, "variables": gql_vars}

                elif config.body_type == "form":  # Legacy fallback
                    if "Content-Type" not in active_headers:
                        active_headers["Content-Type"] = "application/x-www-form-urlencoded"
                    if body_content.strip():
                        form_dict = {}
                        for line in body_content.strip().splitlines():
                            if "=" in line:
                                k, v = line.split("=", 1)
                                form_dict[k.strip()] = v.strip()
                        data = form_dict

            # 6. Execute Request & Measure Metrics
            start_time = time.perf_counter()
            session = cls.get_session()
            req = requests.Request(
                method=config.method,
                url=url,
                params=active_params if active_params else None,
                headers=active_headers,
                data=data,
                json=json_data,
                files=files,
                auth=auth_obj
            )
            prepped = session.prepare_request(req)

            resp = session.send(
                prepped,
                timeout=config.timeout,
                verify=config.verify_ssl
            )
            elapsed_ms = (time.perf_counter() - start_time) * 1000

            resp_headers = dict(resp.headers)
            resp_cookies = dict(resp.cookies)

            content_length = resp.headers.get("Content-Length")
            if content_length and content_length.isdigit():
                size_bytes = int(content_length)
            else:
                size_bytes = len(resp.content)

            # 7. Evaluate Comprehensive Test Assertions (All Standard Testing Types)
            test_results, extracted_vars = cls._run_test_assertions(
                config.tests, resp.status_code, elapsed_ms, resp.text, resp_headers
            )

            return ResponseData(
                status_code=resp.status_code,
                status_text=resp.reason,
                time_ms=elapsed_ms,
                size_bytes=size_bytes,
                headers=resp_headers,
                body=resp.text,
                cookies=resp_cookies,
                test_results=test_results,
                extracted_variables=extracted_vars
            )

        except requests.exceptions.SSLError as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            return ResponseData(time_ms=elapsed_ms, error=f"SSL Verification Error: {str(e)}")
        except requests.exceptions.ConnectionError:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            return ResponseData(time_ms=elapsed_ms, error=f"Could not connect to {url}.\nEnsure your local server is running on that port.")
        except requests.exceptions.Timeout:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            return ResponseData(time_ms=elapsed_ms, error=f"Request Timeout: Local server did not respond within {config.timeout}s.")
        except Exception as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            return ResponseData(time_ms=elapsed_ms, error=f"{type(e).__name__}: {str(e)}")
        finally:
            for fh in open_file_handles:
                try:
                    fh.close()
                except Exception:
                    pass

    @staticmethod
    def extract_json_path(data: Any, path: str) -> Tuple[bool, Any]:
        """Navigates dot-separated paths and array indices like 'data.items.0.id'."""
        if not path or not path.strip():
            return True, data
        parts = path.strip().split(".")
        curr = data
        for part in parts:
            part = part.strip()
            if isinstance(curr, dict):
                if part in curr:
                    curr = curr[part]
                else:
                    return False, None
            elif isinstance(curr, list):
                if part.isdigit() and int(part) < len(curr):
                    curr = curr[int(part)]
                else:
                    return False, None
            else:
                return False, None
        return True, curr

    @classmethod
    def _run_test_assertions(
        cls,
        tests: List[Dict[str, Any]],
        status_code: int,
        latency_ms: float,
        body_text: str,
        headers: Dict[str, str]
    ) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
        """Evaluates automated test assertions against response metrics covering all standard test types."""
        results = []
        extracted_vars: Dict[str, str] = {}

        parsed_json = None
        json_parsed_attempted = False

        def _get_json():
            nonlocal parsed_json, json_parsed_attempted
            if not json_parsed_attempted:
                json_parsed_attempted = True
                try:
                    parsed_json = json.loads(body_text)
                except Exception:
                    parsed_json = None
            return parsed_json

        for t in tests:
            t_type = t.get("type", "").strip()
            t_name = t.get("name", "").strip()
            if not t.get("enabled", True):
                continue

            # 1. Status Code Assertions
            if t_type == "status_code":
                expected_raw = str(t.get("value", 200)).strip().lower()
                passed = False
                detail = f"Actual: {status_code}"

                if expected_raw == "2xx":
                    passed = (200 <= status_code < 300)
                    detail = f"Status {status_code} in 2xx range" if passed else f"Status {status_code} not 2xx"
                elif expected_raw == "3xx":
                    passed = (300 <= status_code < 400)
                elif expected_raw == "4xx":
                    passed = (400 <= status_code < 500)
                elif expected_raw == "5xx":
                    passed = (500 <= status_code < 600)
                elif "," in expected_raw:
                    expected_list = [int(x.strip()) for x in expected_raw.split(",") if x.strip().isdigit()]
                    passed = (status_code in expected_list)
                    detail = f"Actual: {status_code} (Expected one of: {expected_raw})"
                else:
                    try:
                        passed = (int(status_code) == int(expected_raw))
                    except Exception:
                        passed = False

                results.append({
                    "name": t_name or f"Status code is {expected_raw.upper()}",
                    "passed": passed,
                    "detail": detail
                })

            # 2. Response Time / Latency Assertions
            elif t_type == "response_time":
                max_ms = t.get("value", 500)
                try:
                    passed = (latency_ms < float(max_ms))
                    results.append({
                        "name": t_name or f"Response time < {max_ms} ms",
                        "passed": passed,
                        "detail": f"Actual: {latency_ms:.0f} ms"
                    })
                except Exception:
                    pass

            # 3. Response Header Exists
            elif t_type == "header_exists":
                h_name = str(t.get("target", t.get("value", ""))).strip()
                h_lower = {k.lower(): v for k, v in headers.items()}
                passed = (h_name.lower() in h_lower)
                results.append({
                    "name": t_name or f"Header '{h_name}' exists",
                    "passed": passed,
                    "detail": f"Value: {h_lower.get(h_name.lower())}" if passed else "Header not found"
                })

            # 4. Response Header Contains Value
            elif t_type == "header_contains":
                h_name = str(t.get("target", "")).strip()
                expected_val = str(t.get("value", "")).strip().lower()
                h_lower = {k.lower(): v for k, v in headers.items()}
                actual_val = h_lower.get(h_name.lower(), "")
                passed = (expected_val in actual_val.lower())
                results.append({
                    "name": t_name or f"Header '{h_name}' contains '{expected_val}'",
                    "passed": passed,
                    "detail": f"Actual: '{actual_val}'" if actual_val else "Header missing"
                })

            # 5. Response Body Contains String
            elif t_type == "body_contains":
                keyword = str(t.get("value", "")).strip()
                passed = (keyword in body_text)
                results.append({
                    "name": t_name or f"Body contains '{keyword}'",
                    "passed": passed,
                    "detail": "Found in body" if passed else "String not found in response body"
                })

            # 6. Response Body Does NOT Contain String
            elif t_type == "body_not_contains":
                keyword = str(t.get("value", "")).strip()
                passed = (keyword not in body_text)
                results.append({
                    "name": t_name or f"Body does not contain '{keyword}'",
                    "passed": passed,
                    "detail": "Correctly absent" if passed else f"Found unexpected '{keyword}' in body"
                })

            # 7. Body is Valid JSON
            elif t_type == "body_is_json":
                pj = _get_json()
                passed = (pj is not None)
                results.append({
                    "name": t_name or "Body is valid JSON",
                    "passed": passed,
                    "detail": "Parsed successfully" if passed else "Failed to parse JSON"
                })

            # 8. JSON Key Exists (supports dot path e.g. data.items.0.id)
            elif t_type in ["json_key", "json_key_exists", "json_check"]:
                path = str(t.get("target", t.get("value", ""))).strip()
                pj = _get_json()
                if pj is None:
                    results.append({
                        "name": t_name or f"JSON has path '{path}'",
                        "passed": False,
                        "detail": "Response is not valid JSON"
                    })
                else:
                    exists, val = cls.extract_json_path(pj, path)
                    results.append({
                        "name": t_name or f"JSON has path '{path}'",
                        "passed": exists,
                        "detail": f"Value: {str(val)[:40]}" if exists else f"Path '{path}' not found"
                    })

            # 9. JSON Value Equals Expected
            elif t_type in ["json_value", "json_value_equals"]:
                path = str(t.get("target", "")).strip()
                expected = str(t.get("value", "")).strip()
                pj = _get_json()
                if pj is None:
                    results.append({
                        "name": t_name or f"JSON '{path}' equals '{expected}'",
                        "passed": False,
                        "detail": "Response is not valid JSON"
                    })
                else:
                    exists, actual_val = cls.extract_json_path(pj, path)
                    if not exists:
                        results.append({
                            "name": t_name or f"JSON '{path}' equals '{expected}'",
                            "passed": False,
                            "detail": f"Path '{path}' not found"
                        })
                    else:
                        # Compare typed or string
                        passed = (str(actual_val).strip().lower() == expected.lower())
                        results.append({
                            "name": t_name or f"JSON '{path}' == '{expected}'",
                            "passed": passed,
                            "detail": f"Actual: {actual_val}"
                        })

            # 10. JSON Array is Not Empty
            elif t_type == "json_array_not_empty":
                path = str(t.get("target", t.get("value", ""))).strip()
                pj = _get_json()
                if pj is None:
                    results.append({
                        "name": t_name or f"Array '{path or 'root'}' not empty",
                        "passed": False,
                        "detail": "Response is not valid JSON"
                    })
                else:
                    exists, val = cls.extract_json_path(pj, path)
                    if exists and isinstance(val, list):
                        passed = len(val) > 0
                        results.append({
                            "name": t_name or f"Array '{path or 'root'}' is not empty",
                            "passed": passed,
                            "detail": f"Array contains {len(val)} items"
                        })
                    else:
                        results.append({
                            "name": t_name or f"Array '{path or 'root'}' is not empty",
                            "passed": False,
                            "detail": "Target is not an array or does not exist"
                        })

            # 11. Extract Variable into Environment (Chaining)
            elif t_type in ["extract_var", "extract_variable"]:
                path = str(t.get("target", "")).strip()
                var_name = str(t.get("value", "")).strip() or path
                pj = _get_json()
                if pj is not None:
                    exists, val = cls.extract_json_path(pj, path)
                    if exists and val is not None:
                        extracted_vars[var_name] = str(val)
                        results.append({
                            "name": t_name or f"Extract {{{{{var_name}}}}} from '{path}'",
                            "passed": True,
                            "detail": f"Saved {{{{{var_name}}}}} = {str(val)[:25]}..."
                        })
                    else:
                        results.append({
                            "name": t_name or f"Extract {{{{{var_name}}}}} from '{path}'",
                            "passed": False,
                            "detail": f"Path '{path}' not found to extract"
                        })
                else:
                    results.append({
                        "name": t_name or f"Extract {{{{{var_name}}}}}",
                        "passed": False,
                        "detail": "Response is not valid JSON"
                    })

        return results, extracted_vars

    @classmethod
    def execute_async(
        cls,
        config: RequestConfig,
        variables: Optional[Dict[str, str]],
        callback: Callable[[ResponseData], None]
    ) -> threading.Thread:
        def _worker():
            res = cls.execute(config, variables)
            callback(res)

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()
        return thread

    @classmethod
    def execute_batch(
        cls,
        requests_list: List[Tuple[str, RequestConfig]],
        initial_variables: Optional[Dict[str, str]] = None,
        progress_callback: Optional[Callable[[int, int, str, ResponseData], None]] = None
    ) -> Dict[str, Any]:
        """Runs a sequence of requests with automated variable chaining (Collection Runner)."""
        active_vars = dict(initial_variables or {})
        total_time_ms = 0.0
        passed_tests = 0
        failed_tests = 0
        total_tests = 0
        run_items = []

        total_reqs = len(requests_list)

        for idx, (req_name, req_cfg) in enumerate(requests_list):
            res = cls.execute(req_cfg, active_vars)
            total_time_ms += res.time_ms

            # Apply any extracted variables for subsequent requests!
            if res.extracted_variables:
                active_vars.update(res.extracted_variables)

            req_passed = 0
            req_failed = 0
            for tr in res.test_results:
                total_tests += 1
                if tr.get("passed"):
                    passed_tests += 1
                    req_passed += 1
                else:
                    failed_tests += 1
                    req_failed += 1

            run_items.append({
                "name": req_name,
                "method": req_cfg.method,
                "url": req_cfg.url,
                "status_code": res.status_code,
                "time_ms": res.time_ms,
                "passed_tests": req_passed,
                "failed_tests": req_failed,
                "test_results": res.test_results,
                "error": res.error
            })

            if progress_callback:
                progress_callback(idx + 1, total_reqs, req_name, res)

        return {
            "total_requests": total_reqs,
            "total_time_ms": total_time_ms,
            "total_tests": total_tests,
            "passed_tests": passed_tests,
            "failed_tests": failed_tests,
            "all_passed": (failed_tests == 0 and total_tests > 0),
            "final_variables": active_vars,
            "items": run_items
        }
