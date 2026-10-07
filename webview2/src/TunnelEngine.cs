using System;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;

namespace SharePort.WebView2App
{
    public class TunnelEngine
    {
        public GatewayProxy Gateway { get; private set; }

        private Process _tunnelProcess;
        private readonly object _processLock = new object();

        public Dictionary<string, object> State { get; private set; }

        public Action<Dictionary<string, object>> OnStatusChanged { get; set; }
        public Action<Dictionary<string, object>> OnConsoleLog { get; set; }

        private readonly List<Dictionary<string, object>> _consoleLogs = new List<Dictionary<string, object>>();
        private readonly object _consoleLock = new object();
        private const int MaxConsoleLogs = 500;

        private static readonly Regex UrlRegex = new Regex(@"https://[a-zA-Z0-9\-\.\:]+", RegexOptions.Compiled);

        public TunnelEngine()
        {
            Gateway = new GatewayProxy();
            ResetState();
        }

        private void ResetState()
        {
            State = new Dictionary<string, object>();
            State["status"] = "STOPPED";
            State["publicUrl"] = "";
            State["localPort"] = 3000;
            State["inspectorPort"] = null;
            State["provider"] = "cloudflare";
            State["mode"] = "fixed";
            State["subdomain"] = "";
            State["error"] = "";
        }

        public List<Dictionary<string, object>> GetConsoleLogs()
        {
            lock (_consoleLock)
            {
                return new List<Dictionary<string, object>>(_consoleLogs);
            }
        }

        public void ClearConsoleLogs()
        {
            lock (_consoleLock)
            {
                _consoleLogs.Clear();
            }
        }

        public static string SanitizeLogLine(string rawLine)
        {
            if (string.IsNullOrEmpty(rawLine)) return null;

            string line = rawLine.Trim();

            // 1. Filter out internal diagnostic spam, pre-checks, metrics, and network probing (security loopholes)
            if (line.IndexOf("ICMP proxy will use", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("metrics server on", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("CONNECTIVITY PRE-CHECKS", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("COMPONENT TARGET STATUS DETAILS", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("DNS Resolution", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("UDP Connectivity", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("TCP Connectivity", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("Cloudflare API", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("precheck component", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("precheck complete", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("SUMMARY: Environment is healthy", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("Initial protocol", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("Generated Connector ID", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("Tunnel connection curve preferences", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("does not support loading the system root certificate pool", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("StrictHostKeyChecking", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("UserKnownHostsFile", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("ServerAliveInterval", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.StartsWith("+---") ||
                line.StartsWith("| "))
            {
                return null;
            }

            // 2. Format connection success cleanly without leaking edge IPs, hashes, or locations
            if (line.IndexOf("Registered tunnel connection", StringComparison.OrdinalIgnoreCase) >= 0 ||
                line.IndexOf("connection=", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return "[Tunnel Engine] Secure edge connection established (Protocol: QUIC/HTTPS).";
            }

            // 3. Mask any private IPv4 addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
            line = Regex.Replace(line, @"\b(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3})\b", "[PROTECTED_IP]");

            // 4. Mask IPv6 addresses (e.g. fe80::...)
            line = Regex.Replace(line, @"\bfe80:[0-9a-fA-F:]+\b", "[PROTECTED_IPV6]");

            // 5. Mask Windows user profiles & paths (e.g. C:\Users\Username...)
            line = Regex.Replace(line, @"[A-Za-z]:\\[Uu]sers\\[^\\]+", "~");

            // 6. Mask internal GUIDs / Connector IDs / Run IDs
            line = Regex.Replace(line, @"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", "[ID_PROTECTED]");

            // 7. Strip Cloudflare log prefix noise: e.g. "2026-10-07T09:20:50Z INF "
            line = Regex.Replace(line, @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s+(INF|WRN|ERR)\s+", "");

            return line.Trim();
        }

        public void AppendConsoleLog(string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            string[] lines = text.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (string line in lines)
            {
                string clean = SanitizeLogLine(line);
                if (string.IsNullOrEmpty(clean)) continue;

                var item = new Dictionary<string, object>();
                item["id"] = "c_" + DateTime.UtcNow.Ticks + "_" + Guid.NewGuid().ToString("N").Substring(0, 4);
                item["time"] = DateTime.Now.ToString("HH:mm:ss");
                item["text"] = clean;

                lock (_consoleLock)
                {
                    _consoleLogs.Add(item);
                    if (_consoleLogs.Count > MaxConsoleLogs) _consoleLogs.RemoveAt(0);
                }

                if (OnConsoleLog != null)
                {
                    try { OnConsoleLog(item); } catch { }
                }
            }
        }

        private void EmitStatus(string status, string url = "", string error = "")
        {
            State["status"] = status;
            if (!string.IsNullOrEmpty(url)) State["publicUrl"] = url;
            if (!string.IsNullOrEmpty(error)) State["error"] = error;

            if (OnStatusChanged != null)
            {
                try { OnStatusChanged(new Dictionary<string, object>(State)); } catch { }
            }
        }

        public string GetCloudflaredPath()
        {
            string targetExe = Path.Combine(ConfigManager.BinDir, "cloudflared.exe");
            if (File.Exists(targetExe))
            {
                FileInfo fi = new FileInfo(targetExe);
                if (fi.Length > 5 * 1024 * 1024) return targetExe;
            }

            // Check system PATH
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("where", "cloudflared");
                psi.RedirectStandardOutput = true;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                using (var p = Process.Start(psi))
                {
                    if (p != null)
                    {
                        string outStr = p.StandardOutput.ReadToEnd().Trim();
                        p.WaitForExit();
                        string[] lines = outStr.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                        if (lines.Length > 0 && File.Exists(lines[0].Trim()))
                        {
                            return lines[0].Trim();
                        }
                    }
                }
            }
            catch { }

            // Download official cloudflared binary
            AppendConsoleLog("[Share Port] Downloading cloudflared.exe binary...");
            string downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
            try
            {
                using (WebClient wc = new WebClient())
                {
                    wc.DownloadFile(downloadUrl, targetExe);
                }
                if (File.Exists(targetExe))
                {
                    FileInfo fi = new FileInfo(targetExe);
                    if (fi.Length > 5 * 1024 * 1024) return targetExe;
                }
            }
            catch (Exception ex)
            {
                AppendConsoleLog("[Share Port] Cloudflared download failed: " + ex.Message);
            }

            return "cloudflared";
        }

        public string GetSshPath()
        {
            string sysRoot = Environment.GetEnvironmentVariable("SystemRoot") ?? @"C:\Windows";
            string[] candidates = new string[] {
                Path.Combine(sysRoot, "System32", "OpenSSH", "ssh.exe"),
                Path.Combine(sysRoot, "System32", "ssh.exe"),
                Path.Combine(sysRoot, "SysWOW64", "OpenSSH", "ssh.exe")
            };
            foreach (string p in candidates)
            {
                if (File.Exists(p)) return p;
            }
            return "ssh";
        }

        public Dictionary<string, object> Start(Dictionary<string, object> options)
        {
            Stop();

            int port = options.ContainsKey("port") ? Convert.ToInt32(options["port"]) : 3000;
            string provider = options.ContainsKey("provider") && options["provider"] != null ? options["provider"].ToString() : "cloudflare";
            string mode = options.ContainsKey("mode") && options["mode"] != null ? options["mode"].ToString() : "fixed";
            string subdomain = options.ContainsKey("subdomain") && options["subdomain"] != null ? options["subdomain"].ToString() : "";
            bool enableInspector = !options.ContainsKey("enableInspector") || Convert.ToBoolean(options["enableInspector"]);
            int backendPort = options.ContainsKey("backendPort") ? Convert.ToInt32(options["backendPort"]) : 8000;
            bool enableFullstack = options.ContainsKey("enableFullstack") && Convert.ToBoolean(options["enableFullstack"]);

            State["localPort"] = port;
            State["provider"] = provider;
            State["mode"] = mode;
            State["subdomain"] = subdomain;
            State["error"] = "";
            EmitStatus("STARTING");

            int targetPort = port;
            try
            {
                int gwPort = Gateway.Start(port, backendPort, enableFullstack, enableInspector);
                State["inspectorPort"] = gwPort;
                targetPort = gwPort;
            }
            catch (Exception ex)
            {
                AppendConsoleLog("Gateway fallback to local port: " + ex.Message);
            }

            string command = "";
            string args = "";

            if (provider == "cloudflare")
            {
                command = GetCloudflaredPath();
                args = string.Format("tunnel --url http://127.0.0.1:{0}", targetPort);
            }
            else if (provider == "serveo")
            {
                command = GetSshPath();
                string keyPath = ConfigManager.EnsureSshKey();
                string cleanSub = Regex.Replace(subdomain ?? "", @"[^a-zA-Z0-9\-]", "").ToLower();
                string remoteSpec = (mode != "random" && cleanSub.Length > 0)
                    ? string.Format("{0}:80:127.0.0.1:{1}", cleanSub, targetPort)
                    : string.Format("0:80:127.0.0.1:{1}", targetPort);

                args = string.Format("-T -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -o ConnectTimeout=10 -o ServerAliveInterval=30 -i \"{0}\" -R {1} serveo.net",
                    keyPath, remoteSpec);
            }
            else if (provider == "localhost_run")
            {
                command = GetSshPath();
                string keyPath = ConfigManager.EnsureSshKey();
                args = string.Format("-T -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=30 -i \"{0}\" -R 80:127.0.0.1:{1} nokey@localhost.run",
                    keyPath, targetPort);
            }
            else if (provider == "pinggy")
            {
                command = GetSshPath();
                string keyPath = ConfigManager.EnsureSshKey();
                args = string.Format("-T -p 443 -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -o BatchMode=yes -o ConnectTimeout=10 -i \"{0}\" -R 0:127.0.0.1:{1} a:X-Pinggy-No-Screen:true@a.pinggy.io",
                    keyPath, targetPort);
            }

            AppendConsoleLog(string.Format("[Tunnel Engine] Launching secure {0} worker for port {1}...", provider.ToUpper(), targetPort));

            bool urlFound = false;
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = command;
                psi.Arguments = args;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;

                Process p = new Process();
                p.StartInfo = psi;
                p.EnableRaisingEvents = true;

                DataReceivedEventHandler outputHandler = (sender, e) =>
                {
                    if (string.IsNullOrEmpty(e.Data)) return;
                    AppendConsoleLog(e.Data);

                    if (!urlFound)
                    {
                        var matches = UrlRegex.Matches(e.Data);
                        foreach (Match m in matches)
                        {
                            string url = m.Value.TrimEnd('.', ',', ';', ':');
                            string lower = url.ToLower();

                            if (lower.Contains("console.serveo.net"))
                            {
                                continue;
                            }

                            if (lower.Contains("trycloudflare.com") ||
                                lower.Contains("serveousercontent.com") ||
                                lower.Contains("serveo.net") ||
                                lower.Contains("lhr.life") ||
                                lower.Contains("pinggy"))
                            {
                                urlFound = true;
                                AppendConsoleLog("[Tunnel Engine] Tunnel established! Public URL: " + url);
                                EmitStatus("CONNECTED", url);
                                break;
                            }
                        }
                    }
                };

                p.OutputDataReceived += outputHandler;
                p.ErrorDataReceived += outputHandler;

                p.Exited += (sender, e) =>
                {
                    lock (_processLock)
                    {
                        if (State["status"].ToString() == "CONNECTED" || State["status"].ToString() == "STARTING")
                        {
                            EmitStatus("STOPPED", "", p.ExitCode != 0 ? "Tunnel exited with code " + p.ExitCode : "");
                        }
                    }
                };

                lock (_processLock)
                {
                    p.Start();
                    p.BeginOutputReadLine();
                    p.BeginErrorReadLine();
                    _tunnelProcess = p;
                }

                // 30s connection timeout check
                ThreadPool.QueueUserWorkItem(delegate
                {
                    Thread.Sleep(30000);
                    lock (_processLock)
                    {
                        if (!urlFound && State["status"].ToString() == "STARTING")
                        {
                            EmitStatus("ERROR", "", "Connection timed out. Please verify your internet connection or switch connection engine.");
                        }
                    }
                });

                return new Dictionary<string, object>(State);
            }
            catch (Exception ex)
            {
                EmitStatus("ERROR", "", ex.Message);
                return new Dictionary<string, object>(State);
            }
        }

        public Dictionary<string, object> Stop()
        {
            lock (_processLock)
            {
                if (_tunnelProcess != null)
                {
                    try
                    {
                        int pid = _tunnelProcess.Id;
                        ProcessStartInfo psi = new ProcessStartInfo("taskkill", string.Format("/pid {0} /T /F", pid));
                        psi.CreateNoWindow = true;
                        psi.UseShellExecute = false;
                        var killProc = Process.Start(psi);
                        if (killProc != null) killProc.WaitForExit(3000);
                    }
                    catch { }

                    try
                    {
                        if (!_tunnelProcess.HasExited) _tunnelProcess.Kill();
                    }
                    catch { }
                    _tunnelProcess = null;
                }
            }

            try
            {
                Gateway.Stop();
            }
            catch { }

            State["publicUrl"] = "";
            State["status"] = "STOPPED";
            EmitStatus("STOPPED");

            return new Dictionary<string, object>(State);
        }
    }
}
