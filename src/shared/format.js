// Formatting helpers (INR, IST-friendly dates, countdowns).

export function inr(amount) {
  const n = Number(amount || 0);
  return `₹${n.toLocaleString('en-IN')}`;
}

export function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  return new Date(ts);
}

export function toMillis(ts) {
  const d = toDate(ts);
  return d ? d.getTime() : 0;
}

const dtf = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
const df = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const tf = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

export const fmtDateTime = (ts) => (toDate(ts) ? dtf.format(toDate(ts)) : '—');
export const fmtDate = (ts) => (toDate(ts) ? df.format(toDate(ts)) : '—');
export const fmtTime = (ts) => (toDate(ts) ? tf.format(toDate(ts)) : '—');

export function timeAgo(ts) {
  const d = toDate(ts);
  if (!d) return '';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return fmtDate(d);
}

const pad = (n) => String(n).padStart(2, '0');

/** 93784000 → "1d 02h 03m" | "02:03:04" */
export function countdownText(ms) {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Date → value for <input type="datetime-local"> in local time */
export function toLocalInputValue(date) {
  const d = toDate(date) || new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function initials(name) {
  const words = String(name || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

export const shortId = (id) => String(id || '').slice(0, 6).toUpperCase();
