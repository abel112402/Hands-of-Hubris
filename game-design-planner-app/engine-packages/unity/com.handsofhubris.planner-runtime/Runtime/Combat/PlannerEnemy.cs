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

    /// <summary>What an enemy is doing (its behaviour template's state).</summary>
    public enum PlannerEnemyState
    {
        /// <summary>Stands at its post.</summary>
        Guard,
        /// <summary>Walks its patrol route, point after point, round and round.</summary>
        Patrol,
        /// <summary>Saw the player and goes for it; hits within reach.</summary>
        Chase,
        /// <summary>Lost the player, or went past its give-up range: goes back to its post or route.</summary>
        Return,
    }

    /// <summary>An enemy's state changed (on the runtime's event bus).</summary>
    public readonly struct PlannerEnemyStateChanged
    {
        public readonly string ObjectId;
        public readonly PlannerEnemyState State;

        public PlannerEnemyStateChanged(string objectId, PlannerEnemyState state)
        {
            ObjectId = objectId;
            State = state;
        }
    }

    /// <summary>
    /// An enemy placed from the plan (Combat › Enemies, on a location map): its HP (on <see cref="PlannerHealth"/>), damage
    /// per hit, attacks per second, armor, resistances, speed, and its behaviour template (phase 19): it guards its post or
    /// walks its patrol route; unless passive, it sees the player within <see cref="SightRange"/> when no wall is between
    /// them, chases and hits within reach at its rate; it goes back after losing sight for <see cref="ForgetAfter"/>
    /// seconds, or (when <see cref="GiveUp"/> is set) once it is that far from its post or route, and only comes again
    /// for a player within that range. It walks the level's navigation mesh (<see cref="PlannerNavigation"/>) when there
    /// is one, else straight. Defeated, it stops, its body is hidden, and its loot (if any) waits on it for the player to
    /// take (<see cref="PlannerLoot"/>).
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
        [Tooltip("Metres it sees the player within (walls block it); 0: the combat's aggro radius.")]
        [Min(0f)] public float SightRange = 8f;
        [Tooltip("Metres from its post or route it chases before it goes back; 0: no limit (a Hunter).")]
        [Min(0f)] public float GiveUp;
        [Tooltip("Seconds without seeing the player before it goes back.")]
        [Min(0f)] public float ForgetAfter = 3f;
        [Tooltip("Where it stands guard (none: where it starts).")]
        public Transform Post;
        [Tooltip("Its patrol route, walked in order and round again; empty: it guards its post.")]
        public List<Vector3> Route = new List<Vector3>();
        [Tooltip("The level's navigation (none: the first in the scene, if any).")]
        public PlannerNavigation Navigation;
        public int Xp;
        [Tooltip("The body to hide when defeated (none: the renderers of this object).")]
        public GameObject Body;

        PlannerHealth health;
        PlannerPlacement placement;
        CharacterController controller;
        float nextHit;
        float fall;
        Vector3 home;
        int next;
        float lastSeen = float.NegativeInfinity;
        readonly List<Vector3> corners = new List<Vector3>();
        Vector3 pathTo;
        float repathAt;

        public PlannerHealth Health => health != null ? health : health = GetComponent<PlannerHealth>();
        public PlannerPlacement Placement => placement != null ? placement : placement = GetComponent<PlannerPlacement>();
        public bool Defeated { get; private set; }

        public float ResistanceTo(string damageType) =>
            string.IsNullOrEmpty(damageType) ? 0f : Resistances.Where(r => r.DamageType == damageType).Select(r => r.Percent).DefaultIfEmpty(0f).First();

        public PlannerEnemyState State { get; private set; }
        /// <summary>The route point it walks to next (patrolling).</summary>
        public int NextPoint => next;
        public Vector3 Home => Post != null ? Post.position : home;

        void Awake()
        {
            controller = GetComponent<CharacterController>();
            // At a high frame rate a step is tiny; the default minimum move distance would drop every one of them.
            if (controller != null) controller.minMoveDistance = 0f;
        }

        void Start()
        {
            home = transform.position;
            State = Route.Count > 1 ? PlannerEnemyState.Patrol : PlannerEnemyState.Guard;
        }

        PlannerNavigation Nav => Navigation != null ? Navigation : Navigation = FindFirstObjectByType<PlannerNavigation>();
        float Sight => SightRange > 0f ? SightRange : Combat != null ? Combat.AggroRadius : 8f;
        static float Flat(Vector3 a, Vector3 b) => Vector2.Distance(new Vector2(a.x, a.z), new Vector2(b.x, b.z));

        /// <summary>How far a point is from its post, or from the nearest point of its route.</summary>
        public float FromPost(Vector3 p)
        {
            var d = Flat(p, Home);
            foreach (var r in Route) d = Mathf.Min(d, Flat(p, r));
            return d;
        }

        /// <summary>Whether it sees the player now: within sight range and no wall between them.</summary>
        public bool Sees(PlannerPlayer player)
        {
            if (player == null || Flat(player.transform.position, transform.position) > Sight) return false;
            var eye = transform.position + Vector3.up * 1.2f;
            var target = player.transform.position + Vector3.up * 1f;
            if (!Physics.Linecast(eye, target, out var hit, ~0, QueryTriggerInteraction.Ignore)) return true;
            return hit.transform.IsChildOf(player.transform) || hit.transform.IsChildOf(transform);
        }

        void SetState(PlannerEnemyState state)
        {
            if (State == state) return;
            State = state;
            corners.Clear();
            Combat?.Publish(new PlannerEnemyStateChanged(Placement != null ? Placement.ObjectId : name, state));
        }

        void Update()
        {
            if (Combat == null || !Combat.Running || Defeated || Health.IsDead) return;
            var player = Combat.Player;
            var sees = !Passive && player != null && Sees(player) && (GiveUp <= 0f || FromPost(player.transform.position) <= GiveUp);
            if (sees) lastSeen = Time.time;
            switch (State)
            {
                case PlannerEnemyState.Guard:
                case PlannerEnemyState.Patrol:
                    if (sees) SetState(PlannerEnemyState.Chase);
                    else if (State == PlannerEnemyState.Patrol && Route.Count > 1)
                    {
                        if (WalkTo(Route[next], 0.4f)) next = (next + 1) % Route.Count;
                    }
                    else if (Flat(transform.position, Home) > 0.5f) WalkTo(Home, 0.4f);
                    break;
                case PlannerEnemyState.Chase:
                    if (player == null || Time.time - lastSeen > ForgetAfter || (GiveUp > 0f && FromPost(transform.position) > GiveUp))
                    {
                        SetState(PlannerEnemyState.Return);
                        break;
                    }
                    var p = player.transform.position;
                    if (Flat(p, transform.position) <= Combat.EnemyReach)
                    {
                        Face(p);
                        if (Time.time >= nextHit)
                        {
                            nextHit = Time.time + 1f / AttackRate;
                            Combat.HitPlayer(this);
                        }
                    }
                    else WalkTo(p, Combat.EnemyReach * 0.8f);
                    break;
                case PlannerEnemyState.Return:
                    if (sees)
                    {
                        SetState(PlannerEnemyState.Chase);
                        break;
                    }
                    var back = Home;
                    if (Route.Count > 1)
                    {
                        // Back to the nearest point of the route, then on along it.
                        var best = 0;
                        for (var i = 1; i < Route.Count; i++)
                            if (Flat(transform.position, Route[i]) < Flat(transform.position, Route[best])) best = i;
                        back = Route[best];
                        next = best;
                    }
                    if (WalkTo(back, 0.4f)) SetState(Route.Count > 1 ? PlannerEnemyState.Patrol : PlannerEnemyState.Guard);
                    break;
            }
        }

        void Face(Vector3 p)
        {
            var flat = new Vector3(p.x - transform.position.x, 0f, p.z - transform.position.z);
            if (flat.sqrMagnitude > 0.0001f) transform.rotation = Quaternion.LookRotation(flat);
        }

        /// <summary>One step towards a point, over the navigation mesh when there is one; true once within <paramref name="near"/> metres.</summary>
        bool WalkTo(Vector3 target, float near)
        {
            if (Flat(transform.position, target) <= near) return true;
            if (Speed <= 0f) return false;
            var aim = target;
            var nav = Nav;
            if (nav != null && nav.Available)
            {
                if (corners.Count == 0 || Time.time >= repathAt || Flat(pathTo, target) > 0.5f)
                {
                    nav.Path(transform.position, target, corners);
                    pathTo = target;
                    repathAt = Time.time + 0.25f;
                    if (corners.Count > 0) corners.RemoveAt(0);
                }
                while (corners.Count > 0 && Flat(transform.position, corners[0]) < 0.2f) corners.RemoveAt(0);
                if (corners.Count > 0) aim = corners[0];
            }
            var flat = new Vector3(aim.x - transform.position.x, 0f, aim.z - transform.position.z);
            if (flat.sqrMagnitude < 0.0001f) return false;
            var step = flat.normalized * Speed;
            fall = controller != null && controller.isGrounded ? -1f : fall - 20f * Time.deltaTime;
            if (controller != null && controller.enabled) controller.Move((step + Vector3.up * fall) * Time.deltaTime);
            else transform.position += step * Time.deltaTime;
            transform.rotation = Quaternion.LookRotation(flat);
            return Flat(transform.position, target) <= near;
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
            // A loaded game: it goes back to its post or route from wherever it is.
            State = PlannerEnemyState.Return;
            corners.Clear();
            ShowBody(true);
            if (loot != null) loot.enabled = false;
            if (defeated) Defeat();
        }
    }
}
