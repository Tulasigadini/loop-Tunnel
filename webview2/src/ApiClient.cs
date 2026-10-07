using System;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Text;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Web;

namespace SharePort.WebView2App
{
    public static class ApiClient
    {
        static ApiClient()
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls;
            ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };
            ServicePointManager.DefaultConnectionLimit = 100;
        }

        public static Dictionary<string, object> ExecuteRequest(Dictionary<string, object> reqConfig)
        {
            Stopwatch sw = Stopwatch.StartNew();

            string method = reqConfig.ContainsKey("method") && reqConfig["method"] != null ? reqConfig["method"].ToString().ToUpper() : "GET";
            string rawUrl = reqConfig.ContainsKey("url") && reqConfig["url"] != null ? reqConfig["url"].ToString().Trim('"', '\'', ' ', '<', '>') : "";
            string baseUrl = reqConfig.ContainsKey("baseUrl") && reqConfig["baseUrl"] != null ? reqConfig["baseUrl"].ToString().TrimEnd('/') : "http://localhost:3000";
            int timeout = reqConfig.ContainsKey("timeout") && reqConfig["timeout"] != null ? Convert.ToInt32(reqConfig["timeout"]) : 30000;

            try
            {
                // URL Normalization
                if (!baseUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && !baseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    bool isLocal = baseUrl.IndexOf("localhost", StringComparison.OrdinalIgnoreCase) >= 0 || baseUrl.IndexOf("127.0.0.1") >= 0;
                    baseUrl = (isLocal ? "http://" : "https://") + baseUrl;
                }

                string targetUrl = rawUrl;
                if (targetUrl.Contains("{{baseUrl}}"))
                {
                    targetUrl = targetUrl.Replace("{{baseUrl}}", baseUrl);
                }
                else if (targetUrl.StartsWith("/"))
                {
                    targetUrl = baseUrl + targetUrl;
                }
                else if (!targetUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && !targetUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    if (targetUrl.Length > 0)
                    {
                        if (targetUrl.Contains(".") && !targetUrl.StartsWith("./"))
                        {
                            bool isLocal = targetUrl.IndexOf("localhost", StringComparison.OrdinalIgnoreCase) >= 0 || targetUrl.IndexOf("127.0.0.1") >= 0;
                            targetUrl = (isLocal ? "http://" : "https://") + targetUrl;
                        }
                        else
                        {
                            targetUrl = baseUrl + "/" + targetUrl;
                        }
                    }
                    else
                    {
                        targetUrl = baseUrl;
                    }
                }

                Uri uri = new Uri(targetUrl);
                string queryString = uri.Query;

                // Append query params
                if (reqConfig.ContainsKey("params") && reqConfig["params"] is ArrayList)
                {
                    ArrayList pList = (ArrayList)reqConfig["params"];
                    var nameValues = HttpUtility.ParseQueryString(queryString);
                    foreach (object item in pList)
                    {
                        if (item is Dictionary<string, object>)
                        {
                            var p = (Dictionary<string, object>)item;
                            bool enabled = !p.ContainsKey("enabled") || Convert.ToBoolean(p["enabled"]);
                            string key = p.ContainsKey("key") && p["key"] != null ? p["key"].ToString().Trim() : "";
                            string val = p.ContainsKey("value") && p["value"] != null ? p["value"].ToString() : "";
                            if (enabled && !string.IsNullOrEmpty(key))
                            {
                                nameValues.Add(key, val);
                            }
                        }
                    }
                    var uriBuilder = new UriBuilder(uri);
                    uriBuilder.Query = nameValues.ToString();
                    uri = uriBuilder.Uri;
                }

                // Auth
                Dictionary<string, string> customHeaders = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                if (reqConfig.ContainsKey("auth") && reqConfig["auth"] is Dictionary<string, object>)
                {
                    var auth = (Dictionary<string, object>)reqConfig["auth"];
                    string aType = auth.ContainsKey("type") && auth["type"] != null ? auth["type"].ToString().ToLower() : "";
                    if ((aType == "bearer" || aType == "bearer token") && auth.ContainsKey("token"))
                    {
                        string prefix = auth.ContainsKey("prefix") && auth["prefix"] != null ? auth["prefix"].ToString() : "Bearer";
                        customHeaders["Authorization"] = prefix + " " + auth["token"];
                    }
                    else if (aType == "basic" || aType == "basic auth")
                    {
                        string u = auth.ContainsKey("username") && auth["username"] != null ? auth["username"].ToString() : "";
                        string p = auth.ContainsKey("password") && auth["password"] != null ? auth["password"].ToString() : "";
                        string basicStr = Convert.ToBase64String(Encoding.UTF8.GetBytes(u + ":" + p));
                        customHeaders["Authorization"] = "Basic " + basicStr;
                    }
                    else if ((aType == "apikey" || aType == "api key") && auth.ContainsKey("key") && auth.ContainsKey("value"))
                    {
                        string k = auth["key"].ToString();
                        string v = auth["value"].ToString();
                        string addTo = auth.ContainsKey("addTo") && auth["addTo"] != null ? auth["addTo"].ToString() : "header";
                        if (addTo == "query")
                        {
                            var uriBuilder = new UriBuilder(uri);
                            var q = HttpUtility.ParseQueryString(uriBuilder.Query);
                            q[k] = v;
                            uriBuilder.Query = q.ToString();
                            uri = uriBuilder.Uri;
                        }
                        else
                        {
                            customHeaders[k] = v;
                        }
                    }
                }

                // Headers
                if (reqConfig.ContainsKey("headers") && reqConfig["headers"] is ArrayList)
                {
                    ArrayList hList = (ArrayList)reqConfig["headers"];
                    foreach (object item in hList)
                    {
                        if (item is Dictionary<string, object>)
                        {
                            var h = (Dictionary<string, object>)item;
                            bool enabled = !h.ContainsKey("enabled") || Convert.ToBoolean(h["enabled"]);
                            string key = h.ContainsKey("key") && h["key"] != null ? h["key"].ToString().Trim() : "";
                            string val = h.ContainsKey("value") && h["value"] != null ? h["value"].ToString() : "";
                            if (enabled && !string.IsNullOrEmpty(key))
                            {
                                customHeaders[key] = val;
                            }
                        }
                    }
                }

                // Default Headers
                if (!customHeaders.ContainsKey("User-Agent"))
                {
                    customHeaders["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SharePort-ApiTester/2.0";
                }
                if (!customHeaders.ContainsKey("Accept"))
                {
                    customHeaders["Accept"] = "application/json, text/plain, */*";
                }
                if (!customHeaders.ContainsKey("Accept-Encoding"))
                {
                    customHeaders["Accept-Encoding"] = "gzip, deflate";
                }

                // Prepare Request Body
                byte[] bodyBytes = null;
                string contentType = customHeaders.ContainsKey("Content-Type") ? customHeaders["Content-Type"] : null;
                string bodyType = reqConfig.ContainsKey("bodyType") && reqConfig["bodyType"] != null ? reqConfig["bodyType"].ToString() : "none";
                string bodyContent = reqConfig.ContainsKey("bodyContent") && reqConfig["bodyContent"] != null ? reqConfig["bodyContent"].ToString() : "";

                if (method != "GET" && method != "HEAD")
                {
                    if (bodyType == "json" || bodyType == "raw")
                    {
                        if (string.IsNullOrEmpty(contentType))
                        {
                            string rawFmt = reqConfig.ContainsKey("rawFormat") && reqConfig["rawFormat"] != null ? reqConfig["rawFormat"].ToString().ToUpper() : "JSON";
                            if (rawFmt == "JSON") contentType = "application/json";
                            else if (rawFmt == "XML") contentType = "application/xml";
                            else if (rawFmt == "HTML") contentType = "text/html";
                            else contentType = "text/plain";
                        }
                        bodyBytes = Encoding.UTF8.GetBytes(bodyContent);
                    }
                    else if (bodyType == "x-www-form-urlencoded")
                    {
                        if (string.IsNullOrEmpty(contentType)) contentType = "application/x-www-form-urlencoded";
                        var search = new StringBuilder();
                        if (reqConfig.ContainsKey("urlencodedFields") && reqConfig["urlencodedFields"] is ArrayList)
                        {
                            ArrayList fields = (ArrayList)reqConfig["urlencodedFields"];
                            foreach (object item in fields)
                            {
                                if (item is Dictionary<string, object>)
                                {
                                    var f = (Dictionary<string, object>)item;
                                    bool enabled = !f.ContainsKey("enabled") || Convert.ToBoolean(f["enabled"]);
                                    string k = f.ContainsKey("key") && f["key"] != null ? f["key"].ToString() : "";
                                    string v = f.ContainsKey("value") && f["value"] != null ? f["value"].ToString() : "";
                                    if (enabled && !string.IsNullOrEmpty(k))
                                    {
                                        if (search.Length > 0) search.Append("&");
                                        search.Append(Uri.EscapeDataString(k)).Append("=").Append(Uri.EscapeDataString(v));
                                    }
                                }
                            }
                        }
                        bodyBytes = Encoding.UTF8.GetBytes(search.ToString());
                    }
                    else if (bodyType == "GraphQL")
                    {
                        if (string.IsNullOrEmpty(contentType)) contentType = "application/json";
                        string gqlQuery = reqConfig.ContainsKey("graphqlQuery") && reqConfig["graphqlQuery"] != null ? reqConfig["graphqlQuery"].ToString() : bodyContent;
                        var s = new System.Web.Script.Serialization.JavaScriptSerializer();
                        var gqlObj = new Dictionary<string, object>();
                        gqlObj["query"] = gqlQuery;
                        gqlObj["variables"] = new Dictionary<string, object>();
                        bodyBytes = Encoding.UTF8.GetBytes(s.Serialize(gqlObj));
                    }
                }

                // Execute WebRequest
                var result = ExecuteSingleRequest(uri, method, customHeaders, contentType, bodyBytes, timeout, sw);

                // Auto retry on 403 / 406 with Chrome browser headers
                int statusCode = Convert.ToInt32(result["status"]);
                if (statusCode == 403 || statusCode == 406)
                {
                    customHeaders["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
                    customHeaders["Sec-Ch-Ua"] = "\"Chromium\";v=\"124\", \"Google Chrome\";v=\"124\"";
                    customHeaders["Sec-Ch-Ua-Mobile"] = "?0";
                    customHeaders["Sec-Ch-Ua-Platform"] = "\"Windows\"";
                    customHeaders["Sec-Fetch-Dest"] = "empty";
                    customHeaders["Sec-Fetch-Mode"] = "cors";
                    customHeaders["Sec-Fetch-Site"] = "same-origin";
                    customHeaders["Accept-Language"] = "en-US,en;q=0.9";
                    var retryRes = ExecuteSingleRequest(uri, method, customHeaders, contentType, bodyBytes, timeout, sw);
                    int retryStatus = Convert.ToInt32(retryRes["status"]);
                    if (retryStatus >= 200 && retryStatus < 400)
                    {
                        result = retryRes;
                    }
                }

                return result;
            }
            catch (Exception ex)
            {
                Dictionary<string, object> errRes = new Dictionary<string, object>();
                errRes["success"] = false;
                errRes["status"] = 0;
                errRes["statusText"] = "Execution Error";
                errRes["error"] = ex.Message;
                errRes["timeMs"] = sw.ElapsedMilliseconds;
                errRes["headers"] = new Dictionary<string, string>();
                errRes["cookies"] = new ArrayList();
                errRes["body"] = "";
                errRes["sizeBytes"] = 0;
                return errRes;
            }
        }

        private static Dictionary<string, object> ExecuteSingleRequest(Uri uri, string method, Dictionary<string, string> headers, string contentType, byte[] bodyBytes, int timeout, Stopwatch sw)
        {
            Dictionary<string, object> res = new Dictionary<string, object>();
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(uri);
            req.Method = method;
            req.Timeout = timeout;
            req.ReadWriteTimeout = timeout;
            req.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;
            req.KeepAlive = true;
            req.AllowAutoRedirect = true;

            foreach (var kv in headers)
            {
                if (kv.Key.Equals("User-Agent", StringComparison.OrdinalIgnoreCase)) req.UserAgent = kv.Value;
                else if (kv.Key.Equals("Accept", StringComparison.OrdinalIgnoreCase)) req.Accept = kv.Value;
                else if (kv.Key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase)) { } // set later
                else if (kv.Key.Equals("Content-Length", StringComparison.OrdinalIgnoreCase)) { }
                else if (kv.Key.Equals("Host", StringComparison.OrdinalIgnoreCase)) req.Host = kv.Value;
                else if (kv.Key.Equals("Referer", StringComparison.OrdinalIgnoreCase)) req.Referer = kv.Value;
                else
                {
                    try { req.Headers[kv.Key] = kv.Value; } catch { }
                }
            }

            if (!string.IsNullOrEmpty(contentType))
            {
                req.ContentType = contentType;
            }

            if (bodyBytes != null && bodyBytes.Length > 0 && method != "GET" && method != "HEAD")
            {
                req.ContentLength = bodyBytes.Length;
                using (Stream stream = req.GetRequestStream())
                {
                    stream.Write(bodyBytes, 0, bodyBytes.Length);
                }
            }

            HttpWebResponse webRes = null;
            try
            {
                webRes = (HttpWebResponse)req.GetResponse();
            }
            catch (WebException wex)
            {
                if (wex.Response is HttpWebResponse)
                {
                    webRes = (HttpWebResponse)wex.Response;
                }
                else
                {
                    res["success"] = false;
                    res["status"] = 0;
                    res["statusText"] = "Network Error";
                    res["error"] = wex.Message;
                    res["timeMs"] = sw.ElapsedMilliseconds;
                    res["headers"] = new Dictionary<string, string>();
                    res["cookies"] = new ArrayList();
                    res["body"] = "";
                    res["sizeBytes"] = 0;
                    return res;
                }
            }

            Dictionary<string, string> resHeaders = new Dictionary<string, string>();
            ArrayList cookiesList = new ArrayList();

            if (webRes != null)
            {
                for (int i = 0; i < webRes.Headers.Count; i++)
                {
                    string hKey = webRes.Headers.GetKey(i);
                    string hVal = webRes.Headers.Get(i);
                    resHeaders[hKey] = hVal;

                    if (hKey.Equals("Set-Cookie", StringComparison.OrdinalIgnoreCase))
                    {
                        var cDict = new Dictionary<string, object>();
                        cDict["raw"] = hVal;
                        int eq = hVal.IndexOf('=');
                        int semi = hVal.IndexOf(';');
                        if (eq > 0)
                        {
                            cDict["name"] = hVal.Substring(0, eq).Trim();
                            cDict["value"] = semi > eq ? hVal.Substring(eq + 1, semi - eq - 1).Trim() : hVal.Substring(eq + 1).Trim();
                        }
                        cookiesList.Add(cDict);
                    }
                }

                string resBody = "";
                using (Stream rStream = webRes.GetResponseStream())
                {
                    if (rStream != null)
                    {
                        using (MemoryStream ms = new MemoryStream())
                        {
                            rStream.CopyTo(ms);
                            byte[] resBytes = ms.ToArray();
                            res["sizeBytes"] = resBytes.Length;
                            resBody = Encoding.UTF8.GetString(resBytes);
                        }
                    }
                }

                res["success"] = true;
                res["status"] = (int)webRes.StatusCode;
                res["statusText"] = webRes.StatusDescription;
                res["headers"] = resHeaders;
                res["cookies"] = cookiesList;
                res["body"] = resBody;
                res["timeMs"] = sw.ElapsedMilliseconds;
                webRes.Close();
            }

            return res;
        }
    }
}
