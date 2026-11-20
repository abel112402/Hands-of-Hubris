using System.Collections.Generic;
using UnityEngine;

namespace HoHPlanner.Bridge.Tests
{
    public enum TestRarity
    {
        Common,
        Rare,
    }

    /// <summary>Stand-in for the planner's IDs table of the test enum (generated code has one per enum).</summary>
    public static class EnumIds
    {
        public static readonly IReadOnlyDictionary<string, TestRarity> TestRarity = new Dictionary<string, TestRarity> { ["common"] = Tests.TestRarity.Common, ["rare"] = Tests.TestRarity.Rare };
    }

    /// <summary>Shaped like a generated Definition (SchemaId, PlannerFields, id, plannerId), for the import tests.</summary>
    public class TestItemDefinition : ScriptableObject
    {
        public const string SchemaId = "test-item";
        public const int SchemaVersion = 1;
        public static readonly IReadOnlyDictionary<string, string> PlannerFields = new Dictionary<string, string>
        {
            ["name"] = "displayName", ["icon"] = "icon", ["value"] = "value", ["rarity"] = "rarity", ["tint"] = "tint", ["size"] = "size", ["parts"] = "parts", ["tags"] = "tags",
        };

        public string id;
        public string plannerId;
        public string displayName;
        public Sprite icon;
        public int value;
        public TestRarity rarity;
        public Color tint;
        public Vector2 size;
        public List<TestItemDefinition> parts;
        public List<string> tags;
    }
}
