using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// The crafting panel (IMGUI, no UI asset needed): opened and closed with the planned crafting control; lists each
    /// recipe with its inputs (have / need) and a Craft button, or why it cannot be crafted now.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Crafting Panel")]
    public sealed class PlannerCraftingPanel : MonoBehaviour
    {
        public PlannerCrafting Crafting;
        [Tooltip("The player (its IPlannerMenuSource opens the panel).")]
        public Transform Player;
        [Tooltip("The planned crafting key, as shown (e.g. C).")]
        public string KeyLabel = "";

        public bool IsOpen { get; private set; }
        IPlannerMenuSource source;

        public void Toggle() => IsOpen = !IsOpen;

        void Update()
        {
            if (source == null && Player != null) source = Player.GetComponent<IPlannerMenuSource>();
            if (source != null && source.CraftingPressed) Toggle();
        }

        /// <summary>One line per recipe, as the panel shows it.</summary>
        public IReadOnlyList<string> Lines => Crafting == null ? Array.Empty<string>() : Crafting.Recipes.Select(Line).ToList();

        string Line(PlannerRecipe r)
        {
            var inv = Crafting.Inventory;
            var name = inv.Def(r.Output.ItemId)?.Name ?? r.Output.ItemId;
            var inputs = string.Join(", ", r.Inputs.Select(a => $"{inv.Def(a.ItemId)?.Name ?? a.ItemId} {inv.CountOf(a.ItemId)}/{a.Count}"));
            var ok = Crafting.CanCraft(r.RecipeId, out var reason);
            return $"{r.Name}: {(r.Output.Count > 1 ? $"{r.Output.Count} × " : "")}{name} ← {inputs}{(ok ? "" : $" — {reason}")}";
        }

        void OnGUI()
        {
            if (!IsOpen || Crafting == null) return;
            GUILayout.BeginArea(new Rect(20f, 80f, Mathf.Min(560f, Screen.width - 40f), Screen.height - 160f), "Crafting" + (string.IsNullOrEmpty(KeyLabel) ? "" : $" [{KeyLabel}]"), GUI.skin.window);
            foreach (var r in Crafting.Recipes)
            {
                GUILayout.BeginHorizontal();
                GUILayout.Label(Line(r));
                GUI.enabled = Crafting.CanCraft(r.RecipeId, out _);
                if (GUILayout.Button("Craft", GUILayout.Width(80f))) Crafting.TryCraft(r.RecipeId);
                GUI.enabled = true;
                GUILayout.EndHorizontal();
            }
            GUILayout.EndArea();
        }
    }
}
