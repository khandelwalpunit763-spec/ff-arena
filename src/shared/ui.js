// UI kit: toasts, modal / bottom-sheet, confirm & prompt dialogs, busy buttons, countdown ticker.
import { html, raw, esc, readForm } from './dom.js';
import { icon } from './icons.js';
import { countdownText } from './format.js';

// ───────── Toast ─────────
export function toast(message, type = 'info', ms = 3200) {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const ic = { success: 'check', error: 'alert', warn: 'alert', info: 'info' }[type] || 'info';
  el.innerHTML = `${icon(ic)}<span>${esc(message)}</span>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// ───────── Modal / bottom sheet ─────────
/**
 * openModal({ title, body, actions:[{label, value, variant}], onMount(el, close), dismissible })
 * Returns a promise resolving to the clicked action value (or null when dismissed).
 */
export function openModal({ title = '', body = '', actions = [], onMount, dismissible = true, wide = false } = {}) {
  let root = document.getElementById('modal-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'modal-root';
    document.body.appendChild(root);
  }
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = String(html`
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3>${title}</h3>
        ${dismissible ? html`<button class="icon-btn" data-modal-close aria-label="Close">${icon('x')}</button>` : ''}
      </div>
      <div class="modal-body">${raw(body)}</div>
      ${actions.length ? html`<div class="modal-actions">
        ${actions.map((a, i) => html`<button class="btn ${a.variant || (i === actions.length - 1 ? 'btn-primary' : 'btn-ghost')}" data-modal-action="${i}" ${a.type === 'submit' ? raw('data-submit') : ''}>${a.label}</button>`)}
      </div>` : ''}
    </div>`);
  root.appendChild(wrap);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => wrap.classList.add('open'));

  let resolveFn;
  const result = new Promise((r) => { resolveFn = r; });
  const close = (value = null) => {
    wrap.classList.remove('open');
    setTimeout(() => {
      wrap.remove();
      if (!root.children.length) document.body.classList.remove('modal-open');
    }, 220);
    resolveFn(value);
  };

  wrap.addEventListener('click', async (e) => {
    if (e.target === wrap && dismissible) return close(null);
    if (e.target.closest('[data-modal-close]')) return close(null);
    const btn = e.target.closest('[data-modal-action]');
    if (btn) {
      const action = actions[Number(btn.dataset.modalAction)];
      if (action.onClick) {
        const keepOpen = await action.onClick(wrap, close, btn);
        if (keepOpen === true) return undefined;
      }
      return close(action.value ?? action.label);
    }
    return undefined;
  });
  if (onMount) onMount(wrap, close);
  return { el: wrap, close, result };
}

export async function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
  const { result } = openModal({
    title,
    body: `<p class="muted">${esc(message)}</p>`,
    actions: [
      { label: cancelText, value: false, variant: 'btn-ghost' },
      { label: confirmText, value: true, variant: danger ? 'btn-danger' : 'btn-primary' },
    ],
  });
  return (await result) === true;
}

/** promptDialog({ title, message, fields:[{name,label,type,placeholder,required,value,pattern,options}] }) */
export async function promptDialog({ title, message = '', fields = [], confirmText = 'Submit', danger = false }) {
  const body = String(html`
    ${message ? html`<p class="muted mb-12">${message}</p>` : ''}
    <form class="form" data-prompt-form novalidate>
      ${fields.map((f) => html`
        <label class="field">
          <span class="field-label">${f.label}</span>
          ${f.type === 'select'
            ? html`<select name="${f.name}" class="input">${(f.options || []).map((o) => html`<option value="${o.value}" ${o.value === f.value ? raw('selected') : ''}>${o.label}</option>`)}</select>`
            : f.type === 'textarea'
              ? html`<textarea name="${f.name}" class="input" rows="3" placeholder="${f.placeholder || ''}" ${f.required ? raw('required') : ''}>${f.value || ''}</textarea>`
              : html`<input name="${f.name}" class="input" type="${f.type || 'text'}" value="${f.value ?? ''}" placeholder="${f.placeholder || ''}" ${f.required ? raw('required') : ''} ${f.pattern ? raw(`pattern="${esc(f.pattern)}"`) : ''} ${f.min !== undefined ? raw(`min="${esc(f.min)}"`) : ''}>`}
          ${f.hint ? html`<small class="hint">${f.hint}</small>` : ''}
        </label>`)}
      <p class="form-error" data-prompt-error></p>
    </form>`);

  let values = null;
  const { result } = openModal({
    title,
    body,
    actions: [
      { label: 'Cancel', value: null, variant: 'btn-ghost' },
      {
        label: confirmText,
        variant: danger ? 'btn-danger' : 'btn-primary',
        onClick: (el) => {
          const form = el.querySelector('[data-prompt-form]');
          if (!form.reportValidity()) return true;
          values = readForm(form);
          return false;
        },
        value: 'ok',
      },
    ],
    onMount: (el) => el.querySelector('input,textarea,select')?.focus(),
  });
  const r = await result;
  return r === 'ok' ? values : null;
}

// ───────── Busy buttons ─────────
export function setBusy(btn, busy, busyText = 'Please wait…') {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('is-busy');
    btn.innerHTML = `<span class="spinner"></span><span>${esc(busyText)}</span>`;
  } else {
    btn.disabled = false;
    btn.classList.remove('is-busy');
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

export async function copyText(text, label = 'Copied') {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(`${label}: ${text}`, 'success', 1800);
  } catch {
    toast('Copy failed – long-press to copy manually', 'warn');
  }
}

// ───────── Global countdown ticker ─────────
/** Countdown span with its first value pre-rendered (the ticker keeps it updated). */
export function countdown(targetMs, { prefix = '', done = 'Started' } = {}) {
  const left = Number(targetMs) - Date.now();
  return html`<span data-countdown="${targetMs}" data-prefix="${prefix}" data-done="${done}">${left > 0 ? `${prefix}${countdownText(left)}` : done}</span>`;
}

// <span data-countdown="1729500000000" data-done="Started"></span>
let tickerStarted = false;
export function startCountdownTicker() {
  if (tickerStarted) return;
  tickerStarted = true;
  const tick = () => {
    const now = Date.now();
    document.querySelectorAll('[data-countdown]').forEach((el) => {
      const target = Number(el.dataset.countdown);
      const left = target - now;
      const prefix = el.dataset.prefix || '';
      el.textContent = left > 0 ? `${prefix}${countdownText(left)}` : (el.dataset.done || 'Started');
    });
  };
  tick();
  setInterval(tick, 1000);
}

// ───────── Small render helpers ─────────
export function emptyState({ iconName = 'trophy', title = 'Nothing here yet', text = '', action = '' } = {}) {
  return html`<div class="empty">
    <div class="empty-icon">${icon(iconName)}</div>
    <h4>${title}</h4>
    ${text ? html`<p>${text}</p>` : ''}
    ${action ? raw(action) : ''}
  </div>`;
}

export function skeletonCards(n = 3) {
  return raw(Array.from({ length: n }, () => '<div class="card skeleton-card"><div class="sk sk-banner"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>').join(''));
}
