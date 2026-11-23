using System.Collections.Generic;
using UnityEngine;
#if HOH_UNITY_AI
using UnityEngine.AI;
#endif

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// The “navigation” module: a navigation mesh baked when the game starts from the levels' solid colliders (every
    /// <see cref="PlannerLocation"/>, or <see cref="Roots"/>), and paths over it for enemies and NPCs. It needs Unity's AI
    /// module (com.unity.modules.ai, built in and on by default): without it the module still starts, says so once, and
    /// <see cref="Available"/> is false — movers then walk straight, stopped by walls.
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Navigation")]
    public sealed class PlannerNavigation : MonoBehaviour, IPlannerService
    {
        [Tooltip("Level roots to bake; empty: every PlannerLocation of the scene.")]
        public List<Transform> Roots = new List<Transform>();
        [Tooltip("How close to a wall a mover's centre may come (metres).")]
        [Min(0.05f)] public float AgentRadius = 0.3f;

        public string Id => "navigation";
        public IReadOnlyList<string> DependsOn => System.Array.Empty<string>();

        /// <summary>A navigation mesh is baked and paths can be asked for.</summary>
        public bool Available { get; private set; }
        /// <summary>Why not, when <see cref="Available"/> is false.</summary>
        public string Problem { get; private set; }

#if HOH_UNITY_AI
        NavMeshData data;
        NavMeshDataInstance instance;
        NavMeshPath path;
#endif

        public void Initialize(PlannerRuntime runtime)
        {
#if HOH_UNITY_AI
            var roots = Roots.Count > 0 ? Roots : new List<Transform>();
            if (roots.Count == 0) foreach (var l in FindObjectsByType<PlannerLocation>(FindObjectsSortMode.None)) roots.Add(l.transform);
            // Colliders made or moved this frame report stale bounds until the physics scene is synced.
            Physics.SyncTransforms();
            var sources = new List<NavMeshBuildSource>();
            var bounds = new Bounds();
            var first = true;
            foreach (var root in roots)
            {
                if (root == null) continue;
                var found = new List<NavMeshBuildSource>();
                NavMeshBuilder.CollectSources(root, ~0, NavMeshCollectGeometry.PhysicsColliders, 0, new List<NavMeshBuildMarkup>(), found);
                // Doors and pickups are triggers: the player walks through them, so do the movers.
                found.RemoveAll(s => s.component is Collider c && c.isTrigger);
                sources.AddRange(found);
                foreach (var c in root.GetComponentsInChildren<Collider>())
                {
                    if (c.isTrigger) continue;
                    if (first) bounds = c.bounds;
                    else bounds.Encapsulate(c.bounds);
                    first = false;
                }
            }
            if (sources.Count == 0)
            {
                Problem = "nothing to bake: no level geometry";
                Debug.LogWarning($"[Planner runtime] Navigation: {Problem}; movers walk straight.", this);
                return;
            }
            bounds.Expand(new Vector3(2f, 4f, 2f));
            var settings = NavMesh.GetSettingsByID(0);
            settings.agentRadius = AgentRadius;
            settings.agentHeight = 1.6f;
            settings.agentClimb = 0.3f;
            data = NavMeshBuilder.BuildNavMeshData(settings, sources, bounds, Vector3.zero, Quaternion.identity);
            if (data == null)
            {
                Problem = "the navigation mesh could not be built";
                Debug.LogWarning($"[Planner runtime] Navigation: {Problem}; movers walk straight.", this);
                return;
            }
            instance = NavMesh.AddNavMeshData(data);
            path = new NavMeshPath();
            Available = true;
#else
            Problem = "Unity's AI module (com.unity.modules.ai) is not installed";
            Debug.LogWarning($"[Planner runtime] Navigation: {Problem}; enable it in the Package Manager (Built-in) so movers find their way. Until then they walk straight, stopped by walls.", this);
#endif
        }

        public void Shutdown()
        {
#if HOH_UNITY_AI
            if (instance.valid) instance.Remove();
            if (data != null) Destroy(data);
            data = null;
#endif
            Available = false;
        }

        /// <summary>The nearest point on the navigation mesh within <paramref name="radius"/> metres.</summary>
        public bool OnMesh(Vector3 p, out Vector3 at, float radius = 1.5f)
        {
            at = p;
#if HOH_UNITY_AI
            if (Available && NavMesh.SamplePosition(p, out var hit, radius, NavMesh.AllAreas))
            {
                at = hit.position;
                return true;
            }
#endif
            return false;
        }

        /// <summary>The corners of a walkable path from one point to another; false (and no corners) when there is none.</summary>
        public bool Path(Vector3 from, Vector3 to, List<Vector3> corners)
        {
            corners.Clear();
#if HOH_UNITY_AI
            if (!Available || !OnMesh(from, out var a) || !OnMesh(to, out var b)) return false;
            if (!NavMesh.CalculatePath(a, b, NavMesh.AllAreas, path) || path.status == NavMeshPathStatus.PathInvalid) return false;
            corners.AddRange(path.corners);
            return corners.Count > 0;
#else
            return false;
#endif
        }
    }
}
