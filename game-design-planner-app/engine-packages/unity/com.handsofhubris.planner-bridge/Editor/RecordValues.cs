using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace HoHPlanner.Bridge.Editor
{
    /// <summary>
    /// Writes planner record values (JSON) into the fields of a generated type. A null or empty planner value never
    /// clears a field, so the sprites, prefabs and numbers set by hand in the Inspector survive a reimport.
    /// </summary>
    public static class RecordValues
    {
        /// <summary>Returned by <see cref="Convert"/> when the field should be left as it is.</summary>
        public static readonly object Keep = new object();

        /// <summary>Finds the asset of another record by its key; null when there is none.</summary>
        public delegate UnityEngine.Object RecordResolver(string key, Type type);

        /// <summary>The generated type's planner field → C# field map (its static PlannerFields), or an empty map.</summary>
        public static IReadOnlyDictionary<string, string> FieldMap(Type type)
        {
            var f = type.GetField("PlannerFields", BindingFlags.Public | BindingFlags.Static);
            return f?.GetValue(null) as IReadOnlyDictionary<string, string> ?? new Dictionary<string, string>();
        }

        /// <summary>The planner schema ID of a generated type (its SchemaId constant), or null.</summary>
        public static string SchemaIdOf(Type type)
        {
            var f = type.GetField("SchemaId", BindingFlags.Public | BindingFlags.Static);
            return f != null && f.IsLiteral ? f.GetRawConstantValue() as string : null;
        }

        /// <summary>Sets every field the record names. Returns problems as readable lines (unknown field, value that could not be read).</summary>
        public static List<string> Apply(object target, JObject record, RecordResolver resolve)
        {
            var problems = new List<string>();
            var type = target.GetType();
            var map = FieldMap(type);
            const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
            foreach (var prop in record.Properties())
            {
                var name = map.TryGetValue(prop.Name, out var mapped) ? mapped : prop.Name;
                var field = type.GetField(name, flags);
                if (field == null)
                {
                    if (prop.Name == "plannerId") continue; // optional on hand-written types

                    problems.Add($"{prop.Name}: the type {type.Name} has no field {name}; export the C# again.");
                    continue;
                }
                var value = Convert(prop.Value, field.FieldType, resolve, out var problem);
                if (problem != null) problems.Add($"{prop.Name}: {problem}");
                if (!ReferenceEquals(value, Keep)) field.SetValue(target, value);
            }
            return problems;
        }

        /// <summary>A JSON value as an object of the field's type, or <see cref="Keep"/>.</summary>
        public static object Convert(JToken token, Type type, RecordResolver resolve, out string problem)
        {
            problem = null;
            if (token == null || token.Type == JTokenType.Null || token.Type == JTokenType.Undefined) return Keep;
            try
            {
                if (type == typeof(string)) return token.Type == JTokenType.String ? (string)token : token.ToString();
                if (type == typeof(int)) return token.Value<int>();
                if (type == typeof(long)) return token.Value<long>();
                if (type == typeof(float)) return token.Value<float>();
                if (type == typeof(double)) return token.Value<double>();
                if (type == typeof(bool)) return token.Value<bool>();
                if (type == typeof(Color))
                {
                    if (ColorUtility.TryParseHtmlString((string)token, out var c)) return c;
                    problem = $"“{token}” is not a colour like #aabbcc";
                    return Keep;
                }
                if (type == typeof(Vector2) || type == typeof(Vector3))
                {
                    var n = token is JArray a ? a.Select(x => x.Value<float>()).ToArray() : Array.Empty<float>();
                    var need = type == typeof(Vector2) ? 2 : 3;
                    if (n.Length != need)
                    {
                        problem = $"needs {need} numbers";
                        return Keep;
                    }
                    return need == 2 ? (object)new Vector2(n[0], n[1]) : new Vector3(n[0], n[1], n[2]);
                }
                if (type.IsEnum) return EnumValue((string)token, type, out problem);
                if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(List<>))
                {
                    var element = type.GetGenericArguments()[0];
                    if (!(token is JArray array))
                    {
                        problem = "should be a list";
                        return Keep;
                    }
                    if (array.Count == 0 && typeof(UnityEngine.Object).IsAssignableFrom(element)) return Keep;
                    var list = (IList)Activator.CreateInstance(type);
                    foreach (var item in array)
                    {
                        var v = Convert(item, element, resolve, out var p);
                        if (p != null) problem = p;
                        if (!ReferenceEquals(v, Keep)) list.Add(v);
                    }
                    return list;
                }
                if (typeof(UnityEngine.Object).IsAssignableFrom(type))
                {
                    var text = (string)token;
                    if (string.IsNullOrEmpty(text)) return Keep;
                    if (SchemaIdOf(type) != null)
                    {
                        var target = resolve?.Invoke(text, type);
                        if (target == null) problem = $"no {type.Name} asset for “{text}”";
                        return target != null ? target : Keep;
                    }
                    var asset = AssetDatabase.LoadAssetAtPath(text, type);
                    if (asset == null) problem = $"no {type.Name} at “{text}”; assign it in the Inspector";
                    return asset != null ? asset : Keep;
                }
                if (type == typeof(AnimationCurve)) return Keep;
                return token.ToObject(type);
            }
            catch (Exception e) when (e is FormatException || e is InvalidCastException || e is ArgumentException || e is Newtonsoft.Json.JsonException)
            {
                problem = $"“{token}” cannot be read as {type.Name}";
                return Keep;
            }
        }

        /// <summary>A planner ID (e.g. “common”) as an enum value: through the generated EnumIds table, else by member name.</summary>
        private static object EnumValue(string id, Type type, out string problem)
        {
            problem = null;
            var table = type.Assembly.GetTypes().FirstOrDefault(t => t.Name == "EnumIds" && t.Namespace == type.Namespace)?.GetField(type.Name, BindingFlags.Public | BindingFlags.Static)?.GetValue(null) as IDictionary;
            if (table != null && id != null && table.Contains(id)) return table[id];
            var names = Enum.GetNames(type);
            var match = names.FirstOrDefault(n => string.Equals(n, id?.Replace(" ", "").Replace("_", "").Replace("-", ""), StringComparison.OrdinalIgnoreCase));
            if (match != null) return Enum.Parse(type, match);
            problem = $"“{id}” is not a value of {type.Name}";
            return Keep;
        }
    }
}
