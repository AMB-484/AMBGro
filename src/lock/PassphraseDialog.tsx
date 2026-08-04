import { useState } from 'react';
import './lock.css';

interface Props {
  title: string;
  sub: string;
  confirmLabel: string;
  /** Require a second matching entry (used when creating a backup). */
  confirm?: boolean;
  onSubmit: (passphrase: string) => void;
  onCancel: () => void;
}

/** Minimal modal to collect a backup passphrase (works in the Android WebView,
 *  which does not reliably support window.prompt). */
export default function PassphraseDialog({
  title,
  sub,
  confirmLabel,
  confirm,
  onSubmit,
  onCancel,
}: Props) {
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (pass.length < 6) return setError('Use at least 6 characters.');
    if (confirm && pass !== pass2) return setError('The two entries do not match.');
    onSubmit(pass);
  };

  return (
    <div className="lock-overlay" role="dialog" aria-modal="true">
      <div className="lock-card">
        <h1>{title}</h1>
        <p className="lock-sub">{sub}</p>
        {error && (
          <p className="lock-error" role="alert">
            {error}
          </p>
        )}
        <label className="lock-field">
          <span>Passphrase</span>
          <input
            type="password"
            autoComplete="off"
            autoFocus
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !confirm && submit()}
          />
        </label>
        {confirm && (
          <label className="lock-field">
            <span>Confirm passphrase</span>
            <input
              type="password"
              autoComplete="off"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
        )}
        <button className="lock-btn" onClick={submit}>
          {confirmLabel}
        </button>
        <button className="lock-btn secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
