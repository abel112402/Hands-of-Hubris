using System;
using System.Collections.Generic;
using System.Linq;

namespace HoHPlanner.Runtime
{
    public enum PlannerRuntimeState { Created, Running, Stopped, Failed }

    /// <summary>A runtime cannot start: a missing or duplicate service, a dependency cycle, or a service that threw while starting.</summary>
    public sealed class PlannerRuntimeException : Exception
    {
        public PlannerRuntimeException(string message, Exception inner = null) : base(message, inner) { }
    }

    /// <summary>
    /// Starts the services of a playable prototype in dependency order and stops them in reverse. Plain C#, so it is
    /// tested without a scene; <see cref="PlannerRuntimeHost"/> runs one in a scene.
    ///
    /// Contract: <see cref="Start"/> checks everything before starting anything (missing required ids, unknown
    /// dependencies, duplicates, cycles) and throws <see cref="PlannerRuntimeException"/> with every problem. When a
    /// service throws in Initialize, the ones already started are shut down in reverse order, the state is Failed
    /// and the exception is rethrown wrapped. <see cref="Stop"/> shuts every started service down even when one throws,
    /// and reports those in <see cref="Errors"/>. Order among independent services is the registration order.
    /// </summary>
    public sealed class PlannerRuntime
    {
        readonly List<IPlannerService> registered = new List<IPlannerService>();
        readonly List<IPlannerService> started = new List<IPlannerService>();
        readonly List<string> errors = new List<string>();

        public PlannerRuntimeState State { get; private set; } = PlannerRuntimeState.Created;
        public PlannerEvents Events { get; } = new PlannerEvents();

        /// <summary>Problems met while starting or stopping, readable as they are.</summary>
        public IReadOnlyList<string> Errors => errors;

        /// <summary>Ids of the running services, in start order.</summary>
        public IReadOnlyList<string> StartOrder => started.Select(s => s.Id).ToList();

        public PlannerRuntime()
        {
            Events.HandlerFailed += (type, ex) => errors.Add($"A handler of {type.Name} failed: {ex.Message}");
        }

        public PlannerRuntime Register(IPlannerService service)
        {
            if (service == null) throw new ArgumentNullException(nameof(service));
            if (State != PlannerRuntimeState.Created) throw new InvalidOperationException("Services are registered before the runtime starts.");
            registered.Add(service);
            return this;
        }

        /// <summary>The running service of type <typeparamref name="T"/>, or null.</summary>
        public T Get<T>() where T : class => started.OfType<T>().FirstOrDefault();

        /// <summary>The running service with this id, or null.</summary>
        public IPlannerService Get(string id) => started.FirstOrDefault(s => s.Id == id);

        /// <summary>Starts every registered service. <paramref name="required"/>: ids that must be registered (from the plan's chosen systems).</summary>
        public void Start(IEnumerable<string> required = null)
        {
            if (State != PlannerRuntimeState.Created) throw new InvalidOperationException($"The runtime was already started (state {State}).");
            var order = Resolve(required ?? Array.Empty<string>(), out var problems);
            if (problems.Count > 0)
            {
                State = PlannerRuntimeState.Failed;
                errors.AddRange(problems);
                throw new PlannerRuntimeException("The planner runtime cannot start:\n- " + string.Join("\n- ", problems));
            }
            foreach (var s in order)
            {
                try
                {
                    s.Initialize(this);
                    started.Add(s);
                }
                catch (Exception ex)
                {
                    var message = $"Service “{s.Id}” failed to start: {ex.Message}";
                    errors.Add(message);
                    ShutdownStarted();
                    State = PlannerRuntimeState.Failed;
                    throw new PlannerRuntimeException(message, ex);
                }
            }
            State = PlannerRuntimeState.Running;
        }

        /// <summary>Shuts down every started service in reverse order. Safe to call more than once.</summary>
        public void Stop()
        {
            if (State != PlannerRuntimeState.Running) return;
            ShutdownStarted();
            State = PlannerRuntimeState.Stopped;
        }

        void ShutdownStarted()
        {
            for (var i = started.Count - 1; i >= 0; i--)
            {
                try
                {
                    started[i].Shutdown();
                }
                catch (Exception ex)
                {
                    errors.Add($"Service “{started[i].Id}” failed to stop: {ex.Message}");
                }
            }
            started.Clear();
            Events.Clear();
        }

        List<IPlannerService> Resolve(IEnumerable<string> required, out List<string> problemsOut)
        {
            // A local list: an out parameter cannot be used inside the local function below.
            var problems = problemsOut = new List<string>();
            var byId = new Dictionary<string, IPlannerService>();
            foreach (var s in registered)
            {
                if (string.IsNullOrEmpty(s.Id)) problems.Add($"A service of type {s.GetType().Name} has no id.");
                else if (byId.ContainsKey(s.Id)) problems.Add($"Two services have the id “{s.Id}”.");
                else byId[s.Id] = s;
            }
            foreach (var id in required.Distinct())
                if (!byId.ContainsKey(id)) problems.Add($"The plan needs the “{id}” module, but no service with that id is registered. Add its component to the runtime host.");
            foreach (var s in byId.Values)
                foreach (var d in s.DependsOn ?? Array.Empty<string>())
                    if (!byId.ContainsKey(d)) problems.Add($"Service “{s.Id}” needs “{d}”, which is not registered.");
            if (problems.Count > 0) return new List<IPlannerService>();

            // Depth-first in registration order: dependencies first, a cycle is reported with its path.
            var order = new List<IPlannerService>();
            var done = new HashSet<string>();
            var path = new List<string>();
            void Visit(IPlannerService s)
            {
                if (done.Contains(s.Id)) return;
                if (path.Contains(s.Id))
                {
                    problems.Add($"Dependency cycle: {string.Join(" → ", path.SkipWhile(x => x != s.Id))} → {s.Id}.");
                    return;
                }
                path.Add(s.Id);
                foreach (var d in s.DependsOn ?? Array.Empty<string>()) Visit(byId[d]);
                path.RemoveAt(path.Count - 1);
                if (done.Add(s.Id)) order.Add(s);
            }
            foreach (var s in byId.Values) Visit(s);
            return order;
        }
    }
}
