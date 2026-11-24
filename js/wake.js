// Screen Wake Lock (#12): only this tab keeps the screen on, and only while we want it. No permission prompt.
let lock = null, wanted = false;

export async function keepAwake(on) {
  wanted = on;
  try {
    if (on && !lock && document.visibilityState === 'visible' && navigator.wakeLock) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) {
      const l = lock; lock = null; await l.release();
    }
  } catch { lock = null; }
}
// The browser drops the lock when the tab is hidden; take it back when we return.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wanted) keepAwake(true); });
