using System;
using System.IO;
using System.Drawing;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SharePort.WebView2App
{
    public class MainWindow : Form
    {
        private WebView2 _webView;
        private TunnelEngine _engine;
        private Bridge _bridge;
        private bool _isDev = false;

        private const int ResizeBorderWidth = 6;
        private const int WM_NCHITTEST = 0x84;
        private const int HTCLIENT = 1;
        private const int HTLEFT = 10;
        private const int HTRIGHT = 11;
        private const int HTTOP = 12;
        private const int HTTOPLEFT = 13;
        private const int HTTOPRIGHT = 14;
        private const int HTBOTTOM = 15;
        private const int HTBOTTOMLEFT = 16;
        private const int HTBOTTOMRIGHT = 17;

        private const int WM_GETMINMAXINFO = 0x0024;
        private const uint MONITOR_DEFAULTTONEAREST = 0x00000002;

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public int X;
            public int Y;
            public POINT(int x, int y) { this.X = x; this.Y = y; }
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MINMAXINFO
        {
            public POINT ptReserved;
            public POINT ptMaxSize;
            public POINT ptMaxPosition;
            public POINT ptMinTrackSize;
            public POINT ptMaxTrackSize;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MONITORINFO
        {
            public int cbSize;
            public RECT rcMonitor;
            public RECT rcWork;
            public int dwFlags;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

        public MainWindow(bool isDev = false)
        {
            Program.Log("[MainWindow] Constructor start.");
            _isDev = isDev;
            _engine = new TunnelEngine();
            Program.Log("[MainWindow] TunnelEngine created.");
            _bridge = new Bridge(this, _engine);
            Program.Log("[MainWindow] Bridge created.");

            InitializeComponent();
            Program.Log("[MainWindow] InitializeComponent finished.");
        }

        private void InitializeComponent()
        {
            this.Text = "SHARE PORT";
            this.Width = 1280;
            this.Height = 840;
            this.MinimumSize = new Size(1024, 700);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.None;
            this.WindowState = FormWindowState.Maximized;
            this.DoubleBuffered = true;
            this.SetStyle(ControlStyles.ResizeRedraw, true);

            // Set app icon if available
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string iconPath = Path.Combine(appDir, "app_icon.ico");
            if (!File.Exists(iconPath))
            {
                iconPath = Path.Combine(appDir, "..", "app_icon.ico");
            }
            if (File.Exists(iconPath))
            {
                try { this.Icon = new Icon(iconPath); } catch { }
            }

            _webView = new WebView2();
            _webView.Dock = DockStyle.Fill;
            this.Controls.Add(_webView);

            this.Load += MainWindow_Load;
            this.FormClosing += MainWindow_FormClosing;
            this.Resize += MainWindow_Resize;
        }

        private void MainWindow_Resize(object sender, EventArgs e)
        {
            if (_bridge != null)
            {
                _bridge.EmitMaximizeChange(this.WindowState == FormWindowState.Maximized);
            }
        }

        private async void MainWindow_Load(object sender, EventArgs e)
        {
            try
            {
                Program.Log("[MainWindow] Form Load started.\r\n");
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string uDataFolder = Path.Combine(localAppData, "SharePort", "WebView2");
                if (!Directory.Exists(uDataFolder)) Directory.CreateDirectory(uDataFolder);

                Program.Log("[MainWindow] Creating CoreWebView2Environment...\r\n");
                var env = await CoreWebView2Environment.CreateAsync(null, uDataFolder);
                Program.Log("[MainWindow] Initializing EnsureCoreWebView2Async...\r\n");
                await _webView.EnsureCoreWebView2Async(env);
                Program.Log("[MainWindow] WebView2 initialized successfully.\r\n");

                var settings = _webView.CoreWebView2.Settings;
                settings.IsScriptEnabled = true;
                settings.IsWebMessageEnabled = true;
                settings.AreDefaultContextMenusEnabled = true;
                settings.AreDevToolsEnabled = true;
                settings.IsStatusBarEnabled = false;
                settings.IsZoomControlEnabled = false;

                // Inject electronAPI bridge before document creates
                await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(Bridge.GetInjectedScript());
                Program.Log("[MainWindow] Injected script registered.\r\n");

                // Attach message dispatcher
                _bridge.Attach(_webView.CoreWebView2);

                // Locate dist folder for production assets (prioritize repo root dist)
                string appDir = AppDomain.CurrentDomain.BaseDirectory;
                string[] candidates = new string[] {
                    Path.Combine(appDir, "..", "..", "dist"),
                    Path.Combine(Directory.GetCurrentDirectory(), "dist"),
                    Path.Combine(appDir, "..", "dist"),
                    Path.Combine(appDir, "dist")
                };

                string distDir = "";
                DateTime latestWrite = DateTime.MinValue;
                foreach (string c in candidates)
                {
                    if (Directory.Exists(c))
                    {
                        string appHtml = Path.Combine(c, "app.html");
                        if (File.Exists(appHtml))
                        {
                            DateTime wt = File.GetLastWriteTime(appHtml);
                            if (wt > latestWrite)
                            {
                                latestWrite = wt;
                                distDir = Path.GetFullPath(c);
                            }
                        }
                        else if (string.IsNullOrEmpty(distDir))
                        {
                            distDir = Path.GetFullPath(c);
                        }
                    }
                }
                Program.Log("[MainWindow] distDir resolved: " + distDir + "\r\n");

                if (!string.IsNullOrEmpty(distDir))
                {
                    _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        "app.shareport.local",
                        distDir,
                        CoreWebView2HostResourceAccessKind.Allow
                    );
                }

                _webView.CoreWebView2.NavigationCompleted += (sArgs, navArgs) =>
                {
                    Program.Log("[MainWindow] Navigation completed. Success: " + navArgs.IsSuccess + ", Error: " + navArgs.WebErrorStatus + "\r\n");
                };

                _webView.CoreWebView2.WebResourceResponseReceived += (sArgs, resArgs) =>
                {
                    Program.Log("[Resource] " + resArgs.Request.Uri + " -> " + resArgs.Response.StatusCode + "\r\n");
                };

                if (_isDev)
                {
                    Program.Log("[MainWindow] Navigating to http://localhost:5173\r\n");
                    _webView.CoreWebView2.Navigate("http://localhost:5173");
                }
                else
                {
                    long verTicks = latestWrite != DateTime.MinValue ? latestWrite.Ticks : DateTime.UtcNow.Ticks;
                    string targetPage = "https://app.shareport.local/app.html?v=" + verTicks;
                    if (!string.IsNullOrEmpty(distDir) && !File.Exists(Path.Combine(distDir, "app.html")) && File.Exists(Path.Combine(distDir, "index.html")))
                    {
                        targetPage = "https://app.shareport.local/index.html?v=" + verTicks;
                    }
                    Program.Log("[MainWindow] Navigating to " + targetPage + "\r\n");
                    _webView.CoreWebView2.Navigate(targetPage);
                }
            }
            catch (Exception ex)
            {
                Program.Log("[MainWindow Error] " + ex.ToString() + "\r\n");
                MessageBox.Show(
                    "Error initializing WebView2 runtime: " + ex.Message + "\n\nPlease ensure the Microsoft Edge WebView2 Evergreen Runtime is installed.",
                    "SHARE PORT - Initialization Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private void MainWindow_FormClosing(object sender, FormClosingEventArgs e)
        {
            if (_engine != null)
            {
                _engine.Stop();
            }
        }

        // Enable smooth window border resizing and proper taskbar-respecting maximization for frameless window
        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_GETMINMAXINFO)
            {
                base.WndProc(ref m);
                WmGetMinMaxInfo(m.HWnd, m.LParam);
                return;
            }

            base.WndProc(ref m);

            if (m.Msg == WM_NCHITTEST && (int)m.Result == HTCLIENT)
            {
                if (this.WindowState == FormWindowState.Maximized) return;

                Point clientPoint = this.PointToClient(new Point(m.LParam.ToInt32()));
                int w = this.ClientSize.Width;
                int h = this.ClientSize.Height;

                if (clientPoint.X <= ResizeBorderWidth)
                {
                    if (clientPoint.Y <= ResizeBorderWidth) m.Result = (IntPtr)HTTOPLEFT;
                    else if (clientPoint.Y >= h - ResizeBorderWidth) m.Result = (IntPtr)HTBOTTOMLEFT;
                    else m.Result = (IntPtr)HTLEFT;
                }
                else if (clientPoint.X >= w - ResizeBorderWidth)
                {
                    if (clientPoint.Y <= ResizeBorderWidth) m.Result = (IntPtr)HTTOPRIGHT;
                    else if (clientPoint.Y >= h - ResizeBorderWidth) m.Result = (IntPtr)HTBOTTOMRIGHT;
                    else m.Result = (IntPtr)HTRIGHT;
                }
                else if (clientPoint.Y <= ResizeBorderWidth)
                {
                    m.Result = (IntPtr)HTTOP;
                }
                else if (clientPoint.Y >= h - ResizeBorderWidth)
                {
                    m.Result = (IntPtr)HTBOTTOM;
                }
            }
        }

        private void WmGetMinMaxInfo(IntPtr hwnd, IntPtr lParam)
        {
            try
            {
                MINMAXINFO mmi = (MINMAXINFO)Marshal.PtrToStructure(lParam, typeof(MINMAXINFO));
                IntPtr monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
                if (monitor != IntPtr.Zero)
                {
                    MONITORINFO mi = new MONITORINFO();
                    mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
                    if (GetMonitorInfo(monitor, ref mi))
                    {
                        mmi.ptMaxPosition.X = Math.Abs(mi.rcWork.Left - mi.rcMonitor.Left);
                        mmi.ptMaxPosition.Y = Math.Abs(mi.rcWork.Top - mi.rcMonitor.Top);
                        mmi.ptMaxSize.X = Math.Abs(mi.rcWork.Right - mi.rcWork.Left);
                        mmi.ptMaxSize.Y = Math.Abs(mi.rcWork.Bottom - mi.rcWork.Top);
                        mmi.ptMaxTrackSize.X = mmi.ptMaxSize.X;
                        mmi.ptMaxTrackSize.Y = mmi.ptMaxSize.Y;
                    }
                }
                mmi.ptMinTrackSize.X = 1024;
                mmi.ptMinTrackSize.Y = 700;
                Marshal.StructureToPtr(mmi, lParam, true);
            }
            catch (Exception ex)
            {
                Program.Log("[WM_GETMINMAXINFO Error] " + ex.Message + "\r\n");
            }
        }
    }
}
