using System;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace SharePort.WebView2App
{
    public class GatewayProxy
    {
        private TcpListener _tcpListener;
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

            _tcpListener = new TcpListener(IPAddress.Loopback, InspectorPort);
            _tcpListener.Start(200);
            _isRunning = true;

            _listenerThread = new Thread(ListenLoop);
            _listenerThread.IsBackground = true;
            _listenerThread.Start();

            Console.WriteLine(string.Format("[GatewayProxy] Pure Socket Proxy Running on 127.0.0.1:{0}", InspectorPort));
            return InspectorPort;
        }

        public void Stop()
        {
            _isRunning = false;
            if (_tcpListener != null)
            {
                try { _tcpListener.Stop(); } catch { }
                _tcpListener = null;
            }
        }

        private void ListenLoop()
        {
            while (_isRunning && _tcpListener != null)
            {
                try
                {
                    TcpClient client = _tcpListener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(delegate { HandleClient(client); });
                }
                catch (SocketException)
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

        private void HandleClient(TcpClient client)
        {
            try
            {
                client.NoDelay = true;
                client.ReceiveTimeout = 60000;
                client.SendTimeout = 60000;

                NetworkStream clientStream = client.GetStream();

                while (_isRunning && client.Connected)
                {
                    byte[] headerBytes;
                    byte[] bodyPrefix;
                    int headerLen;

                    if (!ReadHttpHeader(clientStream, out headerBytes, out bodyPrefix, out headerLen))
                    {
                        break;
                    }

                    string headerStr = Encoding.UTF8.GetString(headerBytes, 0, headerLen);
                    string[] lines = headerStr.Split(new string[] { "\r\n", "\n" }, StringSplitOptions.None);
                    if (lines.Length == 0 || string.IsNullOrEmpty(lines[0])) break;

                    string requestLine = lines[0].Trim();
                    string[] reqParts = requestLine.Split(' ');
                    if (reqParts.Length < 2) break;

                    string method = reqParts[0].ToUpperInvariant();
                    string rawUrl = reqParts[1];
                    string httpVersion = reqParts.Length > 2 ? reqParts[2] : "HTTP/1.1";

                    var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    var headerList = new List<KeyValuePair<string, string>>();

                    for (int i = 1; i < lines.Length; i++)
                    {
                        string line = lines[i];
                        if (string.IsNullOrEmpty(line)) continue;
                        int colon = line.IndexOf(':');
                        if (colon > 0)
                        {
                            string k = line.Substring(0, colon).Trim();
                            string v = line.Substring(colon + 1).Trim();
                            headers[k] = v;
                            headerList.Add(new KeyValuePair<string, string>(k, v));
                        }
                    }

                    string clientIp = "127.0.0.1";
                    try
                    {
                        if (headers.ContainsKey("cf-connecting-ip") && !string.IsNullOrEmpty(headers["cf-connecting-ip"]))
                        {
                            clientIp = headers["cf-connecting-ip"];
                        }
                        else if (headers.ContainsKey("x-forwarded-for") && !string.IsNullOrEmpty(headers["x-forwarded-for"]))
                        {
                            clientIp = headers["x-forwarded-for"].Split(',')[0].Trim();
                        }
                        else if (client.Client.RemoteEndPoint != null)
                        {
                            clientIp = ((IPEndPoint)client.Client.RemoteEndPoint).Address.ToString();
                        }
                    }
                    catch { }

                    // Status check endpoint for live auto-reloader
                    if (rawUrl == "/__shareport_status__")
                    {
                        bool active = CheckPortActive(LocalPort, "127.0.0.1", 300);
                        var statusDict = new Dictionary<string, object>();
                        statusDict["active"] = active;
                        statusDict["port"] = LocalPort;
                        statusDict["timestamp"] = DateTime.UtcNow.Ticks;
                        string json = Serializer.Serialize(statusDict);
                        byte[] b = Encoding.UTF8.GetBytes(json);
                        SendSimpleResponse(clientStream, 200, "OK", "application/json", b);
                        break;
                    }

                    // Logo endpoints
                    if (rawUrl == "/logo.png" || rawUrl == "/__shareport_logo__")
                    {
                        byte[] imgBytes = GetLogoBytes();
                        if (imgBytes != null)
                        {
                            SendSimpleResponse(clientStream, 200, "OK", "image/png", imgBytes);
                        }
                        else
                        {
                            SendSimpleResponse(clientStream, 404, "Not Found", "text/plain", new byte[0]);
                        }
                        break;
                    }

                    // Preflight OPTIONS request
                    if (method == "OPTIONS")
                    {
                        string clientOrigin = headers.ContainsKey("Origin") ? headers["Origin"] : "*";
                        StringBuilder sb = new StringBuilder();
                        sb.Append("HTTP/1.1 200 OK\r\n");
                        sb.Append("Access-Control-Allow-Origin: " + (!string.IsNullOrEmpty(clientOrigin) ? clientOrigin : "*") + "\r\n");
                        sb.Append("Access-Control-Allow-Credentials: true\r\n");
                        sb.Append("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD\r\n");
                        string reqHead = headers.ContainsKey("Access-Control-Request-Headers") ? headers["Access-Control-Request-Headers"] : "*";
                        sb.Append("Access-Control-Allow-Headers: " + reqHead + "\r\n");
                        sb.Append("Access-Control-Max-Age: 86400\r\n");
                        sb.Append("Content-Length: 0\r\n");
                        sb.Append("Connection: close\r\n\r\n");
                        byte[] optBytes = Encoding.ASCII.GetBytes(sb.ToString());
                        clientStream.Write(optBytes, 0, optBytes.Length);
                        clientStream.Flush();
                        break;
                    }

                    // Determine Target Port
                    bool isApi = IsBackendApiRequest(method, rawUrl, headers);
                    int targetPort = (EnableFullstack && isApi && BackendPort > 0) ? BackendPort : LocalPort;

                    // WebSocket upgrade request
                    bool isWs = headers.ContainsKey("Upgrade") && headers["Upgrade"].IndexOf("websocket", StringComparison.OrdinalIgnoreCase) >= 0;
                    if (isWs)
                    {
                        bool isViteHmr = rawUrl.IndexOf("/@vite", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                         rawUrl.IndexOf("/vite-hmr", StringComparison.OrdinalIgnoreCase) >= 0;
                        int wsTargetPort = (EnableFullstack && !isViteHmr && BackendPort > 0) ? BackendPort : LocalPort;
                        HandleWebSocketDirect(clientStream, wsTargetPort, requestLine, headerList, bodyPrefix, rawUrl, clientIp, headers);
                        return;
                    }

                    // Read request body if Content-Length specified
                    long contentLength = 0;
                    if (headers.ContainsKey("Content-Length"))
                    {
                        long.TryParse(headers["Content-Length"], out contentLength);
                    }

                    byte[] reqBodyBytes = null;
                    string reqBodyStr = "";
                    if (contentLength > 0)
                    {
                        reqBodyBytes = new byte[contentLength];
                        int prefixLen = Math.Min(bodyPrefix.Length, (int)contentLength);
                        if (prefixLen > 0)
                        {
                            Array.Copy(bodyPrefix, 0, reqBodyBytes, 0, prefixLen);
                        }
                        int needed = (int)contentLength - prefixLen;
                        int offset = prefixLen;
                        while (needed > 0)
                        {
                            int r = clientStream.Read(reqBodyBytes, offset, needed);
                            if (r <= 0) break;
                            offset += r;
                            needed -= r;
                        }
                        if (reqBodyBytes.Length < 100000)
                        {
                            try { reqBodyStr = Encoding.UTF8.GetString(reqBodyBytes); } catch { }
                        }
                    }

                    // Extract publicHost & publicProto
                    string publicHost = "";
                    if (headers.ContainsKey("x-forwarded-host") && !string.IsNullOrEmpty(headers["x-forwarded-host"]))
                    {
                        publicHost = headers["x-forwarded-host"];
                    }
                    else if (headers.ContainsKey("Host") && !string.IsNullOrEmpty(headers["Host"]))
                    {
                        string h = headers["Host"];
                        if (h.IndexOf("127.0.0.1", StringComparison.OrdinalIgnoreCase) < 0 &&
                            h.IndexOf("localhost", StringComparison.OrdinalIgnoreCase) < 0)
                        {
                            publicHost = h;
                        }
                    }
                    if (string.IsNullOrEmpty(publicHost))
                    {
                        publicHost = string.Format("127.0.0.1:{0}", targetPort);
                    }

                    string publicProto = "https";
                    if (headers.ContainsKey("x-forwarded-proto") && !string.IsNullOrEmpty(headers["x-forwarded-proto"]))
                    {
                        publicProto = headers["x-forwarded-proto"];
                    }

                    // Proxy to target server
                    bool shouldClose = ProxyHttpRequest(clientStream, targetPort, method, rawUrl, headerList, headers, reqBodyBytes, reqBodyStr, clientIp, publicHost, publicProto, isApi);
                    if (shouldClose) break;
                }
            }
            catch { }
            finally
            {
                try { client.Close(); } catch { }
            }
        }

        private bool ProxyHttpRequest(NetworkStream clientStream, int targetPort, string method, string rawUrl, List<KeyValuePair<string, string>> headerList, Dictionary<string, string> headers, byte[] reqBodyBytes, string reqBodyStr, string clientIp, string publicHost, string publicProto, bool isApi)
        {
            Stopwatch sw = Stopwatch.StartNew();
            string reqId = "req_" + Guid.NewGuid().ToString("N").Substring(0, 8);

            TcpClient targetClient = new TcpClient();
            targetClient.NoDelay = true;
            targetClient.ReceiveTimeout = 60000;
            targetClient.SendTimeout = 60000;

            try
            {
                var connectResult = targetClient.BeginConnect("127.0.0.1", targetPort, null, null);
                bool connected = connectResult.AsyncWaitHandle.WaitOne(3000);
                if (!connected)
                {
                    ServeIdleLanding(clientStream, method, rawUrl, headers, reqBodyStr, targetPort, isApi, reqId, clientIp, sw);
                    return true;
                }
                targetClient.EndConnect(connectResult);
            }
            catch
            {
                ServeIdleLanding(clientStream, method, rawUrl, headers, reqBodyStr, targetPort, isApi, reqId, clientIp, sw);
                return true;
            }

            try
            {
                NetworkStream targetStream = targetClient.GetStream();

                // Build outgoing request headers
                StringBuilder reqSb = new StringBuilder();
                reqSb.Append(string.Format("{0} {1} HTTP/1.1\r\n", method, rawUrl));

                bool hostWritten = false;
                bool xffWritten = false;
                bool xfpWritten = false;
                bool xfhWritten = false;
                bool xfpPortWritten = false;
                bool xohWritten = false;
                bool connWritten = false;

                foreach (var kv in headerList)
                {
                    string k = kv.Key;
                    string v = kv.Value;

                    if (k.Equals("Host", StringComparison.OrdinalIgnoreCase))
                    {
                        reqSb.Append(string.Format("Host: localhost:{0}\r\n", targetPort));
                        hostWritten = true;
                    }
                    else if (k.Equals("Referer", StringComparison.OrdinalIgnoreCase))
                    {
                        if (!string.IsNullOrEmpty(publicHost) && v.IndexOf(publicHost, StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            v = Regex.Replace(v, Regex.Escape(publicHost), string.Format("localhost:{0}", targetPort), RegexOptions.IgnoreCase);
                            v = Regex.Replace(v, "^https://", "http://", RegexOptions.IgnoreCase);
                        }
                        reqSb.Append(string.Format("Referer: {0}\r\n", v));
                    }
                    else if (k.Equals("Origin", StringComparison.OrdinalIgnoreCase))
                    {
                        reqSb.Append(string.Format("Origin: http://localhost:{0}\r\n", targetPort));
                    }
                    else if (k.Equals("Connection", StringComparison.OrdinalIgnoreCase))
                    {
                        reqSb.Append("Connection: close\r\n");
                        connWritten = true;
                    }
                    else if (k.Equals("x-forwarded-for", StringComparison.OrdinalIgnoreCase))
                    {
                        reqSb.Append(string.Format("x-forwarded-for: {0}\r\n", clientIp));
                        xffWritten = true;
                    }
                    else if (k.Equals("x-forwarded-proto", StringComparison.OrdinalIgnoreCase))
                    {
                        reqSb.Append(string.Format("x-forwarded-proto: {0}\r\n", publicProto));
                        xfpWritten = true;
                    }
                    else if (k.Equals("x-forwarded-host", StringComparison.OrdinalIgnoreCase))
                    {
                        reqSb.Append(string.Format("x-forwarded-host: {0}\r\n", publicHost));
                        xfhWritten = true;
                    }
                    else if (k.Equals("x-forwarded-port", StringComparison.OrdinalIgnoreCase))
                    {
                        reqSb.Append("x-forwarded-port: 443\r\n");
                        xfpPortWritten = true;
                    }
                    else if (k.Equals("x-original-host", StringComparison.OrdinalIgnoreCase))
                    {
                        reqSb.Append(string.Format("x-original-host: {0}\r\n", publicHost));
                        xohWritten = true;
                    }
                    else
                    {
                        reqSb.Append(string.Format("{0}: {1}\r\n", k, v));
                    }
                }

                if (!hostWritten) reqSb.Append(string.Format("Host: localhost:{0}\r\n", targetPort));
                if (!xffWritten) reqSb.Append(string.Format("x-forwarded-for: {0}\r\n", clientIp));
                if (!xfpWritten) reqSb.Append(string.Format("x-forwarded-proto: {0}\r\n", publicProto));
                if (!xfhWritten) reqSb.Append(string.Format("x-forwarded-host: {0}\r\n", publicHost));
                if (!xfpPortWritten) reqSb.Append("x-forwarded-port: 443\r\n");
                if (!xohWritten) reqSb.Append(string.Format("x-original-host: {0}\r\n", publicHost));
                if (!connWritten) reqSb.Append("Connection: close\r\n");

                reqSb.Append("\r\n");

                byte[] outReqHead = Encoding.UTF8.GetBytes(reqSb.ToString());
                targetStream.Write(outReqHead, 0, outReqHead.Length);

                if (reqBodyBytes != null && reqBodyBytes.Length > 0)
                {
                    targetStream.Write(reqBodyBytes, 0, reqBodyBytes.Length);
                }
                targetStream.Flush();

                // Read target response
                byte[] resHeadBytes;
                byte[] resBodyPrefix;
                int resHeadLen;

                if (!ReadHttpHeader(targetStream, out resHeadBytes, out resBodyPrefix, out resHeadLen))
                {
                    ServeIdleLanding(clientStream, method, rawUrl, headers, reqBodyStr, targetPort, isApi, reqId, clientIp, sw);
                    return true;
                }

                string resHeadStr = Encoding.UTF8.GetString(resHeadBytes, 0, resHeadLen);
                string[] resLines = resHeadStr.Split(new string[] { "\r\n", "\n" }, StringSplitOptions.None);
                string statusLine = resLines.Length > 0 ? resLines[0].Trim() : "HTTP/1.1 200 OK";

                int statusCode = 200;
                string[] statusParts = statusLine.Split(' ');
                if (statusParts.Length > 1) int.TryParse(statusParts[1], out statusCode);

                var resHeaders = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                var rawResHeaderList = new List<KeyValuePair<string, string>>();

                for (int i = 1; i < resLines.Length; i++)
                {
                    string line = resLines[i];
                    if (string.IsNullOrEmpty(line)) continue;
                    int colon = line.IndexOf(':');
                    if (colon > 0)
                    {
                        string k = line.Substring(0, colon).Trim();
                        string v = line.Substring(colon + 1).Trim();
                        resHeaders[k] = v;
                        rawResHeaderList.Add(new KeyValuePair<string, string>(k, v));
                    }
                }

                string contentType = resHeaders.ContainsKey("Content-Type") ? resHeaders["Content-Type"] : "";
                bool isSse = contentType.IndexOf("text/event-stream", StringComparison.OrdinalIgnoreCase) >= 0;

                if (isSse)
                {
                    // Stream Server-Sent Events (AI token streaming, real-time live events) immediately
                    StringBuilder sseSb = new StringBuilder();
                    sseSb.Append(statusLine + "\r\n");
                    string sseOrigin = headers.ContainsKey("Origin") ? headers["Origin"] : "*";
                    sseSb.Append("Access-Control-Allow-Origin: " + (!string.IsNullOrEmpty(sseOrigin) ? sseOrigin : "*") + "\r\n");
                    sseSb.Append("Access-Control-Allow-Credentials: true\r\n");
                    sseSb.Append("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD\r\n");
                    sseSb.Append("Access-Control-Allow-Headers: *\r\n");
                    sseSb.Append("Cache-Control: no-cache\r\n");
                    sseSb.Append("Content-Type: text/event-stream\r\n");
                    sseSb.Append("Connection: close\r\n\r\n");

                    byte[] sseHead = Encoding.UTF8.GetBytes(sseSb.ToString());
                    clientStream.Write(sseHead, 0, sseHead.Length);
                    if (resBodyPrefix.Length > 0)
                    {
                        clientStream.Write(resBodyPrefix, 0, resBodyPrefix.Length);
                        clientStream.Flush();
                    }

                    byte[] sseBuf = new byte[4096];
                    int sseRead;
                    while ((sseRead = targetStream.Read(sseBuf, 0, sseBuf.Length)) > 0)
                    {
                        clientStream.Write(sseBuf, 0, sseRead);
                        clientStream.Flush();
                    }
                    return true;
                }

                // Read target response body
                byte[] resBodyBytes = null;
                bool isChunked = resHeaders.ContainsKey("Transfer-Encoding") && resHeaders["Transfer-Encoding"].IndexOf("chunked", StringComparison.OrdinalIgnoreCase) >= 0;

                if (isChunked)
                {
                    resBodyBytes = ReadChunkedBody(targetStream, resBodyPrefix);
                }
                else if (resHeaders.ContainsKey("Content-Length"))
                {
                    long resContentLen = 0;
                    long.TryParse(resHeaders["Content-Length"], out resContentLen);
                    resBodyBytes = new byte[resContentLen];
                    int prefLen = Math.Min(resBodyPrefix.Length, (int)resContentLen);
                    if (prefLen > 0)
                    {
                        Array.Copy(resBodyPrefix, 0, resBodyBytes, 0, prefLen);
                    }
                    int needed = (int)resContentLen - prefLen;
                    int offset = prefLen;
                    while (needed > 0)
                    {
                        int r = targetStream.Read(resBodyBytes, offset, needed);
                        if (r <= 0) break;
                        offset += r;
                        needed -= r;
                    }
                }
                else
                {
                    // Read until EOF
                    using (MemoryStream ms = new MemoryStream())
                    {
                        if (resBodyPrefix.Length > 0) ms.Write(resBodyPrefix, 0, resBodyPrefix.Length);
                        byte[] buf = new byte[8192];
                        int r;
                        while ((r = targetStream.Read(buf, 0, buf.Length)) > 0)
                        {
                            ms.Write(buf, 0, r);
                        }
                        resBodyBytes = ms.ToArray();
                    }
                }

                if (resBodyBytes == null) resBodyBytes = new byte[0];

                // URL content rewriting for HTML, JS, JSON
                string contentEncoding = resHeaders.ContainsKey("Content-Encoding") ? resHeaders["Content-Encoding"] : "";
                bool isTextOrHtml = contentType.IndexOf("text/html", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                    contentType.IndexOf("text/javascript", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                    contentType.IndexOf("application/javascript", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                    contentType.IndexOf("application/json", StringComparison.OrdinalIgnoreCase) >= 0;

                string resBodyStr = "";
                bool removeEncodingHeader = false;

                if (isTextOrHtml && resBodyBytes.Length > 0 && !string.IsNullOrEmpty(publicHost))
                {
                    try
                    {
                        byte[] textBytes = resBodyBytes;
                        bool wasGzip = false;

                        if (contentEncoding.IndexOf("gzip", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            try
                            {
                                using (var msIn = new MemoryStream(resBodyBytes))
                                using (var gz = new GZipStream(msIn, CompressionMode.Decompress))
                                using (var msOut = new MemoryStream())
                                {
                                    gz.CopyTo(msOut);
                                    textBytes = msOut.ToArray();
                                    wasGzip = true;
                                }
                            }
                            catch { }
                        }

                        string bodyStr = Encoding.UTF8.GetString(textBytes);
                        string rewritten = bodyStr;

                        rewritten = Regex.Replace(rewritten, @"http://(localhost|127\.0\.0\.1):" + targetPort, "https://" + publicHost, RegexOptions.IgnoreCase);
                        rewritten = Regex.Replace(rewritten, @"http://(localhost|127\.0\.0\.1)/prweb", "https://" + publicHost + "/prweb", RegexOptions.IgnoreCase);

                        if (EnableFullstack && BackendPort > 0)
                        {
                            rewritten = Regex.Replace(rewritten, @"http://(localhost|127\.0\.0\.1):" + BackendPort, "https://" + publicHost, RegexOptions.IgnoreCase);
                            rewritten = Regex.Replace(rewritten, @"ws://(localhost|127\.0\.0\.1):" + BackendPort, "wss://" + publicHost, RegexOptions.IgnoreCase);
                        }

                        if (rewritten != bodyStr)
                        {
                            resBodyBytes = Encoding.UTF8.GetBytes(rewritten);
                            if (wasGzip) removeEncodingHeader = true;
                        }

                        resBodyStr = rewritten;
                    }
                    catch
                    {
                        try { resBodyStr = Encoding.UTF8.GetString(resBodyBytes); } catch { }
                    }
                }
                else if (resBodyBytes.Length < 30000)
                {
                    try { resBodyStr = Encoding.UTF8.GetString(resBodyBytes); } catch { }
                }

                // Prepare response headers to client
                StringBuilder resSb = new StringBuilder();
                resSb.Append(statusLine + "\r\n");

                string clientOrigin = headers.ContainsKey("Origin") ? headers["Origin"] : "*";
                resSb.Append("Access-Control-Allow-Origin: " + (!string.IsNullOrEmpty(clientOrigin) ? clientOrigin : "*") + "\r\n");
                resSb.Append("Access-Control-Allow-Credentials: true\r\n");
                resSb.Append("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD\r\n");
                resSb.Append("Access-Control-Allow-Headers: *\r\n");

                var loggedResHeaders = new Dictionary<string, string>();
                int cIdx = 0;

                foreach (var kv in rawResHeaderList)
                {
                    string hk = kv.Key;
                    string hv = kv.Value;

                    if (hk.Equals("Transfer-Encoding", StringComparison.OrdinalIgnoreCase) ||
                        hk.Equals("Content-Length", StringComparison.OrdinalIgnoreCase) ||
                        hk.Equals("Access-Control-Allow-Origin", StringComparison.OrdinalIgnoreCase) ||
                        hk.Equals("Access-Control-Allow-Credentials", StringComparison.OrdinalIgnoreCase) ||
                        hk.Equals("Access-Control-Allow-Methods", StringComparison.OrdinalIgnoreCase) ||
                        hk.Equals("Access-Control-Allow-Headers", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    if (removeEncodingHeader && hk.Equals("Content-Encoding", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    if (hk.Equals("Location", StringComparison.OrdinalIgnoreCase))
                    {
                        hv = Regex.Replace(hv, @"https?://(localhost|127\.0\.0\.1):" + targetPort, "https://" + publicHost, RegexOptions.IgnoreCase);
                        hv = Regex.Replace(hv, @"https?://(localhost|127\.0\.0\.1)\b", "https://" + publicHost, RegexOptions.IgnoreCase);
                        resSb.Append(string.Format("Location: {0}\r\n", hv));
                        loggedResHeaders["Location"] = hv;
                        continue;
                    }

                    if (hk.Equals("Set-Cookie", StringComparison.OrdinalIgnoreCase))
                    {
                        string cleaned = Regex.Replace(hv, @";\s*Domain=[^;]+", "", RegexOptions.IgnoreCase);
                        if (cleaned.IndexOf("Secure", StringComparison.OrdinalIgnoreCase) < 0)
                        {
                            cleaned += "; Secure";
                        }
                        if (cleaned.IndexOf("SameSite", StringComparison.OrdinalIgnoreCase) < 0)
                        {
                            cleaned += "; SameSite=Lax";
                        }
                        resSb.Append(string.Format("Set-Cookie: {0}\r\n", cleaned));
                        loggedResHeaders["Set-Cookie[" + cIdx++ + "]"] = cleaned;
                        continue;
                    }

                    resSb.Append(string.Format("{0}: {1}\r\n", hk, hv));
                    loggedResHeaders[hk] = hv;
                }

                resSb.Append(string.Format("Content-Length: {0}\r\n", resBodyBytes.Length));
                resSb.Append("Connection: close\r\n\r\n");

                byte[] outResHead = Encoding.UTF8.GetBytes(resSb.ToString());
                clientStream.Write(outResHead, 0, outResHead.Length);

                if (resBodyBytes.Length > 0)
                {
                    clientStream.Write(resBodyBytes, 0, resBodyBytes.Length);
                }
                clientStream.Flush();

                if (EnableInspector)
                {
                    var log = new Dictionary<string, object>();
                    log["id"] = reqId;
                    log["timestamp"] = DateTime.Now.ToString("HH:mm:ss");
                    log["method"] = method;
                    log["path"] = rawUrl;
                    log["status"] = statusCode;
                    log["durationMs"] = sw.ElapsedMilliseconds;
                    log["clientIp"] = clientIp;
                    log["reqHeaders"] = SanitizeHeaders(headers);
                    log["reqBody"] = reqBodyStr;
                    log["resHeaders"] = loggedResHeaders;
                    log["resBody"] = resBodyStr.Length > 20000 ? resBodyStr.Substring(0, 20000) + "... (truncated)" : resBodyStr;
                    RecordLog(log);
                }

                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Proxy error: " + ex.Message);
                return true;
            }
            finally
            {
                try { targetClient.Close(); } catch { }
            }
        }

        private static byte[] ReadChunkedBody(NetworkStream stream, byte[] prefix)
        {
            using (MemoryStream inMs = new MemoryStream())
            using (MemoryStream outMs = new MemoryStream())
            {
                if (prefix != null && prefix.Length > 0) inMs.Write(prefix, 0, prefix.Length);
                inMs.Position = 0;

                while (true)
                {
                    string sizeLine = ReadLineFromStream(inMs, stream);
                    if (string.IsNullOrEmpty(sizeLine)) break;

                    string hex = sizeLine.Split(';')[0].Trim();
                    int chunkSize = 0;
                    try { chunkSize = Convert.ToInt32(hex, 16); } catch { break; }
                    if (chunkSize <= 0) break;

                    byte[] chunkBuf = new byte[chunkSize];
                    int read = 0;
                    while (read < chunkSize)
                    {
                        int fromPrefix = inMs.Read(chunkBuf, read, chunkSize - read);
                        if (fromPrefix > 0)
                        {
                            read += fromPrefix;
                        }
                        else
                        {
                            int fromNet = stream.Read(chunkBuf, read, chunkSize - read);
                            if (fromNet <= 0) break;
                            read += fromNet;
                        }
                    }
                    outMs.Write(chunkBuf, 0, read);

                    // Read trailing \r\n
                    ReadLineFromStream(inMs, stream);
                }
                return outMs.ToArray();
            }
        }

        private static string ReadLineFromStream(MemoryStream memStream, NetworkStream netStream)
        {
            StringBuilder sb = new StringBuilder();
            while (true)
            {
                int b = memStream.ReadByte();
                if (b < 0)
                {
                    b = netStream.ReadByte();
                }
                if (b < 0) break;
                if (b == 10) break; // \n
                if (b != 13) sb.Append((char)b);
            }
            return sb.ToString();
        }

        private void HandleWebSocketDirect(NetworkStream clientStream, int wsTargetPort, string requestLine, List<KeyValuePair<string, string>> headerList, byte[] bodyPrefix, string rawUrl, string clientIp, Dictionary<string, string> headers)
        {
            TcpClient targetClient = new TcpClient();
            targetClient.NoDelay = true;
            try
            {
                targetClient.Connect("127.0.0.1", wsTargetPort);
                NetworkStream targetStream = targetClient.GetStream();

                StringBuilder sb = new StringBuilder();
                sb.Append(requestLine + "\r\n");

                bool hostWritten = false;
                bool originWritten = false;

                foreach (var kv in headerList)
                {
                    string k = kv.Key;
                    string v = kv.Value;

                    if (k.Equals("Host", StringComparison.OrdinalIgnoreCase))
                    {
                        sb.Append(string.Format("Host: localhost:{0}\r\n", wsTargetPort));
                        hostWritten = true;
                    }
                    else if (k.Equals("Origin", StringComparison.OrdinalIgnoreCase))
                    {
                        sb.Append(string.Format("Origin: http://localhost:{0}\r\n", wsTargetPort));
                        originWritten = true;
                    }
                    else
                    {
                        sb.Append(string.Format("{0}: {1}\r\n", k, v));
                    }
                }

                if (!hostWritten) sb.Append(string.Format("Host: localhost:{0}\r\n", wsTargetPort));
                if (!originWritten) sb.Append(string.Format("Origin: http://localhost:{0}\r\n", wsTargetPort));

                sb.Append("\r\n");

                byte[] outHead = Encoding.UTF8.GetBytes(sb.ToString());
                targetStream.Write(outHead, 0, outHead.Length);

                if (bodyPrefix.Length > 0)
                {
                    targetStream.Write(bodyPrefix, 0, bodyPrefix.Length);
                }
                targetStream.Flush();

                if (EnableInspector)
                {
                    var log = new Dictionary<string, object>();
                    log["id"] = "ws_" + Guid.NewGuid().ToString("N").Substring(0, 8);
                    log["timestamp"] = DateTime.Now.ToString("HH:mm:ss");
                    log["method"] = "WS";
                    log["path"] = rawUrl;
                    log["status"] = 101;
                    log["durationMs"] = 0;
                    log["clientIp"] = clientIp;
                    log["reqHeaders"] = SanitizeHeaders(headers);
                    log["reqBody"] = "[WebSocket Connected -> Port " + wsTargetPort + "]";
                    log["resHeaders"] = new Dictionary<string, string> { { "upgrade", "websocket" }, { "connection", "Upgrade" } };
                    log["resBody"] = "101 Switching Protocols (Active Bi-directional Pipe)";
                    RecordLog(log);
                }

                Task t1 = clientStream.CopyToAsync(targetStream);
                Task t2 = targetStream.CopyToAsync(clientStream);
                Task.WaitAny(t1, t2);
            }
            catch { }
            finally
            {
                try { targetClient.Close(); } catch { }
            }
        }

        private static bool ReadHttpHeader(NetworkStream stream, out byte[] headerBytes, out byte[] bodyPrefix, out int headerLen)
        {
            headerBytes = null;
            bodyPrefix = new byte[0];
            headerLen = 0;

            byte[] buffer = new byte[4096];
            MemoryStream ms = new MemoryStream();
            int matched = 0;

            while (ms.Length < 131072) // 128KB max header
            {
                int read;
                try
                {
                    read = stream.Read(buffer, 0, buffer.Length);
                }
                catch
                {
                    break;
                }
                if (read <= 0) break;

                int foundAt = -1;
                for (int i = 0; i < read; i++)
                {
                    byte b = buffer[i];
                    if ((matched == 0 && b == 13) ||
                        (matched == 1 && b == 10) ||
                        (matched == 2 && b == 13) ||
                        (matched == 3 && b == 10))
                    {
                        matched++;
                        if (matched == 4)
                        {
                            foundAt = i;
                            break;
                        }
                    }
                    else
                    {
                        matched = (b == 13) ? 1 : 0;
                    }
                }

                if (foundAt >= 0)
                {
                    ms.Write(buffer, 0, foundAt + 1);
                    headerBytes = ms.ToArray();
                    headerLen = headerBytes.Length;

                    int remaining = read - (foundAt + 1);
                    if (remaining > 0)
                    {
                        bodyPrefix = new byte[remaining];
                        Array.Copy(buffer, foundAt + 1, bodyPrefix, 0, remaining);
                    }
                    return true;
                }
                else
                {
                    ms.Write(buffer, 0, read);
                }
            }

            return false;
        }

        private static void SendSimpleResponse(NetworkStream stream, int statusCode, string statusDesc, string contentType, byte[] body)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append(string.Format("HTTP/1.1 {0} {1}\r\n", statusCode, statusDesc));
            sb.Append(string.Format("Content-Type: {0}\r\n", contentType));
            sb.Append("Access-Control-Allow-Origin: *\r\n");
            sb.Append("Access-Control-Allow-Methods: *\r\n");
            sb.Append("Access-Control-Allow-Headers: *\r\n");
            sb.Append("Cache-Control: no-store\r\n");
            sb.Append(string.Format("Content-Length: {0}\r\n", body.Length));
            sb.Append("Connection: close\r\n\r\n");

            byte[] headBytes = Encoding.UTF8.GetBytes(sb.ToString());
            stream.Write(headBytes, 0, headBytes.Length);
            if (body.Length > 0)
            {
                stream.Write(body, 0, body.Length);
            }
            stream.Flush();
        }

        private static byte[] GetLogoBytes()
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
                    try { return File.ReadAllBytes(p); } catch { }
                }
            }
            return null;
        }

        private static Dictionary<string, string> SanitizeHeaders(Dictionary<string, string> inHeaders)
        {
            var dict = new Dictionary<string, string>();
            foreach (var kv in inHeaders)
            {
                string k = kv.Key;
                string v = kv.Value;
                if (k.Equals("Authorization", StringComparison.OrdinalIgnoreCase) ||
                    k.Equals("Proxy-Authorization", StringComparison.OrdinalIgnoreCase) ||
                    k.Equals("X-Api-Key", StringComparison.OrdinalIgnoreCase))
                {
                    v = v.Length > 12 ? v.Substring(0, 7) + "..." + v.Substring(v.Length - 4) : "******";
                }
                dict[k] = v;
            }
            return dict;
        }

        private bool IsBackendApiRequest(string method, string rawUrl, Dictionary<string, string> headers)
        {
            if (!EnableFullstack || BackendPort <= 0) return false;

            // 1. Any non-GET, non-HEAD method is a backend mutation (POST, PUT, DELETE, PATCH)
            if (method != "GET" && method != "HEAD" && method != "OPTIONS")
            {
                return true;
            }

            // Extract path without query parameters
            string path = rawUrl ?? "/";
            int qIdx = path.IndexOf('?');
            if (qIdx >= 0) path = path.Substring(0, qIdx);

            // Enterprise / Pega / ERP paths ALWAYS belong to backend
            if (path.IndexOf("/prweb", StringComparison.OrdinalIgnoreCase) >= 0 ||
                path.IndexOf("/prpc", StringComparison.OrdinalIgnoreCase) >= 0 ||
                path.IndexOf("pzpega", StringComparison.OrdinalIgnoreCase) >= 0 ||
                path.IndexOf("!STANDARD", StringComparison.OrdinalIgnoreCase) >= 0 ||
                path.IndexOf("/webclient", StringComparison.OrdinalIgnoreCase) >= 0 ||
                path.IndexOf("/sap", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            // 2. Static file extensions belong to Frontend (Vite/React dev server)
            if (Regex.IsMatch(path, @"\.(js|jsx|ts|tsx|mjs|cjs|css|scss|html|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|map|txt)$", RegexOptions.IgnoreCase))
            {
                return false;
            }

            // JSON files: openapi.json or swagger.json belong to backend
            if (path.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            {
                if (path.IndexOf("openapi", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    path.IndexOf("swagger", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    return true;
                }
                return false;
            }

            // 3. Known API and backend route prefixes
            if (Regex.IsMatch(path, @"^/(api|v[0-9]+|auth|oauth|login|logout|register|signup|token|verify|verification|user|users|workspace|workspaces|org|orgs|organization|organizations|session|sessions|message|messages|chat|chats|channel|channels|conversation|conversations|thread|threads|dm|dms|feed|post|posts|notification|notifications|event|events|upload|uploads|file|files|ws|socket\.io|search|health|healthz|ready|graphql|rest|backend|server|docs|redoc|openapi\.json|webhook|webhooks)(\/|\?|$)", RegexOptions.IgnoreCase))
            {
                return true;
            }

            // 4. Content negotiation: JSON / API payloads
            string accept = headers.ContainsKey("Accept") ? headers["Accept"] : "";
            string contentType = headers.ContainsKey("Content-Type") ? headers["Content-Type"] : "";
            if (contentType.IndexOf("application/json", StringComparison.OrdinalIgnoreCase) >= 0 ||
                contentType.IndexOf("application/x-www-form-urlencoded", StringComparison.OrdinalIgnoreCase) >= 0 ||
                contentType.IndexOf("multipart/form-data", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            if (accept.IndexOf("application/json", StringComparison.OrdinalIgnoreCase) >= 0 &&
                accept.IndexOf("text/html", StringComparison.OrdinalIgnoreCase) < 0)
            {
                return true;
            }

            // 5. Auth / API-specific headers
            if (headers.ContainsKey("Authorization") ||
                headers.ContainsKey("X-Api-Key") ||
                headers.ContainsKey("X-Requested-With"))
            {
                return true;
            }

            return false;
        }

        private void ServeIdleLanding(NetworkStream clientStream, string method, string rawUrl, Dictionary<string, string> headers, string reqBodyStr, int targetPort, bool isApi, string reqId, string clientIp, Stopwatch sw)
        {
            try
            {
                string acceptHeader = headers.ContainsKey("Accept") ? headers["Accept"] : "";
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
                    SendSimpleResponse(clientStream, 200, "OK", "application/json", outBytes);

                    if (EnableInspector)
                    {
                        var log = new Dictionary<string, object>();
                        log["id"] = reqId;
                        log["timestamp"] = DateTime.Now.ToString("HH:mm:ss");
                        log["method"] = method;
                        log["path"] = rawUrl;
                        log["status"] = 200;
                        log["durationMs"] = sw.ElapsedMilliseconds;
                        log["clientIp"] = clientIp;
                        log["reqHeaders"] = SanitizeHeaders(headers);
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
                    SendSimpleResponse(clientStream, 200, "OK", "text/html; charset=utf-8", outBytes);

                    if (EnableInspector)
                    {
                        var log = new Dictionary<string, object>();
                        log["id"] = reqId;
                        log["timestamp"] = DateTime.Now.ToString("HH:mm:ss");
                        log["method"] = method;
                        log["path"] = rawUrl;
                        log["status"] = 200;
                        log["durationMs"] = sw.ElapsedMilliseconds;
                        log["clientIp"] = clientIp;
                        log["reqHeaders"] = SanitizeHeaders(headers);
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
