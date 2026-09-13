import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { isAutoLockSuspended, lock, vaultExists } from '../store/vault';
import { onLockRequest } from './lockBus';
import LockScreen from './LockScreen';

type Phase = 'setup' | 'locked' | 'unlocked';

// How long the app may sit in the background before it re-locks. Short trips out
// of the app during OPD — opening an exported PDF, glancing at another app — return
// well within this window, so the doctor is not re-prompted for the PIN and any
// unsaved in-progress data survives (the app tree is never unmounted). Leaving the
// phone (screen locked, pocketed) keeps it hidden past the window, so it locks. A
// restart or app update kills the process, dropping the key, which locks anyway.
const AUTO_LOCK_GRACE_MS = 3 * 60_000;

/**
 * Gates the app behind the vault. Renders the setup or unlock screen until the
 * vault is open, then renders the app. Re-locks (and clears the in-memory key)
 * only after the app has stayed in the background beyond a short grace window,
 * or immediately on an explicit "Lock now" request.
 */
export default function LockGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(() => (vaultExists() ? 'locked' : 'setup'));

  useEffect(() => {
    if (phase !== 'unlocked') return;

    let graceTimer: number | undefined;
    const cancelGrace = () => {
      if (graceTimer !== undefined) {
        window.clearTimeout(graceTimer);
        graceTimer = undefined;
      }
    };

    const relock = () => {
      cancelGrace();
      lock();
      setPhase('locked');
    };

    // Backgrounded: don't lock outright. Arm a timer; if the app comes back before
    // it fires we cancel it (a brief switch), and only a sustained absence locks.
    // Skip entirely while a file/share dialog the app itself opened has auto-lock
    // suspended.
    const onHidden = () => {
      if (isAutoLockSuspended()) return;
      if (graceTimer !== undefined) return; // already armed
      graceTimer = window.setTimeout(relock, AUTO_LOCK_GRACE_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHidden();
      else cancelGrace();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHidden);
    window.addEventListener('focus', cancelGrace);
    const offLockRequest = onLockRequest(relock);
    return () => {
      cancelGrace();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHidden);
      window.removeEventListener('focus', cancelGrace);
      offLockRequest();
    };
  }, [phase]);

  if (phase === 'unlocked') return <>{children}</>;

  return (
    <LockScreen mode={phase === 'setup' ? 'setup' : 'unlock'} onUnlocked={() => setPhase('unlocked')} />
  );
}
