// Minimal observable store (no framework). Screens subscribe and unsubscribe on cleanup.

export function createStore(initial = {}) {
  let state = { ...initial };
  const subscribers = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      subscribers.forEach((fn) => {
        try { fn(state); } catch (e) { console.error(e); }
      });
    },
    subscribe(fn, { immediate = true } = {}) {
      subscribers.add(fn);
      if (immediate) fn(state);
      return () => subscribers.delete(fn);
    },
  };
}
