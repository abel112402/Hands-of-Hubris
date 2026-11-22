using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// The interaction feedback: while the interactor has a target, “[E] Pick up Brass Key” at the bottom of the screen
    /// (IMGUI, so it needs no UI asset; the plan's HUD can replace it).
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Interaction Prompt")]
    public sealed class PlannerInteractionPrompt : MonoBehaviour
    {
        public PlannerInteractor Interactor;
        [Tooltip("The planned Interact key, as shown (e.g. E).")]
        public string KeyLabel = "";

        /// <summary>The prompt shown now, or null.</summary>
        public string Text
        {
            get
            {
                var target = Interactor != null ? Interactor.Current : null;
                if (target == null) return null;
                return string.IsNullOrEmpty(KeyLabel) ? target.Prompt : $"[{KeyLabel}] {target.Prompt}";
            }
        }

        GUIStyle style;

        void OnGUI()
        {
            var text = Text;
            if (text == null) return;
            if (style == null) style = new GUIStyle(GUI.skin.box) { fontSize = 18, alignment = TextAnchor.MiddleCenter, padding = new RectOffset(12, 12, 8, 8) };
            var size = style.CalcSize(new GUIContent(text));
            GUI.Box(new Rect((Screen.width - size.x) / 2f, Screen.height - size.y - 40f, size.x, size.y), text, style);
        }
    }
}
