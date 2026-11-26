// Reading records (#40), kept per book in state.stats: it survives removing the book (#32) and stays a small
// plain-JSON object so the sync idea (#36) can carry it later. Migrate by adding fields, never reset.
//   addedAt     imported (copied from meta.addedAt)
//   startedAt   first time reading moved forward; null + preTracking when the book was already in progress
//   finishedAt  reached the last sentence (first time)
//   activeMs    time with the reader visible and not paused; a gap without input counts IDLE_CAP at most
//   sentences, words   read forward (one step at a time; chapter jumps don't count) → reading speed
export const IDLE_CAP = 3 * 60e3;

export function initStats(state, meta) {
  if (state.stats) return state.stats;
  return (state.stats = { v: 1, addedAt: meta?.addedAt || Date.now(), startedAt: null, preTracking: (state.index || 0) > 0,
    trackedFrom: Date.now(), finishedAt: null, activeMs: 0, sentences: 0, words: 0 });
}

export const countWords = text => (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;

export function fmtDuration(ms) {
  const m = Math.round(ms / 60e3);
  if (m < 1) return ms > 0 ? '< 1 min' : '0 min';
  const h = Math.floor(m / 60);
  if (h >= 48) return `${Math.floor(h / 24)} d ${h % 24} h`;
  return h ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}
export const fmtDate = t => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

// Rows for the Stats section: [label, value]. `remainingWords` = words left in the book (for an estimate).
export function statRows(st, remainingWords) {
  const min = st.activeMs / 60e3;
  const wpm = min >= 1 && st.words ? Math.round(st.words / min) : 0;
  const sph = min >= 1 && st.sentences ? Math.round(st.sentences / (min / 60)) : 0;
  const rows = [
    ['Imported', fmtDate(st.addedAt)],
    ['Started', st.startedAt ? fmtDate(st.startedAt) : st.preTracking ? `before tracking (tracked since ${fmtDate(st.trackedFrom)})` : 'not yet'],
    ['Finished', st.finishedAt ? fmtDate(st.finishedAt) : 'not yet'],
    ['Active reading time', fmtDuration(st.activeMs) + (st.preTracking ? ' (since tracking)' : '')],
    ['Speed', wpm ? `${wpm} words/min · ${sph} sentences/h` : 'not enough reading yet'],
  ];
  if (st.finishedAt && st.startedAt) rows.push(['Time to finish', `${fmtDuration(st.finishedAt - st.startedAt)} (calendar) · ${fmtDuration(st.activeMs)} reading`]);
  else if (wpm && remainingWords) rows.push(['Left at this speed', fmtDuration(remainingWords / wpm * 60e3)]);
  return rows;
}
