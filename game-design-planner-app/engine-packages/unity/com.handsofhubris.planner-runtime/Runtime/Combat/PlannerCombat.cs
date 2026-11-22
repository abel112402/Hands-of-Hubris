using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>The plan's damage formula (Combat › Damage and defense model), as the export generates it (PlannerDamageFormula).</summary>
    public interface IPlannerDamageFormula
    {
        float Damage(float attack, float armor, float resist, float crit);
    }

    /// <summary>The Attack action beside movement (the planned control whose Runtime action is Attack).</summary>
    public interface IPlannerCombatSource
    {
        bool AttackPressed { get; }
    }

    /// <summary>A hit landed (on the runtime's event bus).</summary>
    public readonly struct PlannerHit
    {
        /// <summary>The enemy's map object, or null when the player was hit.</summary>
        public readonly string TargetObjectId;
        public readonly float Damage;
        public readonly float HealthLeft;

        public PlannerHit(string target, float damage, float left)
        {
            TargetObjectId = target;
            Damage = damage;
            HealthLeft = left;
        }
    }

    /// <summary>An enemy was defeated: its XP (no levelling module uses it yet) and the loot it holds for the player to take.</summary>
    public readonly struct PlannerEnemyDefeated
    {
        public readonly string EnemyId;
        public readonly string ObjectId;
        public readonly int Xp;

        public PlannerEnemyDefeated(string enemyId, string objectId, int xp)
        {
            EnemyId = enemyId;
            ObjectId = objectId;
            Xp = xp;
        }
    }

    /// <summary>The player's health reached 0; it is back at the start with full health.</summary>
    public readonly struct PlannerPlayerDefeated
    {
        public readonly string ByEnemyId;
        public PlannerPlayerDefeated(string by) => ByEnemyId = by;
    }

    /// <summary>
    /// The “combat” module — the first supported model only (phase 15): melee. On the Attack action the player hits the
    /// nearest living enemy within <see cref="AttackRange"/> metres (on the ground plane), at most <see cref="WeaponRate"/>
    /// times a second, for <c>Damage(attack = weapon damage, armor = enemy armor, resist = enemy resistance to the weapon's
    /// damage type, crit = 1)</c> by the plan's formula. Enemies hit the player the same way (armor 0, resist 0). A defeated
    /// enemy publishes its XP and holds its loot; a defeated player is put back at <see cref="Respawn"/> with full health.
    /// Ranged attacks, crits, status effects and difficulty scaling are not part of it.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Combat")]
    public sealed class PlannerCombat : MonoBehaviour, IPlannerService
    {
        public PlannerPlayer Player;
        [Tooltip("The player's health (Player Character › Survival stats › Health Max).")]
        public PlannerHealth PlayerHealth;
        [Tooltip("The generated PlannerDamageFormula (an IPlannerDamageFormula).")]
        public MonoBehaviour Formula;
        [Tooltip("Where a defeated player comes back (the player start).")]
        public Transform Respawn;
        [Header("Player weapon (the plan's Player weapon)")]
        public string WeaponId;
        public float WeaponDamage = 1f;
        public string WeaponDamageType;
        [Min(0.01f)] public float WeaponRate = 1f;
        [Tooltip("Player Character › Attack range (m).")]
        [Min(0.1f)] public float AttackRange = 1.5f;
        [Header("Enemies")]
        [Tooltip("Enemies that are not Passive chase the player within this many metres.")]
        [Min(0f)] public float AggroRadius = 8f;
        [Tooltip("Enemies hit the player within this many metres.")]
        [Min(0.1f)] public float EnemyReach = 1.5f;

        PlannerRuntime runtime;
        float nextAttack;

        public string Id => "combat";
        public IReadOnlyList<string> DependsOn => new[] { "movement" };
        public bool Running => runtime != null && runtime.State == PlannerRuntimeState.Running;
        IPlannerDamageFormula F => Formula as IPlannerDamageFormula;

        public void Initialize(PlannerRuntime runtime)
        {
            var problems = new List<string>();
            if (Player == null) problems.Add("no player");
            if (PlayerHealth == null) problems.Add("no player health");
            if (F == null) problems.Add("no damage formula: the scene needs the generated PlannerDamageFormula (export with Combat chosen and build the prototype scene again)");
            if (WeaponDamage <= 0f) problems.Add("the Player weapon has no damage");
            if (problems.Count > 0) throw new InvalidOperationException("Combat cannot start: " + string.Join("; ", problems) + ".");
            this.runtime = runtime;
            nextAttack = 0f;
        }

        public void Shutdown() => runtime = null;

        public static IEnumerable<PlannerEnemy> Enemies => FindObjectsByType<PlannerEnemy>(FindObjectsSortMode.None);

        /// <summary>The damage of one hit by the plan's formula.</summary>
        public float Damage(float attack, float armor, float resist) => Mathf.Max(0f, F.Damage(attack, armor, resist, 1f));

        public float PlayerHitOn(PlannerEnemy e) => Damage(WeaponDamage, e.Armor, e.ResistanceTo(WeaponDamageType));

        public float EnemyHitOnPlayer(PlannerEnemy e) => Damage(e.Damage, 0f, 0f);

        static float Flat(Vector3 a, Vector3 b) => Vector2.Distance(new Vector2(a.x, a.z), new Vector2(b.x, b.z));

        /// <summary>The living enemy the next attack hits, or null when none is in reach.</summary>
        public PlannerEnemy Target()
        {
            if (Player == null) return null;
            var at = Player.transform.position;
            return Enemies.Where(e => !e.Health.IsDead && Flat(at, e.transform.position) <= AttackRange).OrderBy(e => Flat(at, e.transform.position)).FirstOrDefault();
        }

        /// <summary>Whether the weapon is ready again.</summary>
        public bool Ready => Time.time >= nextAttack;

        void Update()
        {
            if (!Running || Player == null) return;
            var source = Player.GetComponent<IPlannerCombatSource>();
            if (source != null && source.AttackPressed) TryAttack();
        }

        /// <summary>One attack, as the Attack action does: false when the weapon is not ready or no enemy is in reach.</summary>
        public bool TryAttack()
        {
            if (!Running || !Ready) return false;
            var target = Target();
            if (target == null) return false;
            nextAttack = Time.time + 1f / WeaponRate;
            var dmg = PlayerHitOn(target);
            target.Health.Hit(dmg);
            runtime.Events.Publish(new PlannerHit(target.Placement != null ? target.Placement.ObjectId : target.name, dmg, target.Health.Current));
            if (target.Health.IsDead && !target.Defeated)
            {
                target.Defeat();
                runtime.Events.Publish(new PlannerEnemyDefeated(target.EnemyId, target.Placement != null ? target.Placement.ObjectId : target.name, target.Xp));
            }
            return true;
        }

        /// <summary>An enemy's hit on the player (PlannerEnemy calls it at its rate).</summary>
        public void HitPlayer(PlannerEnemy by)
        {
            if (!Running || PlayerHealth == null || PlayerHealth.IsDead) return;
            var dmg = EnemyHitOnPlayer(by);
            PlayerHealth.Hit(dmg);
            runtime.Events.Publish(new PlannerHit(null, dmg, PlayerHealth.Current));
            if (!PlayerHealth.IsDead) return;
            runtime.Events.Publish(new PlannerPlayerDefeated(by != null ? by.EnemyId : null));
            if (Respawn != null) Player.Teleport(Respawn.position + new Vector3(0f, 0.05f, 0f), 0f);
            PlayerHealth.Restore();
        }
    }
}
