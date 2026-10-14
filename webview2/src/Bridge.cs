using System;
using System.IO;
using System.Text;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;
using System.Net;
using System.Threading;
using Microsoft.Web.WebView2.Core;

namespace SharePort.WebView2App
{
    public class Bridge
    {
        private readonly Form _mainForm;
        private readonly TunnelEngine _engine;
        private CoreWebView2 _coreWebView;
        private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer();
        public FileShareEngine FileShare { get; private set; }

        [DllImport("user32.dll")]
        private static extern bool ReleaseCapture();

        [DllImport("user32.dll")]
        private static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);

        private const int WM_NCLBUTTONDOWN = 0xA1;
        private const int HTCAPTION = 0x2;

        public Bridge(Form form, TunnelEngine engine)
        {
            _mainForm = form;
            _engine = engine;
            FileShare = new FileShareEngine(form, this);

            _engine.OnStatusChanged = (status) =>
            {
                EmitEvent("tunnel:status-changed", status);
            };

            _engine.OnConsoleLog = (log) =>
            {
                EmitEvent("tunnel:console-log", log);
            };

            _engine.Gateway.OnNewInspectorLog = (log) =>
            {
                EmitEvent("inspector:new-log", log);
            };
        }

        public void Attach(CoreWebView2 coreWebView)
        {
            _coreWebView = coreWebView;
            _coreWebView.WebMessageReceived += OnWebMessageReceived;
        }

        public void EmitMaximizeChange(bool isMax)
        {
            EmitEvent("window:maximize-change", isMax);
        }

        public void EmitEvent(string eventName, object data)
        {
            if (_coreWebView == null) return;
            try
            {
                var msg = new Dictionary<string, object>();
                msg["event"] = eventName;
                msg["data"] = data;
                string json = Serializer.Serialize(msg);

                if (_mainForm.InvokeRequired)
                {
                    _mainForm.BeginInvoke((MethodInvoker)delegate
                    {
                        try { _coreWebView.PostWebMessageAsJson(json); } catch { }
                    });
                }
                else
                {
                    _coreWebView.PostWebMessageAsJson(json);
                }
            }
            catch { }
        }

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string raw = e.WebMessageAsJson;
            if (string.IsNullOrEmpty(raw)) return;

            ThreadPoolWorkItem(raw);
        }

        private void ThreadPoolWorkItem(string raw)
        {
            System.Threading.ThreadPool.QueueUserWorkItem(delegate
            {
                string id = "";
                string channel = "";
                object data = null;

                try
                {
                    var msg = Serializer.Deserialize<Dictionary<string, object>>(raw);
                    if (msg.ContainsKey("id") && msg["id"] != null) id = msg["id"].ToString();
                    if (msg.ContainsKey("channel") && msg["channel"] != null) channel = msg["channel"].ToString();
                    if (msg.ContainsKey("data")) data = msg["data"];
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Invalid JSON message from WebView2: " + ex.Message);
                    return;
                }

                try
                {
                    object result = DispatchChannel(channel, data);
                    SendReply(id, result, null);
                }
                catch (Exception ex)
                {
                    SendReply(id, null, ex.Message);
                }
            });
        }

        private object DispatchChannel(string channel, object data)
        {
            switch (channel)
            {
                case "tunnel:start":
                    {
                        var opts = data as Dictionary<string, object> ?? new Dictionary<string, object>();
                        return _engine.Start(opts);
                    }
                case "tunnel:stop":
                    return _engine.Stop();

                case "tunnel:get-status":
                    return _engine.State;

                case "tunnel:get-console":
                    return _engine.GetConsoleLogs();

                case "tunnel:clear-console":
                    _engine.ClearConsoleLogs();
                    return true;

                case "inspector:get-logs":
                    return _engine.Gateway.GetLogs();

                case "inspector:clear-logs":
                    _engine.Gateway.ClearLogs();
                    return true;

                case "api:send-request":
                    {
                        var reqConfig = data as Dictionary<string, object> ?? new Dictionary<string, object>();
                        return ApiClient.ExecuteRequest(reqConfig);
                    }

                case "config:get":
                    return ConfigManager.GetConfigValue(data != null ? data.ToString() : "");

                case "config:set":
                    {
                        if (data is Dictionary<string, object>)
                        {
                            var d = (Dictionary<string, object>)data;
                            string k = d.ContainsKey("key") && d["key"] != null ? d["key"].ToString() : "";
                            object v = d.ContainsKey("value") ? d["value"] : null;
                            return ConfigManager.SetConfigValue(k, v);
                        }
                        return false;
                    }

                case "config:get-all":
                    return ConfigManager.LoadConfig();

                case "config:save-profile":
                    {
                        var p = data as Dictionary<string, object> ?? new Dictionary<string, object>();
                        return ConfigManager.SaveProfile(p);
                    }

                case "config:delete-profile":
                    return ConfigManager.DeleteProfile(data != null ? data.ToString() : "");

                case "collections:get":
                    return ConfigManager.LoadCollections();

                case "collections:save":
                    return ConfigManager.SaveCollections(data);

                case "system:check-port":
                    {
                        int port = Convert.ToInt32(data);
                        return GatewayProxy.CheckPortActive(port);
                    }

                case "system:scan-ports":
                    {
                        int[] ports = null;
                        if (data is ArrayList)
                        {
                            var list = (ArrayList)data;
                            var pList = new List<int>();
                            foreach (var item in list) { try { pList.Add(Convert.ToInt32(item)); } catch { } }
                            if (pList.Count > 0) ports = pList.ToArray();
                        }
                        return GatewayProxy.ScanActivePorts(ports);
                    }

                case "system:open-url":
                    {
                        string url = data != null ? data.ToString() : "";
                        if (!string.IsNullOrEmpty(url)) Process.Start(url);
                        return true;
                    }

                case "system:copy-clipboard":
                    {
                        string txt = data != null ? data.ToString() : "";
                        _mainForm.Invoke((MethodInvoker)delegate
                        {
                            try { Clipboard.SetText(txt); } catch { }
                        });
                        return true;
                    }

                case "system:get-version":
                    return "2.0.0";

                case "system:check-updates":
                    {
                        var upd = new Dictionary<string, object>();
                        upd["hasUpdate"] = false;
                        upd["currentVersion"] = "2.0.0";
                        upd["latestVersion"] = "2.0.0";
                        return upd;
                    }

                case "window:start-drag":
                case "window:drag":
                    _mainForm.Invoke((MethodInvoker)delegate
                    {
                        if (_mainForm.WindowState == FormWindowState.Normal)
                        {
                            ReleaseCapture();
                            SendMessage(_mainForm.Handle, WM_NCLBUTTONDOWN, HTCAPTION, 0);
                        }
                    });
                    return true;

                case "window:minimize":
                    _mainForm.Invoke((MethodInvoker)delegate
                    {
                        _mainForm.WindowState = FormWindowState.Minimized;
                    });
                    return true;

                case "window:maximize":
                    bool isMax = false;
                    _mainForm.Invoke((MethodInvoker)delegate
                    {
                        if (_mainForm.WindowState == FormWindowState.Maximized)
                        {
                            _mainForm.WindowState = FormWindowState.Normal;
                            isMax = false;
                        }
                        else
                        {
                            _mainForm.WindowState = FormWindowState.Maximized;
                            isMax = true;
                        }
                    });
                    return isMax;

                case "window:close":
                    _mainForm.Invoke((MethodInvoker)delegate
                    {
                        _mainForm.Close();
                    });
                    return true;

                case "window:is-maximized":
                    {
                        bool isCurrentlyMax = false;
                        _mainForm.Invoke((MethodInvoker)delegate
                        {
                            isCurrentlyMax = (_mainForm.WindowState == FormWindowState.Maximized);
                        });
                        return isCurrentlyMax;
                    }

                case "fileshare:get-local-info":
                    return FileShare.GetLocalInfo();

                case "fileshare:open-folder":
                    {
                        string target = data != null ? data.ToString().Trim('"', ' ') : "";
                        try
                        {
                            if (!string.IsNullOrEmpty(target) && File.Exists(target))
                            {
                                // If a specific file was passed, open Explorer and select that file
                                Process.Start("explorer.exe", string.Format("/select,\"{0}\"", target));
                                return true;
                            }

                            if (string.IsNullOrEmpty(target) || !Directory.Exists(target))
                            {
                                target = FileShare.DownloadDir;
                            }

                            if (!Directory.Exists(target))
                            {
                                Directory.CreateDirectory(target);
                            }

                            Process.Start("explorer.exe", string.Format("\"{0}\"", target));
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("[Bridge] open-folder error: " + ex.Message);
                        }
                        return true;
                    }

                case "fileshare:direct-connect":
                    {
                        string ip = "127.0.0.1";
                        int port = 53318;
                        if (data is Dictionary<string, object>)
                        {
                            var dict = (Dictionary<string, object>)data;
                            if (dict.ContainsKey("ip") && dict["ip"] != null) ip = dict["ip"].ToString();
                            if (dict.ContainsKey("port") && dict["port"] != null) int.TryParse(dict["port"].ToString(), out port);
                        }
                        else if (data != null)
                        {
                            ip = data.ToString();
                        }
                        return FileShare.DirectConnect(ip, port);
                    }

                case "fileshare:scan-radar":
                    FileShare.ScanRadar();
                    return true;

                case "fileshare:start-discovery":
                    FileShare.StartDiscovery();
                    return true;

                case "fileshare:stop-discovery":
                    FileShare.StopDiscovery();
                    return true;

                case "fileshare:set-device-name":
                    if (data != null) FileShare.DeviceName = data.ToString();
                    return FileShare.DeviceName;

                case "fileshare:pick-files":
                    {
                        var list = new ArrayList();
                        _mainForm.Invoke((MethodInvoker)delegate
                        {
                            using (var ofd = new OpenFileDialog())
                            {
                                ofd.Title = "Select Files to Share Offline";
                                ofd.Multiselect = true;
                                if (ofd.ShowDialog(_mainForm) == DialogResult.OK)
                                {
                                    foreach (string file in ofd.FileNames)
                                    {
                                        var item = new Dictionary<string, object>();
                                        item["path"] = file;
                                        item["name"] = Path.GetFileName(file);
                                        try { item["size"] = new FileInfo(file).Length; } catch { item["size"] = 0; }
                                        item["ext"] = Path.GetExtension(file).TrimStart('.').ToLower();
                                        list.Add(item);
                                    }
                                }
                            }
                        });
                        return list;
                    }

                case "fileshare:pick-folder":
                    {
                        string selectedDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "SharePort_Received");
                        _mainForm.Invoke((MethodInvoker)delegate
                        {
                            using (var fbd = new FolderBrowserDialog())
                            {
                                fbd.Description = "Select Folder for Received Files";
                                fbd.SelectedPath = selectedDir;
                                if (fbd.ShowDialog(_mainForm) == DialogResult.OK)
                                {
                                    selectedDir = fbd.SelectedPath;
                                }
                            }
                        });
                        return selectedDir;
                    }

                case "fileshare:open-file":
                    {
                        string filePath = data != null ? data.ToString() : "";
                        if (!string.IsNullOrEmpty(filePath) && File.Exists(filePath))
                        {
                            try { Process.Start(filePath); return true; } catch { }
                        }
                        return false;
                    }

                case "fileshare:respond-request":
                    {
                        if (data is Dictionary<string, object>)
                        {
                            var dict = (Dictionary<string, object>)data;
                            string xferId = dict.ContainsKey("transferId") ? dict["transferId"].ToString() : "";
                            bool accepted = dict.ContainsKey("accepted") && Convert.ToBoolean(dict["accepted"]);
                            string customDir = dict.ContainsKey("customDir") && dict["customDir"] != null ? dict["customDir"].ToString() : null;
                            FileShare.RespondToRequest(xferId, accepted, customDir);
                        }
                        return true;
                    }

                case "fileshare:send-files":
                    {
                        if (data is Dictionary<string, object>)
                        {
                            var dict = (Dictionary<string, object>)data;
                            Dictionary<string, object> peer = null;
                            if (dict.ContainsKey("peer") && dict["peer"] is Dictionary<string, object>)
                            {
                                peer = (Dictionary<string, object>)dict["peer"];
                            }
                            var filePaths = new List<string>();
                            if (dict.ContainsKey("filePaths") && dict["filePaths"] is ArrayList)
                            {
                                foreach (var item in (ArrayList)dict["filePaths"])
                                {
                                    if (item != null) filePaths.Add(item.ToString());
                                }
                            }
                            FileShare.SendFiles(peer, filePaths);
                            return true;
                        }
                        return false;
                    }

                case "fileshare:cancel-transfer":
                    {
                        string xferId = data != null ? data.ToString() : "";
                        FileShare.CancelTransfer(xferId);
                        return true;
                    }

                case "fileshare:set-mode":
                    {
                        if (data != null) FileShare.CurrentMode = data.ToString();
                        FileShare.BroadcastBeacon();
                        return true;
                    }

                case "fileshare:connect-peer":
                    {
                        if (data is Dictionary<string, object>)
                        {
                            var dict = (Dictionary<string, object>)data;
                            string peerIp = dict.ContainsKey("ip") ? dict["ip"].ToString() : "";
                            int peerPort = dict.ContainsKey("port") ? Convert.ToInt32(dict["port"]) : 53318;
                            ThreadPool.QueueUserWorkItem(delegate
                            {
                                try
                                {
                                    var req = (HttpWebRequest)WebRequest.Create(string.Format("http://{0}:{1}/api/connect", peerIp, peerPort));
                                    req.Method = "POST";
                                    req.ContentType = "application/json";
                                    req.Timeout = 5000;
                                    var payload = new Dictionary<string, object>();
                                    payload["id"] = FileShare.DeviceId;
                                    payload["name"] = FileShare.DeviceName;
                                    payload["ip"] = FileShare.GetPrimaryIp();
                                    payload["port"] = FileShare.HttpPort;
                                    byte[] b = Encoding.UTF8.GetBytes(Serializer.Serialize(payload));
                                    req.ContentLength = b.Length;
                                    using (var os = req.GetRequestStream()) { os.Write(b, 0, b.Length); }
                                    using (var res = (HttpWebResponse)req.GetResponse()) { }
                                }
                                catch { }
                            });
                            return true;
                        }
                        return false;
                    }

                case "fileshare:disconnect-peer":
                    {
                        if (data is Dictionary<string, object>)
                        {
                            var dict = (Dictionary<string, object>)data;
                            string peerIp = dict.ContainsKey("ip") ? dict["ip"].ToString() : "";
                            int peerPort = dict.ContainsKey("port") ? Convert.ToInt32(dict["port"]) : 53318;
                            ThreadPool.QueueUserWorkItem(delegate
                            {
                                try
                                {
                                    var req = (HttpWebRequest)WebRequest.Create(string.Format("http://{0}:{1}/api/disconnect", peerIp, peerPort));
                                    req.Method = "POST";
                                    req.Timeout = 3000;
                                    using (var res = (HttpWebResponse)req.GetResponse()) { }
                                }
                                catch { }
                            });
                            return true;
                        }
                        return false;
                    }

                case "fileshare:get-network-status":
                    return FileShare.GetNetworkStatus();

                case "fileshare:enable-wifi":
                    FileShare.EnableWifi();
                    return true;

                case "fileshare:enable-hotspot":
                    FileShare.EnableHotspot();
                    return true;

                default:
                    Console.WriteLine("Unhandled channel: " + channel);
                    return null;
            }
        }

        private void SendReply(string id, object result, string error)
        {
            if (string.IsNullOrEmpty(id) || _coreWebView == null) return;
            try
            {
                var reply = new Dictionary<string, object>();
                reply["id"] = id;
                reply["success"] = error == null;
                if (error != null) reply["error"] = error;
                else reply["result"] = result;

                string json = Serializer.Serialize(reply);

                _mainForm.BeginInvoke((MethodInvoker)delegate
                {
                    try { _coreWebView.PostWebMessageAsJson(json); } catch { }
                });
            }
            catch { }
        }

        public static string GetInjectedScript()
        {
            return @"(function() {
  const pending = {};
  const listeners = {};

  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener('message', function(e) {
      let msg = e.data;
      if (!msg) return;
      if (typeof msg === 'string') {
        try { msg = JSON.parse(msg); } catch(err) {}
      }
      if (!msg) return;
      if (msg.id && pending[msg.id]) {
        if (msg.error) pending[msg.id].reject(new Error(msg.error));
        else pending[msg.id].resolve(msg.result);
        delete pending[msg.id];
      } else if (msg.event) {
        const list = listeners[msg.event] || [];
        list.forEach(fn => { try { fn(msg.data); } catch(err) { console.error(err); } });
      }
    });
  }

  function invoke(channel, data) {
    return new Promise((resolve, reject) => {
      const id = 'req_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      pending[id] = { resolve, reject };
      if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage({ id, channel, data });
      } else {
        reject(new Error('WebView2 bridge not initialized'));
      }
    });
  }

  function on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
    return () => {
      listeners[event] = (listeners[event] || []).filter(fn => fn !== callback);
    };
  }

  window.electronAPI = {
    startTunnel: (opts) => invoke('tunnel:start', opts),
    stopTunnel: () => invoke('tunnel:stop'),
    getTunnelStatus: () => invoke('tunnel:get-status'),
    getConsoleLogs: () => invoke('tunnel:get-console'),
    clearConsoleLogs: () => invoke('tunnel:clear-console'),
    onConsoleLog: (cb) => on('tunnel:console-log', cb),
    onTunnelStatusChange: (cb) => on('tunnel:status-changed', cb),

    getInspectorLogs: () => invoke('inspector:get-logs'),
    clearInspectorLogs: () => invoke('inspector:clear-logs'),
    onInspectorLog: (cb) => on('inspector:new-log', cb),

    sendApiRequest: (req) => invoke('api:send-request', req),

    getConfig: (k) => invoke('config:get', k),
    setConfig: (k, v) => invoke('config:set', { key: k, value: v }),
    getAllConfig: () => invoke('config:get-all'),
    saveProfile: (p) => invoke('config:save-profile', p),
    deleteProfile: (name) => invoke('config:delete-profile', name),

    getCollections: () => invoke('collections:get'),
    saveCollections: (c) => invoke('collections:save', c),

    checkPort: (p) => invoke('system:check-port', p),
    scanPorts: (list) => invoke('system:scan-ports', list),
    openExternal: (url) => invoke('system:open-url', url),
    copyClipboard: (txt) => invoke('system:copy-clipboard', txt),
    getAppVersion: () => invoke('system:get-version'),
    checkForUpdates: () => invoke('system:check-updates'),

    minimizeWindow: () => invoke('window:minimize'),
    maximizeWindow: () => invoke('window:maximize'),
    closeWindow: () => invoke('window:close'),
    isWindowMaximized: () => invoke('window:is-maximized'),
    onWindowMaximizeChange: (cb) => on('window:maximize-change', cb),
    startDrag: () => invoke('window:start-drag'),

    fileShare: {
      getLocalInfo: () => invoke('fileshare:get-local-info'),
      setDeviceName: (name) => invoke('fileshare:set-device-name', name),
      startDiscovery: () => invoke('fileshare:start-discovery'),
      stopDiscovery: () => invoke('fileshare:stop-discovery'),
      scanRadar: () => invoke('fileshare:scan-radar'),
      directConnect: (ip, port) => invoke('fileshare:direct-connect', { ip: ip, port: port }),
      pickFiles: () => invoke('fileshare:pick-files'),
      pickFolder: () => invoke('fileshare:pick-folder'),
      sendFiles: (peer, filePaths) => invoke('fileshare:send-files', { peer: peer, filePaths: filePaths }),
      respondToRequest: (transferId, accepted, customDir) => invoke('fileshare:respond-request', { transferId: transferId, accepted: accepted, customDir: customDir }),
      cancelTransfer: (transferId) => invoke('fileshare:cancel-transfer', transferId),
      openFolder: (f) => invoke('fileshare:open-folder', f),
      openFile: (f) => invoke('fileshare:open-file', f),
      getNetworkStatus: () => invoke('fileshare:get-network-status'),
      enableWifi: () => invoke('fileshare:enable-wifi'),
      enableHotspot: () => invoke('fileshare:enable-hotspot'),
      setMode: (mode) => invoke('fileshare:set-mode', mode),
      connectPeer: (peer) => invoke('fileshare:connect-peer', peer),
      disconnectPeer: (peer) => invoke('fileshare:disconnect-peer', peer),
      onPeersUpdated: (cb) => on('fileshare:peers-updated', cb),
      onPeerConnected: (cb) => on('fileshare:peer-connected', cb),
      onPeerDisconnected: (cb) => on('fileshare:peer-disconnected', cb),
      onIncomingRequest: (cb) => on('fileshare:incoming-request', cb),
      onTransferStarted: (cb) => on('fileshare:transfer-started', cb),
      onTransferProgress: (cb) => on('fileshare:transfer-progress', cb),
      onTransferCompleted: (cb) => on('fileshare:transfer-completed', cb),
      onTransferDeclined: (cb) => on('fileshare:transfer-declined', cb),
      onTransferCancelled: (cb) => on('fileshare:transfer-cancelled', cb),
      onTransferError: (cb) => on('fileshare:transfer-error', cb),
      onSenderWaitingAcceptance: (cb) => on('fileshare:sender-waiting-acceptance', cb)
    }
  };

  document.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    var target = e.target;
    while (target && target !== document.body) {
      if (target.tagName === 'BUTTON' || target.tagName === 'A' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      var st = window.getComputedStyle(target);
      if (st.webkitAppRegion === 'drag' || st.getPropertyValue('-webkit-app-region') === 'drag') {
        invoke('window:start-drag');
        return;
      }
      target = target.parentElement;
    }
  });

  document.addEventListener('dblclick', function(e) {
    var target = e.target;
    while (target && target !== document.body) {
      if (target.tagName === 'BUTTON' || target.tagName === 'A' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      var st = window.getComputedStyle(target);
      if (st.webkitAppRegion === 'drag' || st.getPropertyValue('-webkit-app-region') === 'drag') {
        invoke('window:maximize');
        return;
      }
      target = target.parentElement;
    }
  });
})();";
        }
    }
}
