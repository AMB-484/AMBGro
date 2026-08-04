// A tiny event bus so app code (e.g. a "Lock now" button) can ask the LockGate
// to re-lock, without prop-threading through the whole component tree.

const LOCK_EVENT = 'ambgro:lock';

/** Lock the app now: clears the in-memory key and shows the lock screen. */
export function requestLock(): void {
  window.dispatchEvent(new Event(LOCK_EVENT));
}

/** Subscribe the gate to lock requests. Returns an unsubscribe function. */
export function onLockRequest(handler: () => void): () => void {
  window.addEventListener(LOCK_EVENT, handler);
  return () => window.removeEventListener(LOCK_EVENT, handler);
}
