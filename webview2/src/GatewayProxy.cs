using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
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

        public static bool CheckPortActive(int port, string host = "127.0.0.1", int timeoutMs = 80)
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
                bool active = CheckPortActive(LocalPort);
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

            // Read request body
            byte[] reqBodyBytes = null;
            string reqBodyStr = "";
            if (req.HasEntityBody)
            {
                using (MemoryStream ms = new MemoryStream())
                {
                    req.InputStream.CopyTo(ms);
                    reqBodyBytes = ms.ToArray();
                    try { reqBodyStr = Encoding.UTF8.GetString(reqBodyBytes); } catch { }
                }
            }

            // Dictionary of request headers for inspector (safely sanitized against token/cookie leaks)
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
                else if (k.Equals("Cookie", StringComparison.OrdinalIgnoreCase))
                {
                    v = "[PROTECTED_SESSION_COOKIE]";
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

            bool isTargetActive = CheckPortActive(targetPort);

            if (!isTargetActive)
            {
                // Fallback: If user has not started local server yet, return clean Demo Landing HTML or JSON
                if (req.HttpMethod.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase))
                {
                    res.StatusCode = 200;
                    res.Close();
                    return;
                }

                string acceptHeader = req.Headers["Accept"] != null ? req.Headers["Accept"] : "";
                if (isApi || acceptHeader.IndexOf("application/json", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    var apiMsg = new Dictionary<string, object>();
                    apiMsg["status"] = "online";
                    apiMsg["gateway"] = "SHARE PORT";
                    apiMsg["message"] = string.Format("Target port {0} is currently idle. Start your local server to handle requests.", targetPort);
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
                        log["path"] = rawUrl;
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
                    string html = GetLandingHtml(targetPort, BackendPort, EnableFullstack);
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
                        log["path"] = rawUrl;
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
                return;
            }

            // Target port is ACTIVE: Proxy request to 127.0.0.1:<targetPort>
            try
            {
                string forwardUrl = string.Format("http://127.0.0.1:{0}{1}", targetPort, rawUrl);
                HttpWebRequest proxyReq = (HttpWebRequest)WebRequest.Create(forwardUrl);
                proxyReq.Method = req.HttpMethod;
                proxyReq.Timeout = 30000;
                proxyReq.ReadWriteTimeout = 30000;
                proxyReq.KeepAlive = true;
                proxyReq.AllowAutoRedirect = false;

                for (int i = 0; i < req.Headers.Count; i++)
                {
                    string k = req.Headers.GetKey(i);
                    string v = req.Headers.Get(i);
                    if (k.Equals("User-Agent", StringComparison.OrdinalIgnoreCase)) proxyReq.UserAgent = v;
                    else if (k.Equals("Accept", StringComparison.OrdinalIgnoreCase)) proxyReq.Accept = v;
                    else if (k.Equals("Content-Type", StringComparison.OrdinalIgnoreCase)) proxyReq.ContentType = v;
                    else if (k.Equals("Content-Length", StringComparison.OrdinalIgnoreCase)) { }
                    else if (k.Equals("Host", StringComparison.OrdinalIgnoreCase)) proxyReq.Host = string.Format("localhost:{0}", targetPort);
                    else if (k.Equals("Referer", StringComparison.OrdinalIgnoreCase)) proxyReq.Referer = v;
                    else
                    {
                        try { proxyReq.Headers[k] = v; } catch { }
                    }
                }

                proxyReq.Headers["x-forwarded-for"] = clientIp;
                proxyReq.Headers["x-forwarded-proto"] = "https";

                if (reqBodyBytes != null && reqBodyBytes.Length > 0 && req.HttpMethod != "GET" && req.HttpMethod != "HEAD")
                {
                    proxyReq.ContentLength = reqBodyBytes.Length;
                    using (Stream pIn = proxyReq.GetRequestStream())
                    {
                        pIn.Write(reqBodyBytes, 0, reqBodyBytes.Length);
                    }
                }

                HttpWebResponse proxyRes = null;
                try
                {
                    proxyRes = (HttpWebResponse)proxyReq.GetResponse();
                }
                catch (WebException wex)
                {
                    if (wex.Response is HttpWebResponse)
                    {
                        proxyRes = (HttpWebResponse)wex.Response;
                    }
                    else
                    {
                        throw;
                    }
                }

                if (proxyRes != null)
                {
                    res.StatusCode = (int)proxyRes.StatusCode;
                    res.StatusDescription = proxyRes.StatusDescription;

                    Dictionary<string, string> resHeaders = new Dictionary<string, string>();
                    for (int i = 0; i < proxyRes.Headers.Count; i++)
                    {
                        string hk = proxyRes.Headers.GetKey(i);
                        string hv = proxyRes.Headers.Get(i);
                        if (hk.Equals("Set-Cookie", StringComparison.OrdinalIgnoreCase))
                        {
                            resHeaders[hk] = "[PROTECTED_SET_COOKIE]";
                        }
                        else
                        {
                            resHeaders[hk] = hv;
                        }

                        if (!hk.Equals("Transfer-Encoding", StringComparison.OrdinalIgnoreCase) &&
                            !hk.Equals("Content-Length", StringComparison.OrdinalIgnoreCase))
                        {
                            try { res.Headers[hk] = hv; } catch { }
                        }
                    }

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
                                try { resBodyStr = Encoding.UTF8.GetString(resBytes); } catch { }
                            }
                        }
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
            }
            catch (Exception)
            {
                // Fallback to landing HTML on proxy error
                string html = GetLandingHtml(targetPort, BackendPort, EnableFullstack);
                byte[] outBytes = Encoding.UTF8.GetBytes(html);
                res.ContentType = "text/html; charset=utf-8";
                res.StatusCode = 200;
                res.ContentLength64 = outBytes.Length;
                res.OutputStream.Write(outBytes, 0, outBytes.Length);
                res.Close();
            }
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
