import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { isAutoLockSuspended, lock, vaultExists } from '../store/vault';
import { onLockRequest } from './lockBus';
import LockScreen from './LockScreen';

type Phase = 'setup' | 'locked' | 'unlocked';

/**
 * Gates the app behind the vault. Renders the setup or unlock screen until the
 * vault is open, then renders the app. Re-locks (and clears the in-memory key)
 * whenever the app leaves the foreground.
 */
export default function LockGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(() => (vaultExists() ? 'locked' : 'setup'));

  useEffect(() => {
    if (phase !== 'unlocked') return;

    const relock = () => {
      lock();
      setPhase('locked');
    };
    // Lock when the app is backgrounded — but not while it is briefly obscured by
    // a file/share dialog it opened itself for import/export.
    const onHidden = () => {
      if (isAutoLockSuspended()) return;
      relock();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHidden();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHidden);
    const offLockRequest = onLockRequest(relock);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHidden);
      offLockRequest();
    };
  }, [phase]);

  if (phase === 'unlocked') return <>{children}</>;

  return (
    <LockScreen mode={phase === 'setup' ? 'setup' : 'unlock'} onUnlocked={() => setPhase('unlocked')} />
  );
}
