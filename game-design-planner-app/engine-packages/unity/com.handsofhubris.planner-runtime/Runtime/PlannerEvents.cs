using System;
using System.Collections.Generic;

namespace HoHPlanner.Runtime
{
    /// <summary>
    /// Typed event bus of one runtime. Handlers run synchronously, in subscription order; one that throws is reported
    /// through <see cref="HandlerFailed"/> and does not stop the others.
    /// </summary>
    public sealed class PlannerEvents
    {
        readonly Dictionary<Type, List<Delegate>> handlers = new Dictionary<Type, List<Delegate>>();

        /// <summary>A handler threw: event type and exception.</summary>
        public event Action<Type, Exception> HandlerFailed;

        /// <summary>Calls <paramref name="handler"/> for every published <typeparamref name="T"/> until the returned token is disposed.</summary>
        public IDisposable Subscribe<T>(Action<T> handler)
        {
            if (handler == null) throw new ArgumentNullException(nameof(handler));
            if (!handlers.TryGetValue(typeof(T), out var list)) handlers[typeof(T)] = list = new List<Delegate>();
            list.Add(handler);
            return new Token(() => list.Remove(handler));
        }

        public void Publish<T>(T e)
        {
            if (!handlers.TryGetValue(typeof(T), out var list)) return;
            // A copy, so a handler may subscribe or unsubscribe while the event is delivered.
            foreach (var h in list.ToArray())
            {
                try
                {
                    ((Action<T>)h)(e);
                }
                catch (Exception ex)
                {
                    HandlerFailed?.Invoke(typeof(T), ex);
                }
            }
        }

        /// <summary>Number of handlers of <typeparamref name="T"/>.</summary>
        public int Count<T>() => handlers.TryGetValue(typeof(T), out var list) ? list.Count : 0;

        internal void Clear() => handlers.Clear();

        sealed class Token : IDisposable
        {
            Action dispose;
            public Token(Action dispose) => this.dispose = dispose;
            public void Dispose()
            {
                dispose?.Invoke();
                dispose = null;
            }
        }
    }
}
