using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace SharePort.WebView2App
{
    public static class Program
    {
        private static readonly string LogFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "debug.log");

        public static void Log(string msg)
        {
            try
            {
                File.AppendAllText(LogFile, "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + msg + "\r\n");
            }
            catch { }
        }

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                SetProcessDPIAware();
            }
            catch { }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (s, exArgs) =>
            {
                Log("[ThreadException] " + exArgs.Exception.ToString());
                MessageBox.Show("Thread Error: " + exArgs.Exception.Message, "SHARE PORT Error");
            };
            AppDomain.CurrentDomain.UnhandledException += (s, exArgs) =>
            {
                Log("[UnhandledException] " + exArgs.ExceptionObject.ToString());
            };

            bool isDev = false;
            foreach (string arg in args)
            {
                if (arg.Equals("--dev", StringComparison.OrdinalIgnoreCase))
                {
                    isDev = true;
                    break;
                }
            }

            try
            {
                Log("Starting Application.Run...");
                Application.Run(new MainWindow(isDev));
                Log("Application.Run exited normally.");
            }
            catch (Exception ex)
            {
                Log("[Catch] " + ex.ToString());
                MessageBox.Show("Fatal Error: " + ex.Message, "SHARE PORT", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
