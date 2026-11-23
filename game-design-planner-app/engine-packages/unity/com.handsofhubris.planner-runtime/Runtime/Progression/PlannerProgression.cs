using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>The player reached a level (on the runtime's event bus).</summary>
    public readonly struct PlannerLevelUp
    {
        public readonly int Level;
        public readonly int SkillPoints;
        public readonly int StatPoints;

        public PlannerLevelUp(int level, int skillPoints, int statPoints)
        {
            Level = level;
            SkillPoints = skillPoints;
            StatPoints = statPoints;
        }
    }

    /// <summary>
    /// The “progression” module (phase 20): XP from completed quests (their Reward XP) and defeated enemies (their XP);
    /// levels by the plan's XP table (<see cref="XpToNext"/>: the XP from each level to the next) up to the level cap;
    /// each level up adds the planned skill and stat points, which are counted, not spent. Saved as
    /// <see cref="PlannerStateKind.Progression"/>.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Progression")]
    public sealed class PlannerProgression : MonoBehaviour, IPlannerService
    {
        [Min(1)] public int LevelCap = 10;
        [Tooltip("XP from level 1 to 2, 2 to 3, … (the plan's formula, worked out by the planner).")]
        public List<int> XpToNext = new List<int>();
        public float SkillPointsPerLevel;
        public float StatPointsPerLevel;
        public float StartSkillPoints;
        [Tooltip("Show the level and XP on screen.")]
        public bool ShowOnScreen = true;

        PlannerRuntime runtime;
        readonly List<IDisposable> subscriptions = new List<IDisposable>();

        public string Id => "progression";
        public IReadOnlyList<string> DependsOn => Array.Empty<string>();

        public int Level { get; private set; } = 1;
        /// <summary>XP gathered into the current level.</summary>
        public int Xp { get; private set; }
        public int TotalXp { get; private set; }
        public float SkillPoints { get; private set; }
        public float StatPoints { get; private set; }
        /// <summary>XP the current level needs for the next; 0 at the cap.</summary>
        public int Needed => Level < LevelCap && Level - 1 < XpToNext.Count ? XpToNext[Level - 1] : 0;

        public event Action Changed;

        public void Initialize(PlannerRuntime runtime)
        {
            if (XpToNext.Any(x => x < 1)) throw new InvalidOperationException("Progression cannot start: an XP step below 1 (export the plan again).");
            this.runtime = runtime;
            Level = 1;
            Xp = TotalXp = 0;
            SkillPoints = StartSkillPoints;
            StatPoints = 0;
            subscriptions.Add(runtime.Events.Subscribe<PlannerQuestCompleted>(q => Add(q.Xp)));
            subscriptions.Add(runtime.Events.Subscribe<PlannerEnemyDefeated>(e => Add(e.Xp)));
        }

        public void Shutdown()
        {
            foreach (var s in subscriptions) s.Dispose();
            subscriptions.Clear();
            runtime = null;
        }

        /// <summary>Adds XP, levelling up as often as it reaches the next level; nothing at the cap or for 0.</summary>
        public void Add(int xp)
        {
            if (runtime == null || xp <= 0) return;
            TotalXp += xp;
            Xp += xp;
            while (Needed > 0 && Xp >= Needed)
            {
                Xp -= Needed;
                Level++;
                SkillPoints += SkillPointsPerLevel;
                StatPoints += StatPointsPerLevel;
                runtime.Events.Publish(new PlannerLevelUp(Level, Mathf.FloorToInt(SkillPoints), Mathf.FloorToInt(StatPoints)));
            }
            if (Needed == 0) Xp = 0;
            Changed?.Invoke();
        }

        [Serializable]
        public sealed class State
        {
            public int level = 1, xp, totalXp;
            public float skillPoints, statPoints;
        }

        public State CaptureState() => new State { level = Level, xp = Xp, totalXp = TotalXp, skillPoints = SkillPoints, statPoints = StatPoints };

        public void CheckState(State s)
        {
            if (s.level < 1 || s.level > LevelCap) throw new PlannerStateException($"The saved level {s.level} does not fit this plan (1–{LevelCap}).");
            if (s.xp < 0 || s.totalXp < 0 || s.skillPoints < 0 || s.statPoints < 0) throw new PlannerStateException("The saved progression has negative values.");
        }

        public void RestoreState(State s)
        {
            CheckState(s);
            Level = s.level;
            Xp = s.xp;
            TotalXp = s.totalXp;
            SkillPoints = s.skillPoints;
            StatPoints = s.statPoints;
            Changed?.Invoke();
        }

        void OnGUI()
        {
            if (!ShowOnScreen || runtime == null) return;
            GUI.Label(new Rect(20f, 44f, 400f, 22f), Needed > 0 ? $"Level {Level} — {Xp}/{Needed} XP" : $"Level {Level} (max)");
        }
    }
}
