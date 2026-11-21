using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.Localization;
using UnityEngine;
using UnityEngine.Localization;
using UnityEngine.Localization.Pseudo;
using UnityEngine.Localization.Settings;
using UnityEngine.Localization.Tables;

namespace HoHPlanner.Bridge.Editor
{
    public sealed class LocalizationResult
    {
        public int Locales;
        public int Added;
        public int Updated;
        public int Removed;

        public override string ToString() => $"{Added} added, {Updated} updated, {Removed} removed" + (Locales > 0 ? $", {Locales} new locale(s)" : "");
    }

    /// <summary>
    /// Unity Localization from the plan: Localization/strings.csv (key, then one column per language) becomes the string
    /// table collection “Planner”, one table per language. The collection belongs to the planner: keys the plan no longer
    /// has are removed from it. Its assets live in &lt;root&gt;/LocalizationTables (not in Localization/, which the export
    /// replaces). Compiled only when the Localization package is installed; runs after every record import.
    /// </summary>
    [InitializeOnLoad]
    public static class PlannerLocalization
    {
        public const string CollectionName = "Planner";
        public const string TablesFolder = "LocalizationTables";

        static PlannerLocalization()
        {
            PlannerImporter.AfterRecords += (root, manifest, result) =>
            {
                if (!File.Exists($"{root}/Localization/strings.csv")) return;
                Debug.Log($"[Planner bridge] Localization: {Apply(root)}.");
            };
        }

        public static LocalizationResult Apply(string root, string collectionName = CollectionName)
        {
            var result = new LocalizationResult();
            var csv = $"{root}/Localization/strings.csv";
            if (!File.Exists(csv)) return result;
            var rows = ParseCsv(File.ReadAllText(csv));
            if (rows.Count < 1 || rows[0].Count < 2 || rows[0][0] != "key") throw new PlannerImportException("Localization/strings.csv does not start with “key,<language>…”.");
            var codes = rows[0].Skip(1).Select(c => c.Trim()).ToList();
            var folder = $"{root}/{TablesFolder}";
            Directory.CreateDirectory(folder);

            if (LocalizationEditorSettings.ActiveLocalizationSettings == null)
            {
                var settings = ScriptableObject.CreateInstance<LocalizationSettings>();
                AssetDatabase.CreateAsset(settings, $"{folder}/LocalizationSettings.asset");
                LocalizationEditorSettings.ActiveLocalizationSettings = settings;
            }
            var locales = new List<Locale>();
            foreach (var code in codes)
            {
                var locale = LocalizationEditorSettings.GetLocale(new LocaleIdentifier(code));
                if (locale == null)
                {
                    locale = Locale.CreateLocale(new LocaleIdentifier(code));
                    AssetDatabase.CreateAsset(locale, $"{folder}/Locale_{code}.asset");
                    LocalizationEditorSettings.AddLocale(locale);
                    result.Locales++;
                }
                locales.Add(locale);
            }

            if (EnsurePseudoLocale(folder)) result.Locales++;
            var collection = LocalizationEditorSettings.GetStringTableCollection(collectionName) ?? LocalizationEditorSettings.CreateStringTableCollection(collectionName, folder, locales);
            var keys = new HashSet<string>();
            for (var c = 0; c < codes.Count; c++)
            {
                var table = collection.GetTable(locales[c].Identifier) as StringTable ?? collection.AddNewTable(locales[c].Identifier) as StringTable;
                foreach (var row in rows.Skip(1))
                {
                    if (row.Count == 0 || string.IsNullOrEmpty(row[0])) continue;
                    var key = row[0];
                    var text = c + 1 < row.Count ? row[c + 1] : "";
                    keys.Add(key);
                    var entry = table.GetEntry(key);
                    if (entry == null)
                    {
                        table.AddEntry(key, text);
                        if (c == 0) result.Added++;
                    }
                    else if (entry.Value != text)
                    {
                        entry.Value = text;
                        if (c == 0) result.Updated++;
                    }
                }
                EditorUtility.SetDirty(table);
            }
            foreach (var stale in collection.SharedData.Entries.Select(e => e.Key).Where(k => !keys.Contains(k)).ToList())
            {
                collection.SharedData.RemoveKey(stale);
                result.Removed++;
            }
            EditorUtility.SetDirty(collection.SharedData);
            EditorUtility.SetDirty(collection);
            AssetDatabase.SaveAssets();
            return result;
        }

        /// <summary>
        /// A pseudo-locale for the planner's texts, made once when the project has none: accented, about a third longer
        /// and in brackets, so cut-off text and text that bypasses the tables show before any translation. Pick it in the
        /// Game view's locale menu. Returns whether it was made.
        /// </summary>
        public static bool EnsurePseudoLocale(string folder)
        {
            // GetLocales() does not list pseudo-locales, so the assets themselves are looked for.
            if (AssetDatabase.FindAssets("t:PseudoLocale").Length > 0) return false;
            var pseudo = PseudoLocale.CreatePseudoLocale();
            pseudo.name = "Pseudo-Locale";
            pseudo.Methods.Clear();
            pseudo.Methods.Add(new PreserveTags());
            pseudo.Methods.Add(new Expander());
            pseudo.Methods.Add(new Accenter());
            pseudo.Methods.Add(new Encapsulator());
            AssetDatabase.CreateAsset(pseudo, $"{folder}/Pseudo-Locale.asset");
            LocalizationEditorSettings.AddLocale(pseudo);
            return true;
        }

        /// <summary>RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks.</summary>
        public static List<List<string>> ParseCsv(string text)
        {
            var rows = new List<List<string>>();
            var row = new List<string>();
            var cell = new StringBuilder();
            var quoted = false;
            for (var i = 0; i < text.Length; i++)
            {
                var ch = text[i];
                if (quoted)
                {
                    if (ch == '"' && i + 1 < text.Length && text[i + 1] == '"')
                    {
                        cell.Append('"');
                        i++;
                    }
                    else if (ch == '"') quoted = false;
                    else cell.Append(ch);
                }
                else if (ch == '"') quoted = true;
                else if (ch == ',')
                {
                    row.Add(cell.ToString());
                    cell.Clear();
                }
                else if (ch == '\n' || ch == '\r')
                {
                    if (ch == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
                    row.Add(cell.ToString());
                    cell.Clear();
                    rows.Add(row);
                    row = new List<string>();
                }
                else cell.Append(ch);
            }
            if (cell.Length > 0 || row.Count > 0)
            {
                row.Add(cell.ToString());
                rows.Add(row);
            }
            return rows;
        }
    }
}
