// Hash router – works on http(s)://, file:// (HopWeb) and Cordova (https://localhost).
// Route screen signature:  (outletEl, params, route) => cleanupFn | void

export function createRouter({ routes, outlet, guard, onChange, fallback = '/' }) {
  let cleanup = null;
  let current = null;

  const compiled = routes.map((r) => {
    const keys = [];
    const pattern = r.path.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; });
    return { ...r, keys, re: new RegExp(`^${pattern}/?$`) };
  });

  function parse() {
    const hash = window.location.hash.replace(/^#/, '') || fallback;
    const [path, qs] = hash.split('?');
    return { path: path || fallback, query: new URLSearchParams(qs || '') };
  }

  function match(path) {
    for (const r of compiled) {
      const m = path.match(r.re);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route: r, params };
      }
    }
    return null;
  }

  function navigate(path, { replace = false } = {}) {
    const target = `#${path}`;
    if (window.location.hash === target) { render(); return; }
    if (replace) window.location.replace(target);
    else window.location.hash = path;
  }

  function render() {
    const { path, query } = parse();
    const found = match(path);
    if (!found) { navigate(fallback, { replace: true }); return; }
    const redirect = guard ? guard(found.route, path) : null;
    if (redirect && redirect !== path) { navigate(redirect, { replace: true }); return; }

    if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
    outlet.innerHTML = '';
    window.scrollTo(0, 0);
    current = { ...found.route, params: found.params, path, query };
    if (onChange) onChange(current);
    const result = found.route.screen(outlet, { ...found.params, query }, current);
    cleanup = typeof result === 'function' ? result : null;
  }

  window.addEventListener('hashchange', render);

  return {
    start: render,
    refresh: render,
    navigate,
    current: () => current,
    back(fallbackPath = fallback) {
      if (window.history.length > 1) window.history.back();
      else navigate(fallbackPath, { replace: true });
    },
  };
}
