using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// Binds the plan's HUD (the generated UXML of UI / UX › Screens) to the running inventory: the element named
    /// <c>bind-inventory</c> (a Grid bound to the inventory) gets one cell per slot with the item's name and count, and
    /// every <c>bind-item-&lt;item ID&gt;</c> (a Counter bound to an item) shows how many the player has. It updates on every
    /// inventory change. With <see cref="Quests"/>, <c>bind-quest</c> (a Quest tracker for the active quest) and
    /// <c>bind-quest-&lt;quest ID&gt;</c> show the quest's name and goal progress, or that it is done. Other bound elements
    /// are left to their modules.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner HUD Binding")]
    public sealed class PlannerHudBinding : MonoBehaviour
    {
        public const string InventoryElement = "bind-inventory";
        public const string ItemPrefix = "bind-item-";
        public const string SlotClass = "planner-slot";
        public const string CountClass = "planner-count";
        public const string QuestElement = "bind-quest";
        public const string QuestClass = "planner-quest";

        public UIDocument Document;
        public PlannerInventory Inventory;
        public PlannerQuests Quests;
        [Tooltip("The player's health, for the stat bar bound to the Health survival stat (bind-survivalStat-health).")]
        public PlannerHealth PlayerHealth;
        public const string HealthElement = "bind-survivalStat-health";

        void OnEnable()
        {
            if (Inventory != null) Inventory.Changed += Refresh;
            if (Quests != null) Quests.Changed += Refresh;
            if (PlayerHealth != null) PlayerHealth.Changed += OnHealth;
            Refresh();
        }

        void OnDisable()
        {
            if (Inventory != null) Inventory.Changed -= Refresh;
            if (Quests != null) Quests.Changed -= Refresh;
            if (PlayerHealth != null) PlayerHealth.Changed -= OnHealth;
        }

        void OnHealth(PlannerHealth h) => Refresh();

        void Start() => Refresh();

        string NameOf(string itemId) => Inventory.Def(itemId)?.Name ?? itemId;

        /// <summary>Writes the inventory (and the quests and health, when set) into the bound elements now.</summary>
        public void Refresh()
        {
            var root = Document != null ? Document.rootVisualElement : null;
            if (root == null || Inventory == null) return;
            var grid = root.Q(InventoryElement);
            if (grid != null)
            {
                grid.Clear();
                grid.style.flexDirection = FlexDirection.Row;
                grid.style.flexWrap = Wrap.Wrap;
                foreach (var s in Inventory.Contents)
                {
                    var cell = new Label(s.Empty ? "" : s.Count > 1 ? $"{NameOf(s.ItemId)} ×{s.Count}" : NameOf(s.ItemId));
                    cell.AddToClassList(SlotClass);
                    cell.style.width = new Length(100f / Mathf.Max(1, Mathf.CeilToInt(Inventory.Slots / 2f)), LengthUnit.Percent);
                    cell.style.minHeight = 32;
                    cell.style.borderBottomWidth = cell.style.borderTopWidth = cell.style.borderLeftWidth = cell.style.borderRightWidth = 1;
                    cell.style.borderBottomColor = cell.style.borderTopColor = cell.style.borderLeftColor = cell.style.borderRightColor = new Color(1f, 1f, 1f, 0.4f);
                    cell.style.color = Color.white;
                    cell.style.unityTextAlign = TextAnchor.MiddleCenter;
                    grid.Add(cell);
                }
            }
            foreach (var counter in root.Query<VisualElement>().Where(e => e.name != null && e.name.StartsWith(ItemPrefix)).ToList())
            {
                var itemId = counter.name.Substring(ItemPrefix.Length);
                var label = counter.Q<Label>(className: CountClass);
                if (label == null)
                {
                    label = counter as Label ?? new Label();
                    label.AddToClassList(CountClass);
                    label.style.color = Color.white;
                    if (label != counter) counter.Add(label);
                }
                label.text = $"{NameOf(itemId)}: {Inventory.CountOf(itemId)}";
            }
            if (Quests != null) BindQuests(root);
            var bar = PlayerHealth != null ? root.Q(HealthElement) : null;
            if (bar is ProgressBar progress)
            {
                progress.lowValue = 0f;
                progress.highValue = PlayerHealth.Max;
                progress.value = PlayerHealth.Current;
                progress.title = $"Health {Mathf.CeilToInt(PlayerHealth.Current)}/{Mathf.CeilToInt(PlayerHealth.Max)}";
            }
            else if (bar != null)
            {
                var label = bar.Q<Label>(className: CountClass) ?? new Label();
                if (label.parent == null)
                {
                    label.AddToClassList(CountClass);
                    bar.Add(label);
                }
                label.text = $"Health {Mathf.CeilToInt(PlayerHealth.Current)}/{Mathf.CeilToInt(PlayerHealth.Max)}";
            }
        }

        string QuestText(PlannerQuestRule r)
        {
            if (r == null) return "No active quest";
            if (Quests.IsRewarded(r.QuestId)) return $"{r.Name} — done";
            if (Quests.IsWaitingForRoom(r.QuestId)) return $"{r.Name} — done; make room for the reward";
            if (!Quests.IsActive(r.QuestId)) return $"{r.Name} — not started";
            var goal = string.Join(", ", r.Goal.Select(a => $"{NameOf(a.ItemId)} {Mathf.Min(Inventory.CountOf(a.ItemId), a.Count)}/{a.Count}"));
            return $"{r.Name}: {goal}";
        }

        void BindQuests(VisualElement root)
        {
            foreach (var el in root.Query<VisualElement>().Where(e => e.name == QuestElement || (e.name != null && e.name.StartsWith(QuestElement + "-"))).ToList())
            {
                var rule = el.name == QuestElement
                    ? Quests.Active.FirstOrDefault() ?? Quests.Rules.LastOrDefault(r => Quests.IsRewarded(r.QuestId) || Quests.IsWaitingForRoom(r.QuestId))
                    : Quests.Rule(el.name.Substring(QuestElement.Length + 1));
                var label = el.Q<Label>(className: QuestClass);
                if (label == null)
                {
                    label = new Label();
                    label.AddToClassList(QuestClass);
                    label.style.color = Color.white;
                    label.style.whiteSpace = WhiteSpace.Normal;
                    el.Add(label);
                }
                label.text = QuestText(rule);
            }
        }
    }
}
