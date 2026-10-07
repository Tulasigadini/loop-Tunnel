using System;
using System.IO;
using System.Collections;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Diagnostics;

namespace SharePort.WebView2App
{
    public static class ConfigManager
    {
        public static readonly string UserHome = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        public static readonly string SharePortDir = Path.Combine(UserHome, ".shareport");
        public static readonly string ConfigFile = Path.Combine(SharePortDir, "config.json");
        public static readonly string CollectionsFile = Path.Combine(SharePortDir, "collections.json");
        public static readonly string BinDir = Path.Combine(SharePortDir, "bin");
        public static readonly string KeysDir = Path.Combine(SharePortDir, "keys");

        private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer();

        static ConfigManager()
        {
            try
            {
                if (!Directory.Exists(SharePortDir)) Directory.CreateDirectory(SharePortDir);
                if (!Directory.Exists(BinDir)) Directory.CreateDirectory(BinDir);
                if (!Directory.Exists(KeysDir)) Directory.CreateDirectory(KeysDir);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error creating config directories: " + ex.Message);
            }
        }

        public static Dictionary<string, object> GetDefaultConfig()
        {
            Dictionary<string, object> cfg = new Dictionary<string, object>();
            cfg["default_engine"] = "cloudflare";
            cfg["default_port"] = 3000;
            cfg["last_used_port"] = 3000;
            cfg["last_used_subdomain"] = "";
            cfg["subdomain_mode"] = "fixed";
            cfg["auto_copy_url"] = true;
            cfg["enable_inspector"] = false;
            cfg["dark_mode"] = true;
            cfg["enable_auto_update_check"] = true;
            cfg["update_url"] = "https://www.shareport.in/version.json";
            cfg["saved_profiles"] = new ArrayList();
            cfg["port_subdomain_map"] = new Dictionary<string, object>();
            return cfg;
        }

        public static Dictionary<string, object> LoadConfig()
        {
            try
            {
                if (File.Exists(ConfigFile))
                {
                    string raw = File.ReadAllText(ConfigFile).Trim('\uFEFF', ' ', '\r', '\n');
                    if (!string.IsNullOrEmpty(raw))
                    {
                        var data = Serializer.Deserialize<Dictionary<string, object>>(raw);
                        var def = GetDefaultConfig();
                        foreach (var kv in data)
                        {
                            def[kv.Key] = kv.Value;
                        }
                        return def;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Failed loading config: " + ex.Message);
            }
            return GetDefaultConfig();
        }

        public static bool SaveConfig(Dictionary<string, object> cfg)
        {
            try
            {
                string json = Serializer.Serialize(cfg);
                File.WriteAllText(ConfigFile, json);
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Failed saving config: " + ex.Message);
                return false;
            }
        }

        public static object GetConfigValue(string key)
        {
            var cfg = LoadConfig();
            if (cfg.ContainsKey(key)) return cfg[key];
            return null;
        }

        public static bool SetConfigValue(string key, object val)
        {
            var cfg = LoadConfig();
            cfg[key] = val;
            return SaveConfig(cfg);
        }

        public static ArrayList SaveProfile(Dictionary<string, object> profile)
        {
            var cfg = LoadConfig();
            ArrayList list = null;
            if (cfg.ContainsKey("saved_profiles") && cfg["saved_profiles"] is ArrayList)
            {
                list = (ArrayList)cfg["saved_profiles"];
            }
            else
            {
                list = new ArrayList();
            }

            string pName = profile.ContainsKey("name") ? (profile["name"] != null ? profile["name"].ToString() : "") : "";
            ArrayList newList = new ArrayList();
            foreach (object item in list)
            {
                if (item is Dictionary<string, object>)
                {
                    var d = (Dictionary<string, object>)item;
                    if (d.ContainsKey("name") && d["name"] != null && d["name"].ToString() == pName)
                    {
                        continue;
                    }
                }
                newList.Add(item);
            }
            newList.Add(profile);
            cfg["saved_profiles"] = newList;
            SaveConfig(cfg);
            return newList;
        }

        public static ArrayList DeleteProfile(string name)
        {
            var cfg = LoadConfig();
            ArrayList list = null;
            if (cfg.ContainsKey("saved_profiles") && cfg["saved_profiles"] is ArrayList)
            {
                list = (ArrayList)cfg["saved_profiles"];
            }
            else
            {
                list = new ArrayList();
            }

            ArrayList newList = new ArrayList();
            foreach (object item in list)
            {
                if (item is Dictionary<string, object>)
                {
                    var d = (Dictionary<string, object>)item;
                    if (d.ContainsKey("name") && d["name"] != null && d["name"].ToString() == name)
                    {
                        continue;
                    }
                }
                newList.Add(item);
            }
            cfg["saved_profiles"] = newList;
            SaveConfig(cfg);
            return newList;
        }

        public static object LoadCollections()
        {
            try
            {
                if (File.Exists(CollectionsFile))
                {
                    string raw = File.ReadAllText(CollectionsFile).Trim('\uFEFF', ' ', '\r', '\n');
                    if (!string.IsNullOrEmpty(raw))
                    {
                        var data = Serializer.DeserializeObject(raw);
                        if (data != null) return data;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Failed loading collections: " + ex.Message);
            }

            // Default Starter Collection
            string starterJson = @"[
  {
    ""id"": ""default-starter"",
    ""name"": ""\uD83D\uDE80 Local Server Starter"",
    ""description"": ""Default starter requests for local development and live tunnels"",
    ""variables"": { ""baseUrl"": ""http://localhost:3000"" },
    ""items"": [
      {
        ""id"": ""req-1"",
        ""name"": ""GET Health / Root"",
        ""method"": ""GET"",
        ""url"": ""{{baseUrl}}/"",
        ""headers"": [{ ""key"": ""Accept"", ""value"": ""application/json"", ""enabled"": true }],
        ""params"": [],
        ""bodyType"": ""none"",
        ""bodyContent"": """",
        ""auth"": { ""type"": ""none"" }
      },
      {
        ""id"": ""req-2"",
        ""name"": ""POST Sample JSON"",
        ""method"": ""POST"",
        ""url"": ""{{baseUrl}}/api/test"",
        ""headers"": [{ ""key"": ""Content-Type"", ""value"": ""application/json"", ""enabled"": true }],
        ""params"": [],
        ""bodyType"": ""json"",
        ""bodyContent"": ""{\n  \""message\"": \""Hello from Share Port API Testing\"",\n  \""timestamp\"": 1700000000000\n}"",
        ""auth"": { ""type"": ""none"" }
      }
    ]
  }
]";
            try
            {
                return Serializer.DeserializeObject(starterJson);
            }
            catch
            {
                return new ArrayList();
            }
        }

        public static bool SaveCollections(object data)
        {
            try
            {
                string json = Serializer.Serialize(data);
                File.WriteAllText(CollectionsFile, json);
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Failed saving collections: " + ex.Message);
                return false;
            }
        }

        public static string EnsureSshKey()
        {
            string keyPath = Path.Combine(KeysDir, "id_ed25519");
            if (!File.Exists(keyPath))
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = "ssh-keygen";
                    psi.Arguments = string.Format("-t ed25519 -N \"\" -C \"anonymous@shareport\" -f \"{0}\"", keyPath);
                    psi.CreateNoWindow = true;
                    psi.UseShellExecute = false;
                    var p = Process.Start(psi);
                    if (p != null) p.WaitForExit();
                }
                catch { }
            }
            return keyPath;
        }
    }
}
