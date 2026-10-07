using System;
using System.IO;
using System.Text;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;

namespace SharePort.WebView2App
{
    public class Bridge
    {
        private readonly Form _mainForm;
        private readonly TunnelEngine _engine;
        private CoreWebView2 _coreWebView;
        private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer();

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
    openExternal: (url) => invoke('system:open-url', url),
    copyClipboard: (txt) => invoke('system:copy-clipboard', txt),
    getAppVersion: () => invoke('system:get-version'),
    checkForUpdates: () => invoke('system:check-updates'),

    minimizeWindow: () => invoke('window:minimize'),
    maximizeWindow: () => invoke('window:maximize'),
    closeWindow: () => invoke('window:close'),
    isWindowMaximized: () => invoke('window:is-maximized'),
    onWindowMaximizeChange: (cb) => on('window:maximize-change', cb),
    startDrag: () => invoke('window:start-drag')
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
