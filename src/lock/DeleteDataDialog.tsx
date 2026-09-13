import { useState } from 'react';
import './lock.css';

interface Props {
  /** Number of patient records that will be destroyed (for the warning copy). */
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const PHRASE = 'DELETE';

/**
 * Confirmation for the irreversible "delete all data" action. Requires the user
 * to type DELETE so a stray tap can never wipe the vault, and reminds them to
 * back up first.
 */
export default function DeleteDataDialog({ count, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState('');
  const armed = typed.trim().toUpperCase() === PHRASE;

  return (
    <div className="lock-overlay" role="dialog" aria-modal="true">
      <div className="lock-card">
        <h1>Delete all data?</h1>
        <p className="lock-sub">
          This permanently removes{' '}
          {count === 0 ? 'all saved data' : `all ${count} patient record(s)`} and your PIN from{' '}
          <strong>this device</strong>. It cannot be undone — there is no cloud copy.
        </p>
        <p className="lock-warn">
          If you might need this data again, tap Cancel and use “Export encrypted backup” first.
        </p>
        <label className="lock-field">
          <span>Type DELETE to confirm</span>
          <input
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && armed && onConfirm()}
          />
        </label>
        <button className="lock-btn danger" disabled={!armed} onClick={onConfirm}>
          Delete everything
        </button>
        <button className="lock-btn secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
