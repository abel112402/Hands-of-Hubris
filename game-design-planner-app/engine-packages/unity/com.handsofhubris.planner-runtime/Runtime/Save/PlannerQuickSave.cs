using System;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>Where the Quick save and Quick load actions come from (the input source of the player).</summary>
    public interface IPlannerSaveSource
    {
        bool QuickSavePressed { get; }
        bool QuickLoadPressed { get; }
    }

    public enum PlannerQuickSaveResult
    {
        None,
        Saved,
        Loaded,
        /// <summary>Load was pressed, but the slot is empty.</summary>
        NothingToLoad,
        /// <summary>Saving or loading threw (a damaged or newer save, a part that does not fit the plan); nothing changed.</summary>
        Failed,
    }

    /// <summary>
    /// Saving and loading while playing: the plan's Quick save and Quick load controls save the game into
    /// <see cref="Slot"/> and load it back, through the game's save system (the export's generated PlannerSaveSlice).
    /// A short message says what happened; a save that cannot be loaded is reported and changes nothing.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Quick Save")]
    public sealed class PlannerQuickSave : MonoBehaviour
    {
        [Tooltip("The game's save system (an IPlannerSaveSystem: the generated PlannerSaveSlice).")]
        public MonoBehaviour SaveSystem;
        [Tooltip("The player; its IPlannerSaveSource gives the Quick save and Quick load actions.")]
        public Transform Player;
        [Tooltip("The save slot (the plan's first manual slot).")]
        public string Slot = "manual-1";
        [Tooltip("Seconds the message stays on screen.")]
        [Min(0f)] public float MessageSeconds = 2f;
        [Tooltip("Key names for the message (from the plan's controls).")]
        public string SaveKeyLabel = "", LoadKeyLabel = "";

        public IPlannerSaveSource Source { get; set; }
        public PlannerQuickSaveResult Last { get; private set; }
        public string Message { get; private set; }
        float shownUntil;

        IPlannerSaveSystem System => SaveSystem as IPlannerSaveSystem;

        /// <summary>After each save or load, with what happened.</summary>
        public event Action<PlannerQuickSaveResult> Done;

        void Update()
        {
            if (Source == null && Player != null) Source = Player.GetComponent<IPlannerSaveSource>();
            if (Source == null) return;
            if (Source.QuickSavePressed) Save();
            else if (Source.QuickLoadPressed) Load();
        }

        public PlannerQuickSaveResult Save()
        {
            try
            {
                if (System == null) throw new InvalidOperationException("there is no save system in the scene");
                System.Save(Slot);
                return Report(PlannerQuickSaveResult.Saved, "Game saved");
            }
            catch (Exception e)
            {
                Debug.LogError($"[Planner runtime] Quick save failed: {e.Message}", this);
                return Report(PlannerQuickSaveResult.Failed, "Not saved: " + e.Message);
            }
        }

        public PlannerQuickSaveResult Load()
        {
            try
            {
                if (System == null) throw new InvalidOperationException("there is no save system in the scene");
                return System.Load(Slot) ? Report(PlannerQuickSaveResult.Loaded, "Game loaded") : Report(PlannerQuickSaveResult.NothingToLoad, "No saved game yet");
            }
            catch (Exception e)
            {
                Debug.LogError($"[Planner runtime] Quick load failed: {e.Message}", this);
                return Report(PlannerQuickSaveResult.Failed, "Not loaded: " + e.Message);
            }
        }

        PlannerQuickSaveResult Report(PlannerQuickSaveResult result, string message)
        {
            Last = result;
            Message = message;
            shownUntil = Time.unscaledTime + MessageSeconds;
            Done?.Invoke(result);
            return result;
        }

        void OnGUI()
        {
            if (string.IsNullOrEmpty(Message) || Time.unscaledTime > shownUntil) return;
            var hint = string.IsNullOrEmpty(SaveKeyLabel) ? "" : $"   ({SaveKeyLabel} save, {LoadKeyLabel} load)";
            GUI.Label(new Rect(20f, 20f, 600f, 24f), Message + hint);
        }
    }
}
