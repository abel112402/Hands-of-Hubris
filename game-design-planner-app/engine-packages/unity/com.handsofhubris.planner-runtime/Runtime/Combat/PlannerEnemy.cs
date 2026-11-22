using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    [Serializable]
    public struct PlannerResistance
    {
        public string DamageType;
        [Tooltip("Percent; negative is a weakness.")]
        public float Percent;
    }

    /// <summary>
    /// An enemy placed from the plan (Combat › Enemies, on a location map): its HP (on <see cref="PlannerHealth"/>), damage
    /// per hit, attacks per second, armor, resistances, speed and aggression. Unless passive, it walks to the player when
    /// within the aggro radius and hits within reach at its rate. Defeated, it stops, its body is hidden, and its loot (if
    /// any) waits on it for the player to take (<see cref="PlannerLoot"/>).
    /// </summary>
    [RequireComponent(typeof(PlannerHealth))]
    [AddComponentMenu("Game Design Planner/Planner Enemy")]
    public sealed class PlannerEnemy : MonoBehaviour
    {
        public PlannerCombat Combat;
        public string EnemyId;
        public string Name;
        public float Damage = 1f;
        [Min(0.01f)] public float AttackRate = 1f;
        public float Armor;
        public List<PlannerResistance> Resistances = new List<PlannerResistance>();
        [Tooltip("Metres per second.")]
        [Min(0f)] public float Speed = 2f;
        [Tooltip("Never attacks (Aggression: Passive).")]
        public bool Passive;
        public int Xp;
        [Tooltip("The body to hide when defeated (none: the renderers of this object).")]
        public GameObject Body;

        PlannerHealth health;
        PlannerPlacement placement;
        CharacterController controller;
        float nextHit;
        float fall;

        public PlannerHealth Health => health != null ? health : health = GetComponent<PlannerHealth>();
        public PlannerPlacement Placement => placement != null ? placement : placement = GetComponent<PlannerPlacement>();
        public bool Defeated { get; private set; }

        public float ResistanceTo(string damageType) =>
            string.IsNullOrEmpty(damageType) ? 0f : Resistances.Where(r => r.DamageType == damageType).Select(r => r.Percent).DefaultIfEmpty(0f).First();

        void Awake() => controller = GetComponent<CharacterController>();

        void Update()
        {
            if (Combat == null || !Combat.Running || Defeated || Health.IsDead || Passive || Combat.Player == null) return;
            var player = Combat.Player.transform.position;
            var flat = new Vector3(player.x - transform.position.x, 0f, player.z - transform.position.z);
            var d = flat.magnitude;
            if (d <= Combat.EnemyReach)
            {
                if (Time.time >= nextHit)
                {
                    nextHit = Time.time + 1f / AttackRate;
                    Combat.HitPlayer(this);
                }
            }
            else if (d <= Combat.AggroRadius && Speed > 0f)
            {
                var step = flat.normalized * Speed;
                fall = controller != null && controller.isGrounded ? -1f : fall - 20f * Time.deltaTime;
                if (controller != null && controller.enabled) controller.Move((step + Vector3.up * fall) * Time.deltaTime);
                else transform.position += step * Time.deltaTime;
                transform.rotation = Quaternion.LookRotation(flat);
            }
        }

        /// <summary>Defeated: stops, the body is hidden, the loot becomes takeable.</summary>
        public void Defeat()
        {
            Defeated = true;
            ShowBody(false);
            var loot = GetComponent<PlannerLoot>();
            if (loot != null) loot.enabled = !loot.Looted && loot.Items.Count > 0;
            if (loot == null || !loot.enabled) gameObject.SetActive(false);
        }

        void ShowBody(bool show)
        {
            if (controller != null) controller.enabled = show;
            if (Body != null) Body.SetActive(show);
            else foreach (var r in GetComponentsInChildren<Renderer>(true)) r.enabled = show;
        }

        /// <summary>A loaded game's state: health, defeated, looted.</summary>
        public void SetState(float hp, bool defeated, bool looted)
        {
            gameObject.SetActive(true);
            var loot = GetComponent<PlannerLoot>();
            if (loot != null) loot.SetLooted(looted);
            Health.Set(defeated ? 0f : hp);
            Defeated = false;
            ShowBody(true);
            if (loot != null) loot.enabled = false;
            if (defeated) Defeat();
        }
    }
}
