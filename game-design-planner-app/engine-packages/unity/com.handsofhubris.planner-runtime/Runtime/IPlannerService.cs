using System.Collections.Generic;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// One runtime module of a playable prototype (movement, inventory, quests…). <see cref="PlannerRuntime"/> starts
    /// services after the ones they depend on and stops them in reverse order.
    /// </summary>
    public interface IPlannerService
    {
        /// <summary>Stable id, e.g. "inventory". Unique within a runtime.</summary>
        string Id { get; }

        /// <summary>Ids of the services that must be running before this one starts.</summary>
        IReadOnlyList<string> DependsOn { get; }

        /// <summary>Called once, after every dependency started. Throw to report that it cannot start.</summary>
        void Initialize(PlannerRuntime runtime);

        /// <summary>Called once when the runtime stops, in reverse start order. Only called after a successful Initialize.</summary>
        void Shutdown();
    }
}
