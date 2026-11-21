using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>
    /// Live link between the planner (running locally) and this editor. Off by default; when on, it listens on
    /// 127.0.0.1 only and every request needs this session's token. The planner can:
    ///   GET  /status            – who is here: project, Play mode, how many records;
    ///   POST /ping   {plannerId}  – select and highlight the record's asset;
    ///   POST /values {records:[{plannerId, values}]} – in Play mode only: put the planner's current values into the
    ///                             record assets the running game uses. When Play mode ends they are restored, so the
    ///                             plan stays the source of truth (export and import to keep a change).
    /// </summary>
    [InitializeOnLoad]
    public static class PlannerLiveLink
    {
        public const int DefaultPort = 51701;
        private const int MaxBody = 4 * 1024 * 1024;
        private const string TokenKey = "HoHPlanner.LiveLinkToken";

        private static HttpListener listener;
        private static Thread thread;
        private static readonly ConcurrentQueue<Pending> Queue = new ConcurrentQueue<Pending>();
        /// <summary>Asset → its state before the first push in this Play session.</summary>
        private static readonly Dictionary<UnityEngine.Object, string> Originals = new Dictionary<UnityEngine.Object, string>();

        private sealed class Pending
        {
            public string Method;
            public string Path;
            public string Body;
            public int Status = 500;
            public JObject Reply;
            public readonly ManualResetEventSlim Done = new ManualResetEventSlim(false);
        }

        /// <summary>The token the planner must send (X-HoH-Token). New for every editor session.</summary>
        public static string Token
        {
            get
            {
                var t = SessionState.GetString(TokenKey, "");
                if (t.Length == 0)
                {
                    var bytes = new byte[18];
                    using (var rng = System.Security.Cryptography.RandomNumberGenerator.Create()) rng.GetBytes(bytes);
                    t = Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_');
                    SessionState.SetString(TokenKey, t);
                }
                return t;
            }
        }

        public static bool Running => listener != null && listener.IsListening;

        // Read on the main thread when the link starts: Unity's API (SessionState, settings) is main-thread only, and the
        // listener thread checks every request against these.
        private static volatile string activeToken = "";
        private static volatile string activePlannerUrl = "";
        public static int Port { get; private set; }

        static PlannerLiveLink()
        {
            EditorApplication.update += Drain;
            AssemblyReloadEvents.beforeAssemblyReload += Stop;
            EditorApplication.quitting += Stop;
            EditorApplication.playModeStateChanged += s =>
            {
                if (s == PlayModeStateChange.ExitingPlayMode) RestoreOriginals();
            };
            if (PlannerBridgeSettings.instance.liveLink) EditorApplication.delayCall += () => Start(PlannerBridgeSettings.instance.liveLinkPort);
        }

        public static void Start(int port)
        {
            Stop();
            Port = port <= 0 ? DefaultPort : port;
            activeToken = Token;
            activePlannerUrl = PlannerBridgeSettings.instance.plannerUrl ?? "";
            listener = new HttpListener();
            listener.Prefixes.Add($"http://127.0.0.1:{Port}/");
            listener.Prefixes.Add($"http://localhost:{Port}/");
            try
            {
                listener.Start();
            }
            catch (Exception e) when (e is HttpListenerException || e is System.Net.Sockets.SocketException)
            {
                listener = null;
                Debug.LogWarning($"[Planner bridge] Live link could not listen on port {Port}: {e.Message}");
                return;
            }
            thread = new Thread(Serve) { IsBackground = true, Name = "Planner live link" };
            thread.Start(listener);
            Debug.Log($"[Planner bridge] Live link on http://127.0.0.1:{Port} (token in Window ▸ Game Design Planner).");
        }

        public static void Stop()
        {
            var l = listener;
            listener = null;
            try
            {
                l?.Stop();
                l?.Close();
            }
            catch (ObjectDisposedException)
            {
            }
        }

        private static void Serve(object state)
        {
            var l = (HttpListener)state;
            while (l.IsListening)
            {
                HttpListenerContext ctx;
                try
                {
                    ctx = l.GetContext();
                }
                catch (Exception)
                {
                    return; // stopped
                }
                try
                {
                    Handle(ctx);
                }
                catch (Exception e)
                {
                    try
                    {
                        Write(ctx, 500, new JObject { ["error"] = e.Message });
                    }
                    catch (Exception)
                    {
                    }
                }
            }
        }

        /// <summary>Origins that may call the live link: localhost pages and the configured planner address.</summary>
        public static bool AllowedOrigin(string origin, string plannerUrl)
        {
            if (string.IsNullOrEmpty(origin)) return true; // not a browser (curl, tests)
            if (!Uri.TryCreate(origin, UriKind.Absolute, out var o) || (o.Scheme != "http" && o.Scheme != "https")) return false;
            if (o.Host == "localhost" || o.Host == "127.0.0.1" || o.Host == "[::1]") return true;
            return Uri.TryCreate(plannerUrl ?? "", UriKind.Absolute, out var p) && p.Scheme == o.Scheme && p.Host == o.Host && p.Port == o.Port;
        }

        private static void Handle(HttpListenerContext ctx)
        {
            var req = ctx.Request;
            var origin = req.Headers["Origin"];
            if (!AllowedOrigin(origin, activePlannerUrl))
            {
                Write(ctx, 403, new JObject { ["error"] = "Origin not allowed." });
                return;
            }
            if (!string.IsNullOrEmpty(origin))
            {
                ctx.Response.Headers["Access-Control-Allow-Origin"] = origin;
                ctx.Response.Headers["Vary"] = "Origin";
                ctx.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-HoH-Token";
                ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
                ctx.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
            }
            if (req.HttpMethod == "OPTIONS")
            {
                ctx.Response.StatusCode = 204;
                ctx.Response.Close();
                return;
            }
            if (activeToken.Length == 0 || req.Headers["X-HoH-Token"] != activeToken)
            {
                Write(ctx, 401, new JObject { ["error"] = "Wrong or missing token. Copy it from Window ▸ Game Design Planner." });
                return;
            }
            if (req.ContentLength64 > MaxBody)
            {
                Write(ctx, 413, new JObject { ["error"] = "Request too large." });
                return;
            }
            string body;
            using (var r = new StreamReader(req.InputStream, Encoding.UTF8)) body = r.ReadToEnd();
            var p = new Pending { Method = req.HttpMethod, Path = req.Url.AbsolutePath, Body = body };
            Queue.Enqueue(p);
            // The editor API is main-thread only: Drain answers on the next editor update.
            if (!p.Done.Wait(TimeSpan.FromSeconds(10)))
            {
                Write(ctx, 503, new JObject { ["error"] = "The editor is busy (compiling or importing); try again." });
                return;
            }
            Write(ctx, p.Status, p.Reply);
        }

        private static void Write(HttpListenerContext ctx, int status, JObject json)
        {
            var bytes = Encoding.UTF8.GetBytes((json ?? new JObject()).ToString(Formatting.None));
            ctx.Response.StatusCode = status;
            ctx.Response.ContentType = "application/json; charset=utf-8";
            ctx.Response.ContentLength64 = bytes.Length;
            ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
            ctx.Response.Close();
        }

        private static void Drain()
        {
            while (Queue.TryDequeue(out var p))
            {
                try
                {
                    (p.Status, p.Reply) = Answer(p.Method, p.Path, p.Body);
                }
                catch (Exception e)
                {
                    (p.Status, p.Reply) = (500, new JObject { ["error"] = e.Message });
                }
                p.Done.Set();
            }
        }

        /// <summary>The request handling itself, on the main thread. Public for tests.</summary>
        public static (int status, JObject reply) Answer(string method, string path, string body)
        {
            var root = PlannerBridgeSettings.instance.Root;
            var index = AssetDatabase.LoadAssetAtPath<PlannerIndex>($"{root}/{PlannerImporter.IndexFile}");
            JObject json = null;
            if (method == "POST")
            {
                try
                {
                    json = JObject.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
                }
                catch (JsonException e)
                {
                    return (400, new JObject { ["error"] = $"Not valid JSON: {e.Message}" });
                }
            }
            switch ($"{method} {path}")
            {
                case "GET /status":
                    var manifest = File.Exists($"{root}/hoh-engine.json") ? PlannerManifest.Parse(File.ReadAllText($"{root}/hoh-engine.json")) : null;
                    return (200, new JObject
                    {
                        ["engine"] = "unity",
                        ["engineVersion"] = Application.unityVersion,
                        ["project"] = manifest?.ProjectName ?? "",
                        ["playing"] = EditorApplication.isPlaying,
                        ["records"] = index != null ? index.Entries.Count(e => e != null && !e.deprecated && e.asset != null) : 0,
                    });
                case "POST /ping":
                {
                    var entry = index?.FindByPlannerId((string)json["plannerId"]);
                    if (entry?.asset == null) return (404, new JObject { ["error"] = "This record has no asset in the project yet." });
                    Selection.activeObject = entry.asset;
                    EditorGUIUtility.PingObject(entry.asset);
                    return (200, new JObject { ["ok"] = true, ["key"] = entry.key, ["assetPath"] = AssetDatabase.GetAssetPath(entry.asset) });
                }
                case "POST /values":
                {
                    if (!EditorApplication.isPlaying) return (409, new JObject { ["error"] = "Start Play mode first: values go into the running game and are restored when it stops." });
                    var applied = 0;
                    var problems = new JArray();
                    UnityEngine.Object Resolve(string k, Type t)
                    {
                        var a = index?.FindByKey(k)?.asset;
                        return a != null && t.IsInstanceOfType(a) ? a : null;
                    }
                    foreach (var rec in json["records"] as JArray ?? new JArray())
                    {
                        var entry = index?.FindByPlannerId((string)rec["plannerId"]);
                        if (entry?.asset == null || !(rec["values"] is JObject values)) continue;
                        if (!Originals.ContainsKey(entry.asset)) Originals[entry.asset] = EditorJsonUtility.ToJson(entry.asset);
                        foreach (var pr in RecordValues.Apply(entry.asset, values, Resolve)) problems.Add($"{entry.key}.{pr}");
                        applied++;
                    }
                    return (200, new JObject { ["applied"] = applied, ["problems"] = problems });
                }
                default:
                    return (404, new JObject { ["error"] = $"No {method} {path}." });
            }
        }

        /// <summary>Puts every asset changed by /values back as it was before Play mode.</summary>
        public static int RestoreOriginals()
        {
            var n = 0;
            foreach (var kv in Originals)
            {
                if (kv.Key == null) continue;
                EditorJsonUtility.FromJsonOverwrite(kv.Value, kv.Key);
                n++;
            }
            Originals.Clear();
            if (n > 0) Debug.Log($"[Planner bridge] Live link: {n} record asset(s) restored after Play mode.");
            return n;
        }
    }
}
