import { useEffect } from 'react';
import './lock.css';
import { PAUSE_INDEFINITE } from './lockPolicy';

interface Props {
  appName: string;
  /** Called with the pause length in ms (PAUSE_INDEFINITE for open-ended). */
  onPause: (ms: number) => void;
  onCancel: () => void;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

const CHOICES: { label: string; ms: number; wide?: boolean }[] = [
  { label: '30 minutes', ms: 30 * MIN },
  { label: '1 hour', ms: HOUR },
  { label: '2 hours', ms: 2 * HOUR },
  { label: '3 hours', ms: 3 * HOUR },
  { label: '4 hours', ms: 4 * HOUR },
  { label: 'Until I turn it on', ms: PAUSE_INDEFINITE, wide: true },
];

/**
 * Choose how long to pause the PIN auto-lock. While paused the app stays unlocked
 * through screen-off and app-switches — handy during a clinic — so the dialog is
 * explicit that this lowers protection and that a restart still re-locks.
 */
export default function PauseLockDialog({ appName, onPause, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="lock-overlay" role="dialog" aria-modal="true">
      <div className="lock-card">
        <h1>Pause app lock</h1>
        <p className="lock-sub">
          {appName} will stay unlocked for the chosen time — even when the screen turns off or the
          phone is locked — so you are not asked for the PIN again and again during a clinic.
        </p>
        <div className="lock-duration-grid">
          {CHOICES.map((c) => (
            <button
              key={c.label}
              className={c.wide ? 'wide' : undefined}
              onClick={() => onPause(c.ms)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="lock-warn">
          While paused, anyone who can open this phone can see patient records. {appName} still
          re-locks if the phone is restarted or the app is updated. You can turn the PIN lock back on
          any time from Security settings.
        </p>
        <button className="lock-btn secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
