using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;
using System.Text;
using System.Threading;
using System.Collections;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Diagnostics;
using System.Windows.Forms;

namespace SharePort.WebView2App
{
    public class FileShareEngine
    {
        private readonly Form _form;
        private readonly Bridge _bridge;
        private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer();

        private UdpClient _udpClient;
        private Thread _udpListenThread;
        private System.Threading.Timer _beaconTimer;
        private System.Threading.Timer _cleanupTimer;
        private TcpListener _tcpListener;
        private Thread _tcpListenThread;

        private readonly Dictionary<string, Dictionary<string, object>> _discoveredPeers = new Dictionary<string, Dictionary<string, object>>();
        private readonly object _peerLock = new object();

        private readonly Dictionary<string, PendingTcpRequest> _pendingRequests = new Dictionary<string, PendingTcpRequest>();

        private volatile bool _transferCancelled = false;
        private string _currentTransferId = null;

        public string DeviceId { get; private set; }
        public string DeviceName { get; set; }
        public int HttpPort { get; private set; }
        public int UdpPort { get; private set; }
        public string DownloadDir { get; set; }
        public bool IsDiscovering { get; private set; }
        public string CurrentMode { get; set; } // "send", "receive", or "standby"

        private class PendingTcpRequest
        {
            public string TransferId;
            public TcpClient Client;
            public NetworkStream Stream;
            public System.Threading.Timer TimeoutTimer;
        }

        public FileShareEngine(Form form, Bridge bridge)
        {
            _form = form;
            _bridge = bridge;

            DeviceId = "sp_" + Environment.MachineName.ToLower().Replace(" ", "_") + "_" + new Random().Next(1000, 9999);
            DeviceName = Environment.MachineName;
            HttpPort = 53318;
            UdpPort = 53317;
            CurrentMode = "standby";

            try
            {
                DownloadDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "SharePort_Received");
                if (!Directory.Exists(DownloadDir)) Directory.CreateDirectory(DownloadDir);
            }
            catch
            {
                DownloadDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Received_Files");
            }

            StartHttpServer();
            StartDiscovery();
        }

        public string GetPrimaryIp()
        {
            string fallback = "127.0.0.1";
            try
            {
                var interfaces = NetworkInterface.GetAllNetworkInterfaces();

                // Pass 1: Active Wi-Fi adapter or physical Ethernet adapter (strictly exclude virtual adapters like WSL/Hyper-V)
                foreach (var ni in interfaces)
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

                    string name = ni.Name.ToLower();
                    string desc = ni.Description.ToLower();

                    if (name.Contains("vethernet") || name.Contains("wsl") || name.Contains("hyper-v") ||
                        name.Contains("vmware") || name.Contains("virtual") || name.Contains("pseudo") ||
                        desc.Contains("virtual") || desc.Contains("hyper-v") || desc.Contains("vmware") ||
                        desc.Contains("wsl") || desc.Contains("pseudo"))
                    {
                        continue;
                    }

                    var ipProps = ni.GetIPProperties();
                    foreach (var addr in ipProps.UnicastAddresses)
                    {
                        if (addr.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(addr.Address))
                        {
                            string s = addr.Address.ToString();
                            if (!s.StartsWith("169.254.") && !s.StartsWith("127."))
                            {
                                return s;
                            }
                        }
                    }
                }

                // Pass 2: Fallback routing query if no filtered adapter matched
                using (var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, 0))
                {
                    socket.Connect("255.255.255.255", 65530);
                    var endPoint = socket.LocalEndPoint as IPEndPoint;
                    if (endPoint != null && !endPoint.Address.ToString().StartsWith("127."))
                    {
                        return endPoint.Address.ToString();
                    }
                }
            }
            catch { }

            return fallback;
        }

        public Dictionary<string, object> GetLocalInfo()
        {
            var info = new Dictionary<string, object>();
            info["deviceId"] = DeviceId;
            info["deviceName"] = DeviceName;
            info["deviceType"] = "windows";
            info["ip"] = GetPrimaryIp();
            info["httpPort"] = HttpPort;
            info["udpPort"] = UdpPort;
            info["downloadDir"] = DownloadDir;
            info["hostname"] = Environment.MachineName;
            info["platform"] = "win32";
            info["mode"] = CurrentMode;
            return info;
        }

        // Multi-interface broadcast helper (excluding virtual subnets)
        private List<IPAddress> GetAllBroadcastAddresses()
        {
            var list = new List<IPAddress>();
            list.Add(IPAddress.Broadcast); // 255.255.255.255
            try
            {
                foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

                    string name = ni.Name.ToLower();
                    string desc = ni.Description.ToLower();
                    if (name.Contains("vethernet") || name.Contains("wsl") || name.Contains("hyper-v") ||
                        name.Contains("vmware") || name.Contains("virtual") || desc.Contains("virtual") ||
                        desc.Contains("hyper-v") || desc.Contains("vmware"))
                    {
                        continue;
                    }

                    var ipProps = ni.GetIPProperties();
                    foreach (var unicast in ipProps.UnicastAddresses)
                    {
                        if (unicast.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(unicast.Address))
                        {
                            if (unicast.IPv4Mask != null)
                            {
                                byte[] ipBytes = unicast.Address.GetAddressBytes();
                                byte[] maskBytes = unicast.IPv4Mask.GetAddressBytes();
                                byte[] broadcastBytes = new byte[ipBytes.Length];
                                for (int i = 0; i < ipBytes.Length; i++)
                                {
                                    broadcastBytes[i] = (byte)(ipBytes[i] | ~maskBytes[i]);
                                }
                                var bcast = new IPAddress(broadcastBytes);
                                if (!list.Contains(bcast)) list.Add(bcast);
                            }
                        }
                    }
                }
            }
            catch { }
            return list;
        }

        // ==========================================
        // UDP PEER DISCOVERY
        // ==========================================
        public void StartDiscovery()
        {
            if (IsDiscovering && _udpClient != null) return;
            try
            {
                _udpClient = new UdpClient();
                _udpClient.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                _udpClient.EnableBroadcast = true;
                _udpClient.Client.Bind(new IPEndPoint(IPAddress.Any, UdpPort));

                IsDiscovering = true;

                _udpListenThread = new Thread(ListenUdp) { IsBackground = true };
                _udpListenThread.Start();

                BroadcastBeacon();

                if (_beaconTimer != null) _beaconTimer.Dispose();
                _beaconTimer = new System.Threading.Timer(delegate
                {
                    if (IsDiscovering) BroadcastBeacon();
                }, null, 2500, 2500);

                if (_cleanupTimer != null) _cleanupTimer.Dispose();
                _cleanupTimer = new System.Threading.Timer(delegate
                {
                    PurgeStalePeers();
                }, null, 3000, 3000);

                Console.WriteLine("[FileShare C#] UDP discovery active on port " + UdpPort);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[FileShare C#] UDP bind failed: " + ex.Message);
            }
        }

        public void StopDiscovery()
        {
            IsDiscovering = false;
            if (_beaconTimer != null) { _beaconTimer.Dispose(); _beaconTimer = null; }
            if (_cleanupTimer != null) { _cleanupTimer.Dispose(); _cleanupTimer = null; }

            BroadcastGoodbye();

            if (_udpClient != null)
            {
                try { _udpClient.Close(); } catch { }
                _udpClient = null;
            }

            lock (_peerLock)
            {
                _discoveredPeers.Clear();
            }
            EmitPeersUpdated();
        }

        public void ScanRadar()
        {
            if (!IsDiscovering) StartDiscovery();

            try
            {
                var pingMsg = new Dictionary<string, object>();
                pingMsg["protocol"] = "shareport-v1";
                pingMsg["action"] = "PING";
                pingMsg["id"] = DeviceId;
                pingMsg["name"] = DeviceName;
                pingMsg["ip"] = GetPrimaryIp();
                pingMsg["port"] = HttpPort;
                pingMsg["mode"] = CurrentMode;
                pingMsg["timestamp"] = DateTime.UtcNow.Ticks;

                byte[] bytes = Encoding.UTF8.GetBytes(Serializer.Serialize(pingMsg));
                foreach (var bcast in GetAllBroadcastAddresses())
                {
                    try
                    {
                        var ep = new IPEndPoint(bcast, UdpPort);
                        if (_udpClient != null) _udpClient.Send(bytes, bytes.Length, ep);
                    }
                    catch { }
                }

                BroadcastBeacon();
            }
            catch { }
        }

        public void BroadcastBeacon()
        {
            if (_udpClient == null || !IsDiscovering) return;
            try
            {
                var msg = new Dictionary<string, object>();
                msg["protocol"] = "shareport-v1";
                msg["action"] = "BEACON";
                msg["id"] = DeviceId;
                msg["name"] = DeviceName;
                msg["os"] = "windows";
                msg["ip"] = GetPrimaryIp();
                msg["port"] = HttpPort;
                msg["mode"] = CurrentMode;
                msg["status"] = CurrentMode == "receive" ? "ready_to_receive" : "online";
                msg["timestamp"] = DateTime.UtcNow.Ticks;

                byte[] bytes = Encoding.UTF8.GetBytes(Serializer.Serialize(msg));
                foreach (var bcast in GetAllBroadcastAddresses())
                {
                    try
                    {
                        var ep = new IPEndPoint(bcast, UdpPort);
                        _udpClient.Send(bytes, bytes.Length, ep);
                    }
                    catch { }
                }
            }
            catch { }
        }

        private void SendUnicastBeacon(IPEndPoint target)
        {
            if (_udpClient == null || target == null) return;
            try
            {
                var msg = new Dictionary<string, object>();
                msg["protocol"] = "shareport-v1";
                msg["action"] = "BEACON";
                msg["id"] = DeviceId;
                msg["name"] = DeviceName;
                msg["os"] = "windows";
                msg["ip"] = GetPrimaryIp();
                msg["port"] = HttpPort;
                msg["mode"] = CurrentMode;
                msg["status"] = CurrentMode == "receive" ? "ready_to_receive" : "online";
                msg["timestamp"] = DateTime.UtcNow.Ticks;

                byte[] bytes = Encoding.UTF8.GetBytes(Serializer.Serialize(msg));
                _udpClient.Send(bytes, bytes.Length, target);
            }
            catch { }
        }

        private void BroadcastGoodbye()
        {
            if (_udpClient == null) return;
            try
            {
                var msg = new Dictionary<string, object>();
                msg["protocol"] = "shareport-v1";
                msg["action"] = "GOODBYE";
                msg["id"] = DeviceId;
                byte[] bytes = Encoding.UTF8.GetBytes(Serializer.Serialize(msg));
                foreach (var bcast in GetAllBroadcastAddresses())
                {
                    try
                    {
                        var ep = new IPEndPoint(bcast, UdpPort);
                        _udpClient.Send(bytes, bytes.Length, ep);
                    }
                    catch { }
                }
            }
            catch { }
        }

        private void ListenUdp()
        {
            var remoteEp = new IPEndPoint(IPAddress.Any, 0);
            while (IsDiscovering && _udpClient != null)
            {
                try
                {
                    byte[] data = _udpClient.Receive(ref remoteEp);
                    if (data == null || data.Length == 0) continue;

                    string json = Encoding.UTF8.GetString(data);
                    var dict = Serializer.Deserialize<Dictionary<string, object>>(json);
                    if (dict == null || !dict.ContainsKey("protocol") || dict["protocol"].ToString() != "shareport-v1") continue;

                    string id = dict.ContainsKey("id") ? dict["id"].ToString() : "";
                    if (id == DeviceId) continue; // Ignore own message

                    string action = dict.ContainsKey("action") ? dict["action"].ToString() : "";

                    if (action == "GOODBYE")
                    {
                        lock (_peerLock)
                        {
                            if (_discoveredPeers.ContainsKey(id))
                            {
                                _discoveredPeers.Remove(id);
                                EmitPeersUpdated();
                            }
                        }
                        continue;
                    }

                    // Send direct UNICAST reply back to remote sender for reliable discovery
                    if (remoteEp != null && remoteEp.Address != null && (action == "PING" || action == "BEACON"))
                    {
                        SendUnicastBeacon(remoteEp);
                    }

                    if (action == "BEACON" || action == "PING")
                    {
                        // Use incoming physical remote socket IP as primary reachable address
                        string rawRemote = (remoteEp != null && remoteEp.Address != null) ? remoteEp.Address.ToString() : "";
                        string reported = dict.ContainsKey("ip") && dict["ip"] != null ? dict["ip"].ToString() : "";
                        string peerIp = (!string.IsNullOrEmpty(rawRemote) && !rawRemote.StartsWith("127.")) ? rawRemote : (!string.IsNullOrEmpty(reported) ? reported : "127.0.0.1");
                        int peerPort = dict.ContainsKey("port") ? Convert.ToInt32(dict["port"]) : 53318;
                        string peerName = dict.ContainsKey("name") ? dict["name"].ToString() : "Nearby Device";
                        string peerOs = dict.ContainsKey("os") ? dict["os"].ToString() : "windows";
                        string peerMode = dict.ContainsKey("mode") ? dict["mode"].ToString() : "standby";
                        string peerStatus = dict.ContainsKey("status") ? dict["status"].ToString() : (peerMode == "receive" ? "ready_to_receive" : "online");

                        var peer = new Dictionary<string, object>();
                        peer["id"] = id;
                        peer["name"] = peerName;
                        peer["os"] = peerOs;
                        peer["ip"] = peerIp;
                        peer["port"] = peerPort;
                        peer["mode"] = peerMode;
                        peer["status"] = peerStatus;
                        peer["lastSeen"] = DateTime.UtcNow.Ticks;

                        bool changed = false;
                        lock (_peerLock)
                        {
                            if (!_discoveredPeers.ContainsKey(id) || _discoveredPeers[id]["name"].ToString() != peerName || _discoveredPeers[id]["ip"].ToString() != peerIp || _discoveredPeers[id]["mode"].ToString() != peerMode)
                            {
                                changed = true;
                            }
                            _discoveredPeers[id] = peer;
                        }

                        if (changed) EmitPeersUpdated();
                    }
                }
                catch (SocketException)
                {
                    break;
                }
                catch (Exception) { }
            }
        }

        private void PurgeStalePeers()
        {
            long now = DateTime.UtcNow.Ticks;
            long timeoutTicks = TimeSpan.FromSeconds(10).Ticks;
            bool changed = false;

            lock (_peerLock)
            {
                var keysToRemove = new List<string>();
                foreach (var kv in _discoveredPeers)
                {
                    long lastSeen = Convert.ToInt64(kv.Value["lastSeen"]);
                    if (now - lastSeen > timeoutTicks)
                    {
                        keysToRemove.Add(kv.Key);
                    }
                }

                foreach (var k in keysToRemove)
                {
                    _discoveredPeers.Remove(k);
                    changed = true;
                }
            }

            if (changed) EmitPeersUpdated();
        }

        private void EmitPeersUpdated()
        {
            var list = new List<Dictionary<string, object>>();
            lock (_peerLock)
            {
                foreach (var p in _discoveredPeers.Values) list.Add(p);
            }
            _bridge.EmitEvent("fileshare:peers-updated", list);
        }

        // Direct connect by IP or Hostname
        public Dictionary<string, object> DirectConnect(string ip, int port)
        {
            string cleanIp = (ip ?? "").Trim();
            if (string.IsNullOrEmpty(cleanIp)) throw new Exception("IP address or name is required");

            try
            {
                var req = (HttpWebRequest)WebRequest.Create(string.Format("http://{0}:{1}/api/ping", cleanIp, port));
                req.Timeout = 3000;
                req.Method = "GET";
                using (var res = (HttpWebResponse)req.GetResponse())
                using (var reader = new StreamReader(res.GetResponseStream()))
                {
                    string body = reader.ReadToEnd();
                    var data = Serializer.Deserialize<Dictionary<string, object>>(body);
                    if (data != null && data.ContainsKey("id"))
                    {
                        var peer = new Dictionary<string, object>();
                        peer["id"] = data["id"].ToString();
                        peer["name"] = data.ContainsKey("name") ? data["name"].ToString() : ("Device (" + cleanIp + ")");
                        peer["os"] = data.ContainsKey("os") ? data["os"].ToString() : "windows";
                        peer["ip"] = cleanIp;
                        peer["port"] = port;
                        peer["status"] = "online";
                        peer["isDirect"] = true;
                        peer["lastSeen"] = DateTime.UtcNow.Ticks;

                        lock (_peerLock)
                        {
                            _discoveredPeers[peer["id"].ToString()] = peer;
                        }
                        EmitPeersUpdated();
                        return peer;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[FileShare C#] Direct ping failed: " + ex.Message);
            }

            var directPeer = new Dictionary<string, object>();
            directPeer["id"] = "direct_" + cleanIp.Replace(".", "_").Replace(":", "_");
            directPeer["name"] = "Device (" + cleanIp + ")";
            directPeer["os"] = "windows";
            directPeer["ip"] = cleanIp;
            directPeer["port"] = port;
            directPeer["status"] = "online";
            directPeer["isDirect"] = true;
            directPeer["lastSeen"] = DateTime.UtcNow.Ticks;

            lock (_peerLock)
            {
                _discoveredPeers[directPeer["id"].ToString()] = directPeer;
            }
            EmitPeersUpdated();
            return directPeer;
        }

        // ==========================================
        // HTTP SERVER FOR TRANSFERS & CONNECTION (TcpListener)
        // ==========================================
        private void StartHttpServer()
        {
            try
            {
                _tcpListener = new TcpListener(IPAddress.Any, HttpPort);
                _tcpListener.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                _tcpListener.Start();

                _tcpListenThread = new Thread(ListenTcp) { IsBackground = true };
                _tcpListenThread.Start();
                Console.WriteLine("[FileShare C#] TCP HTTP server started on 0.0.0.0:" + HttpPort);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[FileShare C#] TCP HTTP server failed: " + ex.Message);
            }
        }

        private void ListenTcp()
        {
            while (_tcpListener != null)
            {
                try
                {
                    TcpClient client = _tcpListener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(delegate { HandleTcpClient(client); });
                }
                catch { break; }
            }
        }

        private void HandleTcpClient(TcpClient client)
        {
            try
            {
                client.ReceiveTimeout = 65000;
                client.SendTimeout = 65000;
                NetworkStream stream = client.GetStream();

                byte[] headerBuffer = new byte[8192];
                int headerLen = 0;
                int headerEndIndex = -1;

                while (headerLen < headerBuffer.Length)
                {
                    int b = stream.ReadByte();
                    if (b == -1) break;
                    headerBuffer[headerLen++] = (byte)b;
                    if (headerLen >= 4 &&
                        headerBuffer[headerLen - 4] == 13 && headerBuffer[headerLen - 3] == 10 &&
                        headerBuffer[headerLen - 2] == 13 && headerBuffer[headerLen - 1] == 10)
                    {
                        headerEndIndex = headerLen;
                        break;
                    }
                }

                if (headerEndIndex == -1)
                {
                    client.Close();
                    return;
                }

                string headerText = Encoding.UTF8.GetString(headerBuffer, 0, headerEndIndex);
                string[] lines = headerText.Split(new string[] { "\r\n" }, StringSplitOptions.None);
                if (lines.Length == 0) { client.Close(); return; }

                string[] reqLineParts = lines[0].Split(' ');
                if (reqLineParts.Length < 2) { client.Close(); return; }

                string method = reqLineParts[0].ToUpper();
                string path = reqLineParts[1];
                if (path.Contains("?")) path = path.Substring(0, path.IndexOf('?'));

                var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                for (int i = 1; i < lines.Length; i++)
                {
                    int colon = lines[i].IndexOf(':');
                    if (colon > 0)
                    {
                        string k = lines[i].Substring(0, colon).Trim();
                        string v = lines[i].Substring(colon + 1).Trim();
                        headers[k] = v;
                    }
                }

                if (method == "OPTIONS")
                {
                    SendHttpRaw(stream, 200, "OK", "text/plain", new byte[0]);
                    client.Close();
                    return;
                }

                long contentLength = 0;
                if (headers.ContainsKey("Content-Length"))
                {
                    long.TryParse(headers["Content-Length"], out contentLength);
                }

                // 1. PING & STATUS
                if (path == "/api/ping")
                {
                    var pong = new Dictionary<string, object>();
                    pong["success"] = true;
                    pong["id"] = DeviceId;
                    pong["name"] = DeviceName;
                    pong["os"] = "windows";
                    pong["port"] = HttpPort;
                    pong["mode"] = CurrentMode;
                    pong["status"] = CurrentMode == "receive" ? "ready_to_receive" : "online";

                    byte[] rBytes = Encoding.UTF8.GetBytes(Serializer.Serialize(pong));
                    SendHttpRaw(stream, 200, "OK", "application/json", rBytes);
                    client.Close();
                    return;
                }

                // 2. CONNECT HANDSHAKE
                if (path == "/api/connect" && method == "POST")
                {
                    byte[] bodyBytes = ReadExactBytes(stream, (int)contentLength);
                    string bodyStr = Encoding.UTF8.GetString(bodyBytes);
                    var connectData = Serializer.Deserialize<Dictionary<string, object>>(bodyStr);
                    _bridge.EmitEvent("fileshare:peer-connected", connectData);

                    var reply = new Dictionary<string, object>();
                    reply["success"] = true;
                    reply["id"] = DeviceId;
                    reply["name"] = DeviceName;
                    reply["status"] = "connected";

                    byte[] rBytes = Encoding.UTF8.GetBytes(Serializer.Serialize(reply));
                    SendHttpRaw(stream, 200, "OK", "application/json", rBytes);
                    client.Close();
                    return;
                }

                // 3. DISCONNECT NOTIFICATION
                if (path == "/api/disconnect" && method == "POST")
                {
                    _bridge.EmitEvent("fileshare:peer-disconnected", new Dictionary<string, object>());
                    SendHttpRaw(stream, 200, "OK", "application/json", Encoding.UTF8.GetBytes("{\"success\":true}"));
                    client.Close();
                    return;
                }

                // 4. TRANSFER MANIFEST REQUEST
                if (path == "/api/transfer/request" && method == "POST")
                {
                    byte[] bodyBytes = ReadExactBytes(stream, (int)contentLength);
                    string bodyStr = Encoding.UTF8.GetString(bodyBytes);
                    var manifest = Serializer.Deserialize<Dictionary<string, object>>(bodyStr);
                    if (manifest != null && manifest.ContainsKey("transferId"))
                    {
                        string xferId = manifest["transferId"].ToString();
                        manifest["saveDir"] = DownloadDir;

                        var pr = new PendingTcpRequest
                        {
                            TransferId = xferId,
                            Client = client,
                            Stream = stream,
                            TimeoutTimer = new System.Threading.Timer(delegate
                            {
                                DeclineRequest(xferId, "Request timed out");
                            }, null, 65000, -1)
                        };

                        lock (_pendingRequests)
                        {
                            _pendingRequests[xferId] = pr;
                        }

                        _bridge.EmitEvent("fileshare:incoming-request", manifest);
                        return; // Keep TCP connection open until receiver clicks Accept or Decline
                    }
                    client.Close();
                    return;
                }

                // 5. FILE UPLOAD STREAM
                if (path == "/api/transfer/upload" && method == "POST")
                {
                    string xferId = headers.ContainsKey("x-transfer-id") ? headers["x-transfer-id"] : "";
                    string rawName = headers.ContainsKey("x-file-name") ? headers["x-file-name"] : "file";
                    string fileName = Path.GetFileName(Uri.UnescapeDataString(rawName));
                    long fileSize = 0;
                    if (headers.ContainsKey("x-file-size")) long.TryParse(headers["x-file-size"], out fileSize);
                    int fileIdx = 0;
                    if (headers.ContainsKey("x-file-index")) int.TryParse(headers["x-file-index"], out fileIdx);
                    int totalFiles = 1;
                    if (headers.ContainsKey("x-total-files")) int.TryParse(headers["x-total-files"], out totalFiles);
                    long totalSize = fileSize;
                    if (headers.ContainsKey("x-total-size")) long.TryParse(headers["x-total-size"], out totalSize);
                    string rawSender = headers.ContainsKey("x-sender-name") ? headers["x-sender-name"] : "Sender";
                    string senderName = Uri.UnescapeDataString(rawSender);

                    string targetDir = DownloadDir;
                    if (!Directory.Exists(targetDir)) Directory.CreateDirectory(targetDir);

                    string savePath = Path.Combine(targetDir, fileName);
                    int count = 1;
                    while (File.Exists(savePath))
                    {
                        string ext = Path.GetExtension(fileName);
                        string nameNoExt = Path.GetFileNameWithoutExtension(fileName);
                        savePath = Path.Combine(targetDir, string.Format("{0} ({1}){2}", nameNoExt, count++, ext));
                    }

                    long bytesToRead = contentLength > 0 ? contentLength : fileSize;
                    long fileBytesReceived = 0;
                    byte[] fileBuf = new byte[65536];

                    using (var fs = new FileStream(savePath, FileMode.Create, FileAccess.Write, FileShare.None, 262144))
                    {
                        while (fileBytesReceived < bytesToRead)
                        {
                            int want = (int)Math.Min(fileBuf.Length, bytesToRead - fileBytesReceived);
                            int read = stream.Read(fileBuf, 0, want);
                            if (read <= 0) break;
                            fs.Write(fileBuf, 0, read);
                            fileBytesReceived += read;

                            var prog = new Dictionary<string, object>();
                            prog["transferId"] = xferId;
                            prog["fileIndex"] = fileIdx + 1;
                            prog["totalFiles"] = totalFiles;
                            prog["fileName"] = fileName;
                            prog["fileBytesSent"] = fileBytesReceived;
                            prog["fileTotalBytes"] = fileSize;
                            prog["percent"] = fileSize > 0 ? (int)((fileBytesReceived * 100) / fileSize) : 100;
                            prog["isReceiver"] = true;
                            prog["senderName"] = senderName;

                            _bridge.EmitEvent("fileshare:transfer-progress", prog);
                        }
                    }

                    var reply = new Dictionary<string, object>();
                    reply["success"] = true;
                    reply["savedPath"] = savePath;
                    byte[] rBytes = Encoding.UTF8.GetBytes(Serializer.Serialize(reply));
                    SendHttpRaw(stream, 200, "OK", "application/json", rBytes);
                    client.Close();

                    if (fileIdx + 1 >= totalFiles)
                    {
                        var comp = new Dictionary<string, object>();
                        comp["transferId"] = xferId;
                        comp["totalFiles"] = totalFiles;
                        comp["savedPath"] = savePath;
                        comp["isReceiver"] = true;
                        _bridge.EmitEvent("fileshare:transfer-completed", comp);
                    }
                    return;
                }

                SendHttpRaw(stream, 404, "Not Found", "text/plain", Encoding.UTF8.GetBytes("Not Found"));
                client.Close();
            }
            catch (Exception ex)
            {
                try { client.Close(); } catch { }
                Console.WriteLine("[FileShare C#] HandleTcpClient error: " + ex.Message);
            }
        }

        private static void SendHttpRaw(NetworkStream stream, int statusCode, string statusMsg, string contentType, byte[] body)
        {
            try
            {
                var sb = new StringBuilder();
                sb.AppendFormat("HTTP/1.1 {0} {1}\r\n", statusCode, statusMsg);
                sb.Append("Access-Control-Allow-Origin: *\r\n");
                sb.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
                sb.Append("Access-Control-Allow-Headers: Content-Type, x-transfer-id, x-file-index, x-file-name, x-file-size, x-total-files, x-total-size, x-sender-name\r\n");
                sb.AppendFormat("Content-Type: {0}\r\n", contentType);
                sb.AppendFormat("Content-Length: {0}\r\n", body != null ? body.Length : 0);
                sb.Append("Connection: close\r\n");
                sb.Append("\r\n");

                byte[] headerBytes = Encoding.UTF8.GetBytes(sb.ToString());
                stream.Write(headerBytes, 0, headerBytes.Length);
                if (body != null && body.Length > 0)
                {
                    stream.Write(body, 0, body.Length);
                }
                stream.Flush();
            }
            catch { }
        }

        private static byte[] ReadExactBytes(NetworkStream stream, int count)
        {
            byte[] buffer = new byte[count];
            int offset = 0;
            while (offset < count)
            {
                int read = stream.Read(buffer, offset, count - offset);
                if (read <= 0) break;
                offset += read;
            }
            return buffer;
        }

        // ==========================================
        // FILE SENDING ENGINE
        // ==========================================
        public void SendFiles(Dictionary<string, object> peer, List<string> filePaths)
        {
            _transferCancelled = false;
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    string peerIp = peer != null && peer.ContainsKey("ip") ? peer["ip"].ToString() : "";
                    int peerPort = peer != null && peer.ContainsKey("port") ? Convert.ToInt32(peer["port"]) : HttpPort;
                    string peerName = peer != null && peer.ContainsKey("name") ? peer["name"].ToString() : "Nearby Device";

                    if (string.IsNullOrEmpty(peerIp)) throw new Exception("Target peer IP is missing");
                    if (filePaths == null || filePaths.Count == 0) throw new Exception("No files selected to send");

                    string transferId = "tx_" + DateTime.UtcNow.Ticks + "_" + new Random().Next(1000, 9999);
                    _currentTransferId = transferId;

                    // 1. Prepare manifest with individual file sizes and overall total size
                    var manifestFiles = new List<Dictionary<string, object>>();
                    long totalBytes = 0;
                    foreach (string path in filePaths)
                    {
                        if (File.Exists(path))
                        {
                            var fi = new FileInfo(path);
                            var fDict = new Dictionary<string, object>();
                            fDict["name"] = fi.Name;
                            fDict["size"] = fi.Length;
                            fDict["path"] = path;
                            totalBytes += fi.Length;
                            manifestFiles.Add(fDict);
                        }
                    }

                    if (manifestFiles.Count == 0) throw new Exception("Selected files could not be found on disk");

                    var manifest = new Dictionary<string, object>();
                    manifest["transferId"] = transferId;
                    manifest["senderId"] = DeviceId;
                    manifest["senderName"] = DeviceName;
                    manifest["totalFiles"] = manifestFiles.Count;
                    manifest["totalSize"] = totalBytes;
                    manifest["files"] = manifestFiles;

                    // Notify sender UI that request is sent & waiting for receiver to accept
                    var waitingPayload = new Dictionary<string, object>();
                    waitingPayload["transferId"] = transferId;
                    waitingPayload["peer"] = peer;
                    waitingPayload["filesCount"] = manifestFiles.Count;
                    waitingPayload["totalSize"] = totalBytes;
                    _bridge.EmitEvent("fileshare:sender-waiting-acceptance", waitingPayload);

                    // 2. Send manifest to receiver
                    string reqUrl = string.Format("http://{0}:{1}/api/transfer/request", peerIp, peerPort);
                    var httpReq = (HttpWebRequest)WebRequest.Create(reqUrl);
                    httpReq.Method = "POST";
                    httpReq.ContentType = "application/json";
                    httpReq.Timeout = 65000;

                    byte[] jsonBytes = Encoding.UTF8.GetBytes(Serializer.Serialize(manifest));
                    httpReq.ContentLength = jsonBytes.Length;
                    using (var os = httpReq.GetRequestStream())
                    {
                        os.Write(jsonBytes, 0, jsonBytes.Length);
                    }

                    string respBody = "";
                    using (var httpRes = (HttpWebResponse)httpReq.GetResponse())
                    using (var reader = new StreamReader(httpRes.GetResponseStream()))
                    {
                        respBody = reader.ReadToEnd();
                    }

                    var respDict = Serializer.Deserialize<Dictionary<string, object>>(respBody);
                    bool accepted = respDict != null && respDict.ContainsKey("accepted") && Convert.ToBoolean(respDict["accepted"]);

                    if (!accepted)
                    {
                        string reason = respDict != null && respDict.ContainsKey("reason") ? respDict["reason"].ToString() : "Transfer declined by receiver.";
                        var declPayload = new Dictionary<string, object>();
                        declPayload["transferId"] = transferId;
                        declPayload["reason"] = reason;
                        _bridge.EmitEvent("fileshare:transfer-declined", declPayload);
                        return;
                    }

                    if (_transferCancelled) return;

                    // Notify UI transfer started
                    var startPayload = new Dictionary<string, object>();
                    startPayload["transferId"] = transferId;
                    startPayload["peer"] = peer;
                    startPayload["totalFiles"] = manifestFiles.Count;
                    startPayload["totalBytes"] = totalBytes;
                    _bridge.EmitEvent("fileshare:transfer-started", startPayload);

                    // 3. Upload files sequentially
                    long overallBytesSent = 0;
                    var sw = Stopwatch.StartNew();

                    for (int i = 0; i < manifestFiles.Count; i++)
                    {
                        if (_transferCancelled) break;
                        var fInfo = manifestFiles[i];
                        string filePath = fInfo["path"].ToString();
                        string fileName = fInfo["name"].ToString();
                        long fileLength = Convert.ToInt64(fInfo["size"]);
                        long fileBytesSent = 0;

                        string uploadUrl = string.Format("http://{0}:{1}/api/transfer/upload", peerIp, peerPort);
                        var uploadReq = (HttpWebRequest)WebRequest.Create(uploadUrl);
                        uploadReq.Method = "POST";
                        uploadReq.ContentType = "application/octet-stream";
                        uploadReq.Headers["x-transfer-id"] = transferId;
                        uploadReq.Headers["x-file-index"] = i.ToString();
                        uploadReq.Headers["x-file-name"] = Uri.EscapeDataString(fileName);
                        uploadReq.Headers["x-file-size"] = fileLength.ToString();
                        uploadReq.Headers["x-total-files"] = manifestFiles.Count.ToString();
                        uploadReq.Headers["x-total-size"] = totalBytes.ToString();
                        uploadReq.Headers["x-sender-name"] = Uri.EscapeDataString(DeviceName);
                        uploadReq.ContentLength = fileLength;
                        uploadReq.AllowWriteStreamBuffering = false;
                        uploadReq.Timeout = 600000;

                        using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 65536))
                        using (var upStream = uploadReq.GetRequestStream())
                        {
                            byte[] buffer = new byte[65536];
                            int bytesRead;
                            while ((bytesRead = fs.Read(buffer, 0, buffer.Length)) > 0)
                            {
                                if (_transferCancelled) break;
                                upStream.Write(buffer, 0, bytesRead);
                                fileBytesSent += bytesRead;
                                overallBytesSent += bytesRead;

                                double sec = sw.Elapsed.TotalSeconds;
                                long speed = sec > 0 ? (long)(overallBytesSent / sec) : 0;
                                int percent = totalBytes > 0 ? (int)((overallBytesSent * 100) / totalBytes) : 100;

                                var prog = new Dictionary<string, object>();
                                prog["transferId"] = transferId;
                                prog["fileIndex"] = i + 1;
                                prog["totalFiles"] = manifestFiles.Count;
                                prog["fileName"] = fileName;
                                prog["fileBytesSent"] = fileBytesSent;
                                prog["fileTotalBytes"] = fileLength;
                                prog["totalBytesSent"] = overallBytesSent;
                                prog["totalBytes"] = totalBytes;
                                prog["percent"] = Math.Min(percent, 100);
                                prog["speed"] = speed;

                                _bridge.EmitEvent("fileshare:transfer-progress", prog);
                            }
                        }

                        if (_transferCancelled) break;

                        using (var upRes = (HttpWebResponse)uploadReq.GetResponse()) { }
                    }

                    if (_transferCancelled)
                    {
                        var canPayload = new Dictionary<string, object>();
                        canPayload["transferId"] = transferId;
                        _bridge.EmitEvent("fileshare:transfer-cancelled", canPayload);
                        return;
                    }

                    // Completed!
                    var donePayload = new Dictionary<string, object>();
                    donePayload["transferId"] = transferId;
                    donePayload["totalFiles"] = manifestFiles.Count;
                    donePayload["totalBytes"] = totalBytes;
                    _bridge.EmitEvent("fileshare:transfer-completed", donePayload);
                }
                catch (Exception ex)
                {
                    var errPayload = new Dictionary<string, object>();
                    errPayload["message"] = ex.Message;
                    _bridge.EmitEvent("fileshare:transfer-error", errPayload);
                }
            });
        }

        public void CancelTransfer(string transferId)
        {
            _transferCancelled = true;
            _currentTransferId = null;
            var payload = new Dictionary<string, object>();
            payload["transferId"] = transferId;
            _bridge.EmitEvent("fileshare:transfer-cancelled", payload);
        }

        public void RespondToRequest(string transferId, bool accepted, string customDir)
        {
            PendingTcpRequest pr = null;
            lock (_pendingRequests)
            {
                if (_pendingRequests.ContainsKey(transferId))
                {
                    pr = _pendingRequests[transferId];
                    _pendingRequests.Remove(transferId);
                }
            }

            if (pr == null) return;
            if (pr.TimeoutTimer != null) pr.TimeoutTimer.Dispose();

            try
            {
                var resp = new Dictionary<string, object>();
                resp["accepted"] = accepted;
                resp["transferId"] = transferId;
                resp["saveDir"] = !string.IsNullOrEmpty(customDir) ? customDir : DownloadDir;
                if (!accepted) resp["reason"] = "Receiver declined the connection request.";

                byte[] bytes = Encoding.UTF8.GetBytes(Serializer.Serialize(resp));
                SendHttpRaw(pr.Stream, 200, "OK", "application/json", bytes);
            }
            catch { }
            finally
            {
                try { pr.Client.Close(); } catch { }
            }
        }

        private void DeclineRequest(string transferId, string reason)
        {
            RespondToRequest(transferId, false, null);
        }

        public Dictionary<string, object> GetNetworkStatus()
        {
            var result = new Dictionary<string, object>();
            result["connected"] = false;
            result["wifiAvailable"] = false;
            result["ssid"] = "";
            result["ip"] = GetPrimaryIp();
            result["signal"] = "";
            result["adapterName"] = "";

            try
            {
                var psi = new ProcessStartInfo("netsh", "wlan show interfaces")
                {
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (var proc = Process.Start(psi))
                {
                    string outStr = proc.StandardOutput.ReadToEnd();
                    proc.WaitForExit(3000);
                    if (!string.IsNullOrEmpty(outStr) && !outStr.Contains("There is no wireless interface"))
                    {
                        result["wifiAvailable"] = true;
                        foreach (string line in outStr.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
                        {
                            int colon = line.IndexOf(':');
                            if (colon > 0)
                            {
                                string key = line.Substring(0, colon).Trim().ToLower();
                                string val = line.Substring(colon + 1).Trim();
                                if (key == "state") result["connected"] = val.ToLower() == "connected";
                                else if (key == "ssid") result["ssid"] = val;
                                else if (key == "signal") result["signal"] = val;
                                else if (key == "name") result["adapterName"] = val;
                            }
                        }
                    }
                }
            }
            catch
            {
                result["connected"] = !result["ip"].ToString().StartsWith("127.");
            }

            return result;
        }

        public void EnableWifi()
        {
            try
            {
                var psi = new ProcessStartInfo("powershell", "-WindowStyle Hidden -Command \"Get-NetAdapter | Where-Object { $_.Name -like '*Wi-Fi*' -or $_.InterfaceDescription -like '*Wi-Fi*' -or $_.InterfaceDescription -like '*Wireless*' } | Enable-NetAdapter -Confirm:$false\"")
                {
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process.Start(psi);
            }
            catch { }

            try
            {
                Process.Start(new ProcessStartInfo("ms-settings:network-wifi") { UseShellExecute = true });
            }
            catch { }
        }

        public void EnableHotspot()
        {
            try
            {
                Process.Start(new ProcessStartInfo("ms-settings:network-mobilehotspot") { UseShellExecute = true });
            }
            catch { }
        }

        public void Destroy()
        {
            StopDiscovery();
            if (_tcpListener != null)
            {
                try { _tcpListener.Stop(); } catch { }
                _tcpListener = null;
            }
        }
    }
}
