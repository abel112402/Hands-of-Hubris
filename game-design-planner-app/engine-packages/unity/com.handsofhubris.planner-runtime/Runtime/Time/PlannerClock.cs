using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>A day phase of the plan (Time, Weather &amp; Events › Day and night).</summary>
    [Serializable]
    public sealed class PlannerDayPhase
    {
        public string PhaseId;
        public string Name;
        [Tooltip("Start hour, 0–24.")]
        public float Start;
        [Tooltip("Hours.")]
        public float Duration;
        [Tooltip("Percent of full daylight.")]
        [Range(0f, 100f)] public float Visibility = 100f;
        [Tooltip("Multiplies the enemies' damage while it lasts.")]
        [Min(0f)] public float MonsterStrength = 1f;

        public bool Contains(float hour)
        {
            var from = ((Start % 24f) + 24f) % 24f;
            var into = ((hour - from) % 24f + 24f) % 24f;
            return into < Duration;
        }
    }

    /// <summary>The day phase changed (on the runtime's event bus); null name: no planned phase.</summary>
    public readonly struct PlannerDayPhaseChanged
    {
        public readonly string PhaseId;
        public readonly string Name;
        public readonly int Day;

        public PlannerDayPhaseChanged(string phaseId, string name, int day)
        {
            PhaseId = phaseId;
            Name = name;
            Day = day;
        }
    }

    /// <summary>
    /// The “time” module (phase 20): an in-game clock — one day lasts <see cref="DayMinutes"/> real minutes, starting at
    /// <see cref="StartHour"/> on day 1. The current day phase (the first planned one that covers the hour) dims
    /// <see cref="Sun"/> to its Visibility and gives <see cref="MonsterStrength"/>, which the combat module multiplies
    /// enemy damage by; hours in no phase have full light and strength 1. Saved as <see cref="PlannerStateKind.Time"/>.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Clock")]
    public sealed class PlannerClock : MonoBehaviour, IPlannerService
    {
        [Tooltip("Real minutes per in-game day.")]
        [Min(0.01f)] public float DayMinutes = 24f;
        [Range(0f, 24f)] public float StartHour = 8f;
        public List<PlannerDayPhase> Phases = new List<PlannerDayPhase>();
        [Tooltip("The sun to dim (none: no light changes).")]
        public Light Sun;
        [Tooltip("Show the clock on screen.")]
        public bool ShowOnScreen = true;

        PlannerRuntime runtime;
        float sunIntensity = 1f;
        PlannerDayPhase current;

        public string Id => "time";
        public IReadOnlyList<string> DependsOn => Array.Empty<string>();

        /// <summary>The hour of the day, 0–24.</summary>
        public float Hour { get; private set; }
        public int Day { get; private set; } = 1;
        public PlannerDayPhase Phase => current;
        public float MonsterStrength => current != null ? current.MonsterStrength : 1f;
        public float Visibility => current != null ? current.Visibility : 100f;
        /// <summary>In-game hours per real second.</summary>
        public float HoursPerSecond => 24f / (DayMinutes * 60f);

        public void Initialize(PlannerRuntime runtime)
        {
            if (Phases.Any(p => p.Duration <= 0f)) throw new InvalidOperationException("Time cannot start: a day phase without a duration (export the plan again).");
            this.runtime = runtime;
            if (Sun != null) sunIntensity = Sun.intensity;
            Set(StartHour, 1);
        }

        public void Shutdown()
        {
            if (Sun != null) Sun.intensity = sunIntensity;
            runtime = null;
        }

        void Update()
        {
            if (runtime == null) return;
            var h = Hour + Time.deltaTime * HoursPerSecond;
            var d = Day;
            while (h >= 24f)
            {
                h -= 24f;
                d++;
            }
            Set(h, d);
        }

        /// <summary>Sets the clock (a loaded game, a test); the light and the phase follow at once.</summary>
        public void Set(float hour, int day)
        {
            Hour = ((hour % 24f) + 24f) % 24f;
            Day = Mathf.Max(1, day);
            var phase = Phases.FirstOrDefault(p => p.Contains(Hour));
            if (Sun != null) Sun.intensity = sunIntensity * (phase != null ? phase.Visibility : 100f) / 100f;
            if (phase != current)
            {
                current = phase;
                runtime?.Events.Publish(new PlannerDayPhaseChanged(phase?.PhaseId, phase?.Name, Day));
            }
        }

        [Serializable]
        public sealed class State
        {
            public float hour;
            public int day = 1;
        }

        public State CaptureState() => new State { hour = Hour, day = Day };

        public void CheckState(State s)
        {
            if (float.IsNaN(s.hour) || s.hour < 0f || s.hour >= 24f || s.day < 1) throw new PlannerStateException($"The saved time (day {s.day}, hour {s.hour}) is not a time.");
        }

        public void RestoreState(State s)
        {
            CheckState(s);
            Set(s.hour, s.day);
        }

        void OnGUI()
        {
            if (!ShowOnScreen || runtime == null) return;
            var h = Mathf.FloorToInt(Hour);
            var m = Mathf.FloorToInt((Hour - h) * 60f);
            GUI.Label(new Rect(Screen.width - 220f, 20f, 200f, 22f), $"Day {Day}, {h:00}:{m:00}{(current != null ? " — " + current.Name : "")}");
        }
    }
}
