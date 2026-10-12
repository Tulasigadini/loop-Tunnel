using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Web.Script.Serialization;

namespace SharePort.WebView2App
{
    public class GatewayProxy
    {
        private HttpListener _listener;
        private Thread _listenerThread;
        private bool _isRunning = false;

        public int LocalPort { get; set; }
        public int BackendPort { get; set; }
        public bool EnableFullstack { get; set; }
        public bool EnableInspector { get; set; }
        public int InspectorPort { get; private set; }

        public Action<Dictionary<string, object>> OnNewInspectorLog { get; set; }

        private readonly List<Dictionary<string, object>> _logs = new List<Dictionary<string, object>>();
        private readonly object _logsLock = new object();
        private const int MaxLogs = 200;

        private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer();

        public List<Dictionary<string, object>> GetLogs()
        {
            lock (_logsLock)
            {
                return new List<Dictionary<string, object>>(_logs);
            }
        }

        public void ClearLogs()
        {
            lock (_logsLock)
            {
                _logs.Clear();
            }
        }

        private void RecordLog(Dictionary<string, object> item)
        {
            lock (_logsLock)
            {
                _logs.Insert(0, item);
                if (_logs.Count > MaxLogs) _logs.RemoveAt(_logs.Count - 1);
            }
            if (OnNewInspectorLog != null)
            {
                try { OnNewInspectorLog(item); } catch { }
            }
        }

        public static bool CheckPortActive(int port, string host = "127.0.0.1", int timeoutMs = 400)
        {
            if (TryConnect(host, port, timeoutMs)) return true;
            if (host == "127.0.0.1" && TryConnect("localhost", port, timeoutMs)) return true;
            return false;
        }

        private static bool TryConnect(string host, int port, int timeoutMs)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    var result = client.BeginConnect(host, port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(timeoutMs);
                    if (!success) return false;
                    client.EndConnect(result);
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }

        public static List<Dictionary<string, object>> ScanActivePorts(int[] portsToScan = null)
        {
            if (portsToScan == null || portsToScan.Length == 0)
            {
                portsToScan = new int[] { 8080, 8069, 8000, 7001, 7080, 50000, 8088, 8085, 9080, 8081, 9090, 3000, 5173, 4200, 5000, 3001, 8888, 8443, 80 };
            }
            var activeList = new List<Dictionary<string, object>>();
            var threads = new List<Thread>();
            var lockObj = new object();

            foreach (int p in portsToScan)
            {
                int port = p;
                Thread t = new Thread(delegate()
                {
                    if (CheckPortActive(port, "127.0.0.1", 300) || CheckPortActive(port, "localhost", 300))
                    {
                        var item = new Dictionary<string, object>();
                        item["port"] = port;
                        string label = "Local Server";
                        if (port == 8080) label = "Pega PRWeb / Tomcat / Java";
                        else if (port == 8069) label = "Odoo ERP";
                        else if (port == 8000) label = "Frappe / ERPNext / Django";
                        else if (port == 7001) label = "Oracle WebLogic / EBS / APEX";
                        else if (port == 7080) label = "MS Dynamics 365 / Business Central";
                        else if (port == 50000) label = "SAP NetWeaver / SAP GUI";
                        else if (port == 8088) label = "Apache OFBiz ERP";
                        else if (port == 8085) label = "Metasfresh ERP";
                        else if (port == 9080) label = "Pega PRPC / WebSphere";
                        else if (port == 8081) label = "Microservices / Spring Boot";
                        else if (port == 9090) label = "Spring Boot / Prometheus";
                        else if (port == 3000) label = "Node.js / React / Next.js";
                        else if (port == 5173) label = "Vite / Vue / Svelte";
                        else if (port == 4200) label = "Angular";
                        else if (port == 5000) label = "Flask / Express / Python";
                        else if (port == 3001) label = "NestJS / Backend";
                        else if (port == 8888) label = "Jupyter / Webmin";
                        else if (port == 8443) label = "HTTPS / Tomcat / OFBiz";
                        else if (port == 80) label = "HTTP / Dolibarr / Apache / Nginx";
                        item["label"] = label;

                        lock (lockObj)
                        {
                            activeList.Add(item);
                        }
                    }
                });
                t.IsBackground = true;
                threads.Add(t);
                t.Start();
            }

            foreach (var t in threads)
            {
                try { t.Join(450); } catch { }
            }

            return activeList;
        }

        public static int FindFreePort(int startPort = 4040)
        {
            int p = startPort;
            while (p < 65535)
            {
                try
                {
                    TcpListener l = new TcpListener(IPAddress.Loopback, p);
                    l.Start();
                    l.Stop();
                    return p;
                }
                catch
                {
                    p++;
                }
            }
            return 4040;
        }

        public int Start(int localPort, int backendPort = 8000, bool enableFullstack = false, bool enableInspector = true)
        {
            Stop();

            LocalPort = localPort;
            BackendPort = backendPort;
            EnableFullstack = enableFullstack;
            EnableInspector = enableInspector;

            InspectorPort = FindFreePort(4040);

            _listener = new HttpListener();
            _listener.Prefixes.Add(string.Format("http://127.0.0.1:{0}/", InspectorPort));
            _listener.Prefixes.Add(string.Format("http://localhost:{0}/", InspectorPort));
            _listener.Start();
            _isRunning = true;

            _listenerThread = new Thread(ListenLoop);
            _listenerThread.IsBackground = true;
            _listenerThread.Start();

            Console.WriteLine(string.Format("[GatewayProxy] Running on 127.0.0.1:{0}", InspectorPort));
            return InspectorPort;
        }

        public void Stop()
        {
            _isRunning = false;
            if (_listener != null)
            {
                try { _listener.Stop(); } catch { }
                try { _listener.Close(); } catch { }
                _listener = null;
            }
        }

        private void ListenLoop()
        {
            while (_isRunning && _listener != null && _listener.IsListening)
            {
                try
                {
                    var ctx = _listener.GetContext();
                    ThreadPool.QueueUserWorkItem(delegate { HandleRequest(ctx); });
                }
                catch (HttpListenerException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    if (!_isRunning) break;
                    Console.WriteLine("Gateway listen error: " + ex.Message);
                }
            }
        }

        private void HandleRequest(HttpListenerContext ctx)
        {
            Stopwatch sw = Stopwatch.StartNew();
            string reqId = "req_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            var req = ctx.Request;
            var res = ctx.Response;

            string clientIp = req.RemoteEndPoint != null ? req.RemoteEndPoint.Address.ToString() : "127.0.0.1";
            string rawUrl = req.RawUrl;

            // CORS headers for all responses
            res.Headers["Access-Control-Allow-Origin"] = "*";
            res.Headers["Access-Control-Allow-Methods"] = "*";
            res.Headers["Access-Control-Allow-Headers"] = "*";

            // Status check endpoint for live auto-reloader
            if (rawUrl == "/__shareport_status__")
            {
                res.Headers["Cache-Control"] = "no-store";
                res.ContentType = "application/json";
                bool active = CheckPortActive(LocalPort, "127.0.0.1", 300);
                var statusDict = new Dictionary<string, object>();
                statusDict["active"] = active;
                statusDict["port"] = LocalPort;
                statusDict["timestamp"] = DateTime.UtcNow.Ticks;
                string json = Serializer.Serialize(statusDict);
                byte[] b = Encoding.UTF8.GetBytes(json);
                res.StatusCode = 200;
                res.ContentLength64 = b.Length;
                res.OutputStream.Write(b, 0, b.Length);
                res.Close();
                return;
            }

            // Logo endpoints
            if (rawUrl == "/logo.png" || rawUrl == "/__shareport_logo__")
            {
                string appDir = AppDomain.CurrentDomain.BaseDirectory;
                string[] candidates = new string[] {
                    Path.Combine(appDir, "logo.png"),
                    Path.Combine(appDir, "public", "logo.png"),
                    Path.Combine(appDir, "dist", "logo.png"),
                    Path.Combine(appDir, "Assets", "StoreLogo.png")
                };
                foreach (string p in candidates)
                {
                    if (File.Exists(p))
                    {
                        byte[] imgBytes = File.ReadAllBytes(p);
                        res.ContentType = "image/png";
                        res.Headers["Cache-Control"] = "public, max-age=86400";
                        res.StatusCode = 200;
                        res.ContentLength64 = imgBytes.Length;
                        res.OutputStream.Write(imgBytes, 0, imgBytes.Length);
                        res.Close();
                        return;
                    }
                }
            }

            // OPTIONS preflight check
            if (req.HttpMethod.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase))
            {
                res.StatusCode = 200;
                res.Close();
                return;
            }

            // Read request body
            byte[] reqBodyBytes = null;
            string reqBodyStr = "";
            if (req.HasEntityBody)
            {
                using (MemoryStream ms = new MemoryStream())
                {
                    req.InputStream.CopyTo(ms);
                    reqBodyBytes = ms.ToArray();
                    if (reqBodyBytes.Length < 100000)
                    {
                        try { reqBodyStr = Encoding.UTF8.GetString(reqBodyBytes); } catch { }
                    }
                }
            }

            // Dictionary of request headers for inspector (safely sanitized against token leaks)
            Dictionary<string, string> reqHeaders = new Dictionary<string, string>();
            for (int i = 0; i < req.Headers.Count; i++)
            {
                string k = req.Headers.GetKey(i);
                string v = req.Headers.Get(i);
                if (k.Equals("Authorization", StringComparison.OrdinalIgnoreCase) ||
                    k.Equals("Proxy-Authorization", StringComparison.OrdinalIgnoreCase) ||
                    k.Equals("X-Api-Key", StringComparison.OrdinalIgnoreCase))
                {
                    v = v.Length > 12 ? v.Substring(0, 7) + "..." + v.Substring(v.Length - 4) : "******";
                }
                reqHeaders[k] = v;
            }

            // Routing: Fullstack API check
            int targetPort = LocalPort;
            bool isApi = rawUrl.StartsWith("/api/", StringComparison.OrdinalIgnoreCase) ||
                         rawUrl.StartsWith("/v1/", StringComparison.OrdinalIgnoreCase) ||
                         rawUrl.StartsWith("/health", StringComparison.OrdinalIgnoreCase) ||
                         rawUrl.StartsWith("/graphql", StringComparison.OrdinalIgnoreCase);

            if (EnableFullstack && isApi && BackendPort > 0)
            {
                targetPort = BackendPort;
            }

            // Extract public Host and Scheme from incoming request
            string publicHost = req.Headers["Host"] ?? "";
            if (string.IsNullOrEmpty(publicHost))
            {
                publicHost = string.Format("127.0.0.1:{0}", targetPort);
            }
            string publicProto = req.Headers["x-forwarded-proto"] ?? (req.IsSecureConnection ? "https" : "https");

            // Attempt direct proxy to 127.0.0.1:<targetPort>
            HttpWebResponse proxyRes = null;
            try
            {
                string forwardUrl = string.Format("http://127.0.0.1:{0}{1}", targetPort, rawUrl);
                HttpWebRequest proxyReq = (HttpWebRequest)WebRequest.Create(forwardUrl);
                proxyReq.Method = req.HttpMethod;
                proxyReq.Timeout = 60000;
                proxyReq.ReadWriteTimeout = 60000;
                proxyReq.KeepAlive = true;
                proxyReq.AllowAutoRedirect = false;
                proxyReq.ServicePoint.Expect100Continue = false;
                proxyReq.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;

                for (int i = 0; i < req.Headers.Count; i++)
                {
                    string k = req.Headers.GetKey(i);
                    string v = req.Headers.Get(i);
                    if (k.Equals("User-Agent", StringComparison.OrdinalIgnoreCase)) proxyReq.UserAgent = v;
                    else if (k.Equals("Accept", StringComparison.OrdinalIgnoreCase)) proxyReq.Accept = v;
                    else if (k.Equals("Content-Type", StringComparison.OrdinalIgnoreCase)) proxyReq.ContentType = v;
                    else if (k.Equals("Content-Length", StringComparison.OrdinalIgnoreCase)) { }
                    else if (k.Equals("Host", StringComparison.OrdinalIgnoreCase))
                    {
                        proxyReq.Host = string.Format("localhost:{0}", targetPort);
                    }
                    else if (k.Equals("Referer", StringComparison.OrdinalIgnoreCase))
                    {
                        // Rewrite referer from publicHost to localhost target so ERP CSRF checks succeed
                        if (!string.IsNullOrEmpty(publicHost) && v.IndexOf(publicHost, StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            v = Regex.Replace(v, Regex.Escape(publicHost), string.Format("localhost:{0}", targetPort), RegexOptions.IgnoreCase);
                            v = Regex.Replace(v, "^https://", "http://", RegexOptions.IgnoreCase);
                        }
                        proxyReq.Referer = v;
                    }
                    else if (k.Equals("Connection", StringComparison.OrdinalIgnoreCase)) { }
                    else if (k.Equals("Expect", StringComparison.OrdinalIgnoreCase)) { }
                    else if (k.Equals("Transfer-Encoding", StringComparison.OrdinalIgnoreCase)) { }
                    else
                    {
                        try { proxyReq.Headers[k] = v; } catch { }
                    }
                }

                // Add standard reverse proxy headers expected by Pega, Odoo, Frappe, and Spring Boot
                proxyReq.Headers["x-forwarded-for"] = clientIp;
                proxyReq.Headers["x-forwarded-proto"] = publicProto;
                proxyReq.Headers["x-forwarded-host"] = publicHost;
                proxyReq.Headers["x-forwarded-port"] = "443";
                proxyReq.Headers["x-original-host"] = publicHost;

                if (reqBodyBytes != null && reqBodyBytes.Length > 0 && req.HttpMethod != "GET" && req.HttpMethod != "HEAD")
                {
                    proxyReq.ContentLength = reqBodyBytes.Length;
                    using (Stream pIn = proxyReq.GetRequestStream())
                    {
                        pIn.Write(reqBodyBytes, 0, reqBodyBytes.Length);
                    }
                }

                try
                {
                    proxyRes = (HttpWebResponse)proxyReq.GetResponse();
                }
                catch (WebException wex)
                {
                    if (wex.Response is HttpWebResponse)
                    {
                        // Target ERP server responded with HTTP status (e.g. 302, 401, 403, 404, 500)
                        proxyRes = (HttpWebResponse)wex.Response;
                    }
                    else
                    {
                        // Target port is closed / idle: fall back to Landing page
                        ServeIdleLanding(req, res, targetPort, BackendPort, EnableFullstack, isApi, reqId, clientIp, reqHeaders, reqBodyStr, sw);
                        return;
                    }
                }
            }
            catch (Exception)
            {
                ServeIdleLanding(req, res, targetPort, BackendPort, EnableFullstack, isApi, reqId, clientIp, reqHeaders, reqBodyStr, sw);
                return;
            }

            // Target responded: Proxy response back to browser
            try
            {
                res.StatusCode = (int)proxyRes.StatusCode;
                res.StatusDescription = proxyRes.StatusDescription;

                Dictionary<string, string> resHeaders = new Dictionary<string, string>();

                // 1. Copy headers
                for (int i = 0; i < proxyRes.Headers.Count; i++)
                {
                    string hk = proxyRes.Headers.GetKey(i);
                    string hv = proxyRes.Headers.Get(i);

                    // Skip headers managed by HttpListenerResponse or handled separately
                    if (hk.Equals("Transfer-Encoding", StringComparison.OrdinalIgnoreCase) ||
                        hk.Equals("Content-Length", StringComparison.OrdinalIgnoreCase) ||
                        hk.Equals("Content-Encoding", StringComparison.OrdinalIgnoreCase) ||
                        hk.Equals("Set-Cookie", StringComparison.OrdinalIgnoreCase) ||
                        hk.Equals("Location", StringComparison.OrdinalIgnoreCase) ||
                        hk.Equals("Server", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    resHeaders[hk] = hv;
                    try { res.Headers[hk] = hv; } catch { }
                }

                // 2. Rewrite Location header for redirects (Pega /prweb, Odoo /web, Frappe /app)
                string location = proxyRes.Headers["Location"];
                if (!string.IsNullOrEmpty(location))
                {
                    // Rewrite http://localhost:PORT or http://127.0.0.1:PORT to https://{publicHost}
                    location = Regex.Replace(location, @"https?://(localhost|127\.0\.0\.1):" + targetPort, "https://" + publicHost, RegexOptions.IgnoreCase);
                    location = Regex.Replace(location, @"https?://(localhost|127\.0\.0\.1)\b", "https://" + publicHost, RegexOptions.IgnoreCase);

                    resHeaders["Location"] = location;
                    try { res.Headers["Location"] = location; } catch { }
                }

                // 3. Process Set-Cookie headers for Pega (JSESSIONID, Pega-RULES), Odoo (session_id), Frappe (sid)
                string[] cookieHeaders = proxyRes.Headers.GetValues("Set-Cookie");
                if (cookieHeaders != null)
                {
                    int cIdx = 0;
                    foreach (string rawCookie in cookieHeaders)
                    {
                        if (string.IsNullOrEmpty(rawCookie)) continue;

                        // Strip Domain=localhost or Domain=127.0.0.1 so browser accepts it on the public tunnel domain
                        string cleaned = Regex.Replace(rawCookie, @";\s*Domain=[^;]+", "", RegexOptions.IgnoreCase);

                        // Ensure Secure attribute so modern browsers accept cookies over HTTPS tunnel
                        if (cleaned.IndexOf("Secure", StringComparison.OrdinalIgnoreCase) < 0)
                        {
                            cleaned += "; Secure";
                        }
                        // Ensure SameSite attribute
                        if (cleaned.IndexOf("SameSite", StringComparison.OrdinalIgnoreCase) < 0)
                        {
                            cleaned += "; SameSite=Lax";
                        }

                        resHeaders["Set-Cookie[" + cIdx++ + "]"] = cleaned;
                        try { res.AppendHeader("Set-Cookie", cleaned); } catch { }
                    }
                }

                // 4. Read response body
                byte[] resBytes = null;
                string resBodyStr = "";
                using (Stream pOut = proxyRes.GetResponseStream())
                {
                    if (pOut != null)
                    {
                        using (MemoryStream ms = new MemoryStream())
                        {
                            pOut.CopyTo(ms);
                            resBytes = ms.ToArray();
                        }
                    }
                }

                // 5. URL content rewriting for HTML and JavaScript (rewriting internal localhost links in Pega/ERPs)
                string contentType = proxyRes.ContentType ?? "";
                bool isTextOrHtml = contentType.IndexOf("text/html", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                    contentType.IndexOf("text/javascript", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                    contentType.IndexOf("application/javascript", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                    contentType.IndexOf("application/json", StringComparison.OrdinalIgnoreCase) >= 0;

                if (isTextOrHtml && resBytes != null && resBytes.Length > 0 && !string.IsNullOrEmpty(publicHost))
                {
                    try
                    {
                        string bodyStr = Encoding.UTF8.GetString(resBytes);
                        string rewritten = bodyStr;

                        // Rewrite http://localhost:PORT or http://127.0.0.1:PORT to https://{publicHost}
                        rewritten = Regex.Replace(rewritten, @"http://(localhost|127\.0\.0\.1):" + targetPort, "https://" + publicHost, RegexOptions.IgnoreCase);
                        rewritten = Regex.Replace(rewritten, @"http://(localhost|127\.0\.0\.1)/prweb", "https://" + publicHost + "/prweb", RegexOptions.IgnoreCase);

                        if (rewritten != bodyStr)
                        {
                            resBytes = Encoding.UTF8.GetBytes(rewritten);
                        }
                        resBodyStr = rewritten;
                    }
                    catch
                    {
                        try { resBodyStr = Encoding.UTF8.GetString(resBytes); } catch { }
                    }
                }
                else if (resBytes != null && resBytes.Length < 50000)
                {
                    try { resBodyStr = Encoding.UTF8.GetString(resBytes); } catch { }
                }

                if (resBytes != null)
                {
                    res.ContentLength64 = resBytes.Length;
                    res.OutputStream.Write(resBytes, 0, resBytes.Length);
                }
                res.Close();
                proxyRes.Close();

                if (EnableInspector)
                {
                    var log = new Dictionary<string, object>();
                    log["id"] = reqId;
                    log["timestamp"] = DateTime.Now.ToString("HH:mm:ss");
                    log["method"] = req.HttpMethod;
                    log["path"] = rawUrl;
                    log["status"] = (int)proxyRes.StatusCode;
                    log["durationMs"] = sw.ElapsedMilliseconds;
                    log["clientIp"] = clientIp;
                    log["reqHeaders"] = reqHeaders;
                    log["reqBody"] = reqBodyStr;
                    log["resHeaders"] = resHeaders;
                    log["resBody"] = resBodyStr.Length > 20000 ? resBodyStr.Substring(0, 20000) + "... (truncated)" : resBodyStr;
                    RecordLog(log);
                }
            }
            catch (Exception ex)
            {
                try { res.Close(); } catch { }
                try { if (proxyRes != null) proxyRes.Close(); } catch { }
                Console.WriteLine("Proxy response write error: " + ex.Message);
            }
        }

        private void ServeIdleLanding(HttpListenerRequest req, HttpListenerResponse res, int targetPort, int backendPort, bool enableFullstack, bool isApi, string reqId, string clientIp, Dictionary<string, string> reqHeaders, string reqBodyStr, Stopwatch sw)
        {
            try
            {
                string acceptHeader = req.Headers["Accept"] != null ? req.Headers["Accept"] : "";
                if (isApi || acceptHeader.IndexOf("application/json", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    var apiMsg = new Dictionary<string, object>();
                    apiMsg["status"] = "online";
                    apiMsg["gateway"] = "SHARE PORT";
                    apiMsg["message"] = string.Format("Target port {0} is currently idle. Start your local server or ERP to handle requests.", targetPort);
                    apiMsg["port"] = targetPort;
                    apiMsg["timestamp"] = DateTime.UtcNow.ToString("o");

                    string json = Serializer.Serialize(apiMsg);
                    byte[] outBytes = Encoding.UTF8.GetBytes(json);
                    res.ContentType = "application/json";
                    res.StatusCode = 200;
                    res.ContentLength64 = outBytes.Length;
                    res.OutputStream.Write(outBytes, 0, outBytes.Length);
                    res.Close();

                    if (EnableInspector)
                    {
                        var log = new Dictionary<string, object>();
                        log["id"] = reqId;
                        log["timestamp"] = DateTime.Now.ToString("HH:mm:ss");
                        log["method"] = req.HttpMethod;
                        log["path"] = req.RawUrl;
                        log["status"] = 200;
                        log["durationMs"] = sw.ElapsedMilliseconds;
                        log["clientIp"] = clientIp;
                        log["reqHeaders"] = reqHeaders;
                        log["reqBody"] = reqBodyStr;
                        log["resHeaders"] = new Dictionary<string, string> { { "content-type", "application/json" } };
                        log["resBody"] = json;
                        RecordLog(log);
                    }
                }
                else
                {
                    string html = GetLandingHtml(targetPort, backendPort, enableFullstack);
                    byte[] outBytes = Encoding.UTF8.GetBytes(html);
                    res.ContentType = "text/html; charset=utf-8";
                    res.StatusCode = 200;
                    res.ContentLength64 = outBytes.Length;
                    res.OutputStream.Write(outBytes, 0, outBytes.Length);
                    res.Close();

                    if (EnableInspector)
                    {
                        var log = new Dictionary<string, object>();
                        log["id"] = reqId;
                        log["timestamp"] = DateTime.Now.ToString("HH:mm:ss");
                        log["method"] = req.HttpMethod;
                        log["path"] = req.RawUrl;
                        log["status"] = 200;
                        log["durationMs"] = sw.ElapsedMilliseconds;
                        log["clientIp"] = clientIp;
                        log["reqHeaders"] = reqHeaders;
                        log["reqBody"] = reqBodyStr;
                        log["resHeaders"] = new Dictionary<string, string> { { "content-type", "text/html" } };
                        log["resBody"] = "200 OK Demo Landing HTML";
                        RecordLog(log);
                    }
                }
            }
            catch { }
        }

        private string GetLandingHtml(int port, int backendPort, bool enableFullstack)
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string landingFile = Path.Combine(appDir, "Assets", "landing.html");
            if (!File.Exists(landingFile))
            {
                landingFile = Path.Combine(appDir, "assets", "landing.html");
            }
            if (!File.Exists(landingFile))
            {
                landingFile = Path.Combine(appDir, "landing.html");
            }

            string template = "";
            if (File.Exists(landingFile))
            {
                try { template = File.ReadAllText(landingFile); } catch { }
            }

            if (string.IsNullOrEmpty(template))
            {
                template = "<html><body><h1>SHARE PORT Gateway</h1><p>Listening for localhost:" + port + "</p></body></html>";
            }

            string fullstackDesc = enableFullstack && backendPort > 0 ? string.Format(" (Backend: <strong>http://127.0.0.1:{0}</strong>)", backendPort) : "";
            return template.Replace("{PORT}", port.ToString()).Replace("{FULLSTACK_DESC}", fullstackDesc);
        }
    }
}
