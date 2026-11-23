using System.Collections.Generic;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// The dialogue panel (IMGUI, no UI asset needed): while someone talks, the speaker's name and line, one button per
    /// option (disabled with the reason when it cannot be picked now) and Leave.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Dialogue Panel")]
    public sealed class PlannerDialoguePanel : MonoBehaviour
    {
        public PlannerDialogue Dialogue;
        [Tooltip("Speaker IDs and their names (from the plan's characters).")]
        public List<string> SpeakerIds = new List<string>();
        public List<string> SpeakerNames = new List<string>();

        public string NameOf(string speaker)
        {
            var i = SpeakerIds.IndexOf(speaker);
            return i >= 0 && i < SpeakerNames.Count ? SpeakerNames[i] : speaker;
        }

        void OnGUI()
        {
            if (Dialogue == null || !Dialogue.IsTalking) return;
            var line = Dialogue.Current;
            var width = Mathf.Min(640f, Screen.width - 40f);
            GUILayout.BeginArea(new Rect((Screen.width - width) / 2f, Screen.height * 0.55f, width, Screen.height * 0.4f), NameOf(line.Speaker), GUI.skin.window);
            GUILayout.Label(line.Text);
            foreach (var o in Dialogue.Options)
            {
                GUI.enabled = o.Allowed;
                if (GUILayout.Button(o.Allowed ? o.Line.Option : $"{o.Line.Option} ({o.Reason})")) Dialogue.Pick(o.Line.LineId);
                GUI.enabled = true;
            }
            if (GUILayout.Button(Dialogue.Options.Count == 0 ? "Close" : "Leave")) Dialogue.End();
            GUILayout.EndArea();
        }
    }
}
