using System;
using System.Collections.Generic;
using UnityEngine;

namespace HoHPlanner.Bridge
{
    /// <summary>One planner record and the asset the importer made for it.</summary>
    [Serializable]
    public sealed class PlannerIndexEntry
    {
        [Tooltip("The planner's own ID of the record. Never changes, even when the record is renamed.")]
        public string plannerId;

        [Tooltip("The planner schema the record belongs to.")]
        public string schemaId;

        [Tooltip("The record's stable key, e.g. item.iron_sword.")]
        public string key;

        public UnityEngine.Object asset;

        [Tooltip("The record is no longer in the plan. Its asset is kept so nothing that points at it breaks.")]
        public bool deprecated;
    }

    /// <summary>
    /// Maps planner IDs and record keys to the assets the planner bridge created. Written by the importer;
    /// at runtime use <see cref="TryGet{T}"/> to find a record's asset by its key.
    /// </summary>
    public sealed class PlannerIndex : ScriptableObject
    {
        [SerializeField] private List<PlannerIndexEntry> entries = new List<PlannerIndexEntry>();

        [NonSerialized] private Dictionary<string, PlannerIndexEntry> byPlannerId;
        [NonSerialized] private Dictionary<string, PlannerIndexEntry> byKey;

        public IReadOnlyList<PlannerIndexEntry> Entries => entries;

        private void OnEnable() => Invalidate();

        private void OnValidate() => Invalidate();

        private void Invalidate()
        {
            byPlannerId = null;
            byKey = null;
        }

        private void Build()
        {
            if (byPlannerId != null) return;
            byPlannerId = new Dictionary<string, PlannerIndexEntry>();
            byKey = new Dictionary<string, PlannerIndexEntry>();
            foreach (var e in entries)
            {
                if (e == null) continue;
                if (!string.IsNullOrEmpty(e.plannerId)) byPlannerId[e.plannerId] = e;
                if (!string.IsNullOrEmpty(e.key)) byKey[e.key] = e;
            }
        }

        public PlannerIndexEntry FindByPlannerId(string plannerId)
        {
            Build();
            return plannerId != null && byPlannerId.TryGetValue(plannerId, out var e) ? e : null;
        }

        public PlannerIndexEntry FindByKey(string key)
        {
            Build();
            return key != null && byKey.TryGetValue(key, out var e) ? e : null;
        }

        /// <summary>The asset of the record with this key (e.g. Ids.Item.IronSword), when it exists and has that type.</summary>
        public bool TryGet<T>(string key, out T asset) where T : UnityEngine.Object
        {
            asset = FindByKey(key)?.asset as T;
            return asset != null;
        }

        /// <summary>Adds or replaces the entry with the same planner ID. Editor tooling only.</summary>
        public void Set(PlannerIndexEntry entry)
        {
            if (entry == null || string.IsNullOrEmpty(entry.plannerId)) throw new ArgumentException("An index entry needs a planner ID.");
            var i = entries.FindIndex(e => e != null && e.plannerId == entry.plannerId);
            if (i >= 0) entries[i] = entry;
            else entries.Add(entry);
            Invalidate();
        }

        /// <summary>Drops entries whose asset was deleted. Editor tooling only. Returns how many were removed.</summary>
        public int RemoveMissing()
        {
            var n = entries.RemoveAll(e => e == null || e.asset == null);
            if (n > 0) Invalidate();
            return n;
        }
    }
}
