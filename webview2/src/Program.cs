using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace SharePort.WebView2App
{
    public static class Program
    {
        private static readonly string LogFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "debug.log");

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern bool SetDllDirectory(string lpPathName);

        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
        private static extern IntPtr LoadLibrary(string lpFileName);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        public static void Log(string msg)
        {
            try
            {
                File.AppendAllText(LogFile, "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + msg + "\r\n");
            }
            catch { }
        }

        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                SetProcessDPIAware();
            }
            catch { }

            // 1. Setup embedded assembly resolver so missing DLLs on other laptops are loaded from embedded resources
            InitEmbeddedResolver();

            // 2. Extract native WebView2Loader.dll and dist if missing on target machine
            ExtractRuntimeFilesIfNeeded();

            // 3. Launch the application in a separate method to prevent CLR JIT resolving WebView2 types before resolver is registered
            LaunchApp(args);
        }

        private static void InitEmbeddedResolver()
        {
            AppDomain.CurrentDomain.AssemblyResolve += (sender, resolveArgs) =>
            {
                try
                {
                    string shortName = new AssemblyName(resolveArgs.Name).Name;
                    string resName = shortName + ".dll";

                    Assembly currentAssembly = Assembly.GetExecutingAssembly();
                    using (Stream stream = currentAssembly.GetManifestResourceStream(resName))
                    {
                        if (stream == null) return null;
                        byte[] rawBytes = new byte[stream.Length];
                        stream.Read(rawBytes, 0, rawBytes.Length);
                        Log("[Resolver] Successfully loaded embedded assembly: " + shortName);
                        return Assembly.Load(rawBytes);
                    }
                }
                catch (Exception ex)
                {
                    Log("[Resolver Error] " + ex.Message);
                    return null;
                }
            };
        }

        private static void ExtractRuntimeFilesIfNeeded()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string runtimeDir = Path.Combine(localApp, "SharePort", "runtime");
                if (!Directory.Exists(runtimeDir)) Directory.CreateDirectory(runtimeDir);

                // 1. Ensure WebView2Loader.dll exists for native interop
                string loaderInBase = Path.Combine(baseDir, "WebView2Loader.dll");
                string loaderInRuntime = Path.Combine(runtimeDir, "WebView2Loader.dll");

                if (!File.Exists(loaderInBase) && !File.Exists(loaderInRuntime))
                {
                    using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("WebView2Loader.dll"))
                    {
                        if (stream != null)
                        {
                            byte[] buffer = new byte[stream.Length];
                            stream.Read(buffer, 0, buffer.Length);

                            try
                            {
                                File.WriteAllBytes(loaderInBase, buffer);
                            }
                            catch
                            {
                                File.WriteAllBytes(loaderInRuntime, buffer);
                            }
                        }
                    }
                }

                if (Directory.Exists(runtimeDir))
                {
                    SetDllDirectory(runtimeDir);
                }
                if (File.Exists(loaderInBase))
                {
                    LoadLibrary(loaderInBase);
                }
                else if (File.Exists(loaderInRuntime))
                {
                    LoadLibrary(loaderInRuntime);
                }

                // 2. Ensure dist folder exists and is up-to-date with current executable version
                string distDir = Path.Combine(localApp, "SharePort", "dist");
                string appHtml = Path.Combine(distDir, "app.html");
                string buildIdFile = Path.Combine(distDir, ".build_id");

                string currentBuildId = Assembly.GetExecutingAssembly().ManifestModule.ModuleVersionId.ToString();
                bool shouldExtract = !File.Exists(appHtml) || !File.Exists(buildIdFile);

                if (!shouldExtract)
                {
                    try
                    {
                        string existingBuildId = File.ReadAllText(buildIdFile).Trim();
                        if (existingBuildId != currentBuildId)
                        {
                            shouldExtract = true;
                        }
                    }
                    catch
                    {
                        shouldExtract = true;
                    }
                }

                if (shouldExtract)
                {
                    using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("dist.zip"))
                    {
                        if (stream != null)
                        {
                            string tempZip = Path.Combine(runtimeDir, "dist_temp.zip");
                            using (FileStream fs = new FileStream(tempZip, FileMode.Create, FileAccess.Write))
                            {
                                stream.CopyTo(fs);
                            }
                            try
                            {
                                if (Directory.Exists(distDir)) Directory.Delete(distDir, true);
                            }
                            catch { }

                            ZipFile.ExtractToDirectory(tempZip, distDir);
                            try { File.Delete(tempZip); } catch { }
                            try { File.WriteAllText(buildIdFile, currentBuildId); } catch { }

                            // Also purge any stale WebView2 browser disk cache so the browser loads fresh assets
                            try
                            {
                                string cacheDir = Path.Combine(localApp, "SharePort", "WebView2", "EBWebView", "Default", "Cache");
                                if (Directory.Exists(cacheDir)) Directory.Delete(cacheDir, true);
                            }
                            catch { }

                            Log("[Program] Extracted updated embedded dist to: " + distDir + " (Build: " + currentBuildId + ")");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Log("[ExtractRuntimeFiles Error] " + ex.Message);
            }
        }

        [MethodImpl(MethodImplOptions.NoInlining)]
        private static void LaunchApp(string[] args)
        {
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
                if (ex.ToString().IndexOf("WebView2", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    DialogResult res = MessageBox.Show(
                        "Microsoft Edge WebView2 Runtime is required to run SHARE PORT.\r\n\r\n" +
                        "Would you like to download and install the official runtime from Microsoft now?",
                        "SHARE PORT - WebView2 Required",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Information);
                    if (res == DialogResult.Yes)
                    {
                        try { System.Diagnostics.Process.Start("https://go.microsoft.com/fwlink/p/?LinkId=2124703"); } catch { }
                    }
                }
                else
                {
                    MessageBox.Show("Fatal Error: " + ex.Message, "SHARE PORT", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }
    }
}
