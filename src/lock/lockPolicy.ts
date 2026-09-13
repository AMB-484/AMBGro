// Whether the app's PIN auto-lock is currently active. Normally it is: the app
// re-locks when it has been backgrounded past the grace window (see LockGate).
//
// From Security settings the doctor can *pause* the lock for a chosen window —
// 30 min … 4 h, or "until I turn it on" — so the app stays unlocked through
// screen-off and app-switches during a busy clinic. When the window elapses,
// auto-lock resumes on its own.
//
// This state is in-memory only, on purpose: the decryption key lives only in
// memory, so a real process restart (reboot / app update / the OS reclaiming the
// app) always drops it and returns the app to the PIN screen — a pause can never
// keep patient data readable across a restart, and we never persist a "don't ask
// for the PIN" flag to storage.

const CHANGE_EVENT = 'ambgro:lockpolicy';

/** Infinity sentinel for a pause with no end ("until I turn it on"). */
export const PAUSE_INDEFINITE = Infinity;

// null = auto-lock active. Otherwise the epoch-ms the pause ends, or
// PAUSE_INDEFINITE for an open-ended pause.
let pausedUntil: number | null = null;
let expiryTimer: number | undefined;

function emit(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Subscribe to pause/resume/expiry changes. Returns an unsubscribe function. */
export function onLockPolicyChange(handler: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

function clearExpiryTimer(): void {
  if (expiryTimer !== undefined) {
    window.clearTimeout(expiryTimer);
    expiryTimer = undefined;
  }
}

/** True while the PIN auto-lock is paused (and the window has not elapsed). */
export function isAppLockPaused(): boolean {
  if (pausedUntil === null) return false;
  if (pausedUntil !== PAUSE_INDEFINITE && Date.now() >= pausedUntil) {
    // Lazily settle an elapsed window even if the timer has not fired yet.
    clearExpiryTimer();
    pausedUntil = null;
    return false;
  }
  return true;
}

/** Epoch-ms the pause ends, PAUSE_INDEFINITE for open-ended, or null when active. */
export function appLockPausedUntil(): number | null {
  return isAppLockPaused() ? pausedUntil : null;
}

/**
 * Pause the PIN auto-lock for `ms` milliseconds, or pass PAUSE_INDEFINITE for
 * "until I turn it on". While paused the app will not auto-lock on background or
 * screen-off. When the window elapses the change is announced so LockGate can
 * re-lock if the app is not in the foreground at that moment.
 */
export function pauseAppLock(ms: number): void {
  clearExpiryTimer();
  pausedUntil = ms === PAUSE_INDEFINITE ? PAUSE_INDEFINITE : Date.now() + ms;
  if (pausedUntil !== PAUSE_INDEFINITE) {
    expiryTimer = window.setTimeout(() => {
      expiryTimer = undefined;
      pausedUntil = null;
      emit();
    }, ms);
  }
  emit();
}

/** Resume normal PIN auto-lock now — the "Turn on PIN lock" action. */
export function resumeAppLock(): void {
  clearExpiryTimer();
  const was = pausedUntil !== null;
  pausedUntil = null;
  if (was) emit();
}
