// Tiny, dependency-free view helpers.
// `html` is a tagged template that AUTO-ESCAPES every interpolated value (XSS-safe:
// player IGNs, names etc. are user input shown to other users). Use raw() only for
// trusted markup such as icons or nested html`` results.

class SafeHTML {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);
}

export function raw(markup) {
  return new SafeHTML(String(markup ?? ''));
}

function stringify(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHTML) return value.value;
  if (Array.isArray(value)) return value.map(stringify).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += stringify(values[i]) + strings[i + 1];
  return new SafeHTML(out);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function setHTML(el, content) {
  if (el) el.innerHTML = String(content ?? '');
}

/** Delegated event listener. Returns an unsubscribe function. */
export function on(root, event, selector, handler) {
  const listener = (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  };
  root.addEventListener(event, listener);
  return () => root.removeEventListener(event, listener);
}

/** Read a <form> into a plain object (trimmed strings, checkbox → boolean). */
export function readForm(form) {
  const out = {};
  Array.from(form.elements).forEach((el) => {
    if (!el.name || el.disabled) return;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = typeof el.value === 'string' ? el.value.trim() : el.value;
  });
  return out;
}

/** Collects cleanup callbacks (Firestore listeners, timers, DOM listeners). */
export function createDisposer() {
  const fns = [];
  return {
    add(fn) { if (typeof fn === 'function') fns.push(fn); return fn; },
    run() { while (fns.length) { try { fns.pop()(); } catch (e) { console.warn(e); } } },
  };
}
