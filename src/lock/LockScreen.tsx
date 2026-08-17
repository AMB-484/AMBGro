import { useEffect, useState } from 'react';
import {
  biometricEnabled,
  biometricSupported,
  changePin,
  createVault,
  regenerateRecoveryCode,
  unlockWithBiometric,
  unlockWithPin,
  unlockWithRecovery,
} from '../store/vault';
import type { UnlockError } from '../store/vault';
import './lock.css';

const MIN_PIN = 6;

type View =
  | { k: 'setup-pin' }
  | { k: 'setup-recovery'; code: string; migrated: number }
  | { k: 'unlock' }
  | { k: 'recovery-code' }
  | { k: 'recovery-newpin' }
  | { k: 'recovery-show'; code: string };

function isUnlockError(e: unknown): e is UnlockError {
  return e instanceof Error && 'reason' in e;
}

function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.ceil(s / 60);
  return `${m} minute${m === 1 ? '' : 's'}`;
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard blocked (insecure context) — user can select manually
  }
}

interface Props {
  mode: 'setup' | 'unlock';
  onUnlocked: () => void;
}

export default function LockScreen({ mode, onUnlocked }: Props) {
  const [view, setView] = useState<View>(mode === 'setup' ? { k: 'setup-pin' } : { k: 'unlock' });
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bioReady, setBioReady] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const ok = (await biometricSupported()) && biometricEnabled();
      if (live) setBioReady(ok);
    })();
    return () => {
      live = false;
    };
  }, []);

  const reset = () => {
    setPin('');
    setPin2('');
    setCode('');
    setError(null);
  };

  // ---- setup: choose PIN ----
  const onCreate = async () => {
    if (pin.length < MIN_PIN) return setError(`Use at least ${MIN_PIN} characters.`);
    if (pin !== pin2) return setError('The two entries do not match.');
    setBusy(true);
    setError(null);
    try {
      const { recoveryCode, migrated } = await createVault(pin);
      reset();
      setView({ k: 'setup-recovery', code: recoveryCode, migrated });
    } catch {
      setError('Could not set up encryption on this device.');
    } finally {
      setBusy(false);
    }
  };

  // ---- unlock: PIN ----
  const onUnlockPin = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlockWithPin(pin);
      onUnlocked();
    } catch (e) {
      if (isUnlockError(e) && e.reason === 'locked-out') {
        setError(`Too many attempts. Try again in ${formatWait(e.retryAfterMs ?? 0)}.`);
      } else if (isUnlockError(e) && e.reason === 'bad-pin') {
        const left = e.attemptsLeft;
        setError(
          e.retryAfterMs
            ? `Incorrect. Locked for ${formatWait(e.retryAfterMs)}.`
            : `Incorrect PIN.${left != null ? ` ${left} attempt${left === 1 ? '' : 's'} left.` : ''}`,
        );
      } else {
        setError('Could not unlock.');
      }
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const onUnlockBio = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlockWithBiometric();
      onUnlocked();
    } catch {
      setError('Biometric unlock was cancelled or failed. Enter your PIN.');
    } finally {
      setBusy(false);
    }
  };

  // ---- recovery: enter code ----
  const onRecover = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlockWithRecovery(code);
      reset();
      setView({ k: 'recovery-newpin' });
    } catch {
      setError('That recovery code was not recognised.');
    } finally {
      setBusy(false);
    }
  };

  // ---- recovery: set a new PIN, mint a fresh code ----
  const onResetPin = async () => {
    if (pin.length < MIN_PIN) return setError(`Use at least ${MIN_PIN} characters.`);
    if (pin !== pin2) return setError('The two entries do not match.');
    setBusy(true);
    setError(null);
    try {
      await changePin(pin);
      const fresh = await regenerateRecoveryCode();
      reset();
      setView({ k: 'recovery-show', code: fresh });
    } catch {
      setError('Could not set the new PIN.');
    } finally {
      setBusy(false);
    }
  };

  // ---------------- render ----------------
  return (
    <div className="lock-overlay">
      <div className="lock-card">
        <div className="lock-brand">
          <span className="lock-glyph" aria-hidden="true">
            🔒
          </span>
          AMBGro
        </div>

        {error && (
          <p className="lock-error" role="alert">
            {error}
          </p>
        )}

        {view.k === 'setup-pin' && (
          <>
            <h1>Secure this device</h1>
            <p className="lock-sub">
              Patient records are encrypted on this device. Set a PIN (or a longer passphrase) to
              lock and unlock the app. It is never stored — only you know it.
            </p>
            <label className="lock-field">
              <span>PIN or passphrase (min {MIN_PIN})</span>
              <input
                type="password"
                inputMode="text"
                autoComplete="new-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </label>
            <label className="lock-field">
              <span>Confirm</span>
              <input
                type="password"
                autoComplete="new-password"
                value={pin2}
                onChange={(e) => setPin2(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void onCreate()}
              />
            </label>
            <button className="lock-btn" disabled={busy} onClick={() => void onCreate()}>
              {busy ? 'Encrypting…' : 'Set PIN & encrypt'}
            </button>
          </>
        )}

        {view.k === 'setup-recovery' && (
          <>
            <h1>Save your recovery code</h1>
            <p className="lock-sub">
              {view.migrated > 0
                ? `${view.migrated} existing record(s) were encrypted. `
                : ''}
              This code is the only way back in if you forget your PIN. Store it somewhere safe and
              separate from this device.
            </p>
            <div className="lock-recovery-code">{view.code}</div>
            <p className="lock-warn">
              We cannot recover your data without this code or your PIN. There is no reset.
            </p>
            <button className="lock-btn secondary" onClick={() => void copy(view.code)}>
              Copy code
            </button>
            <button className="lock-btn" onClick={onUnlocked} style={{ marginTop: 10 }}>
              I’ve saved it — continue
            </button>
          </>
        )}

        {view.k === 'unlock' && (
          <>
            <h1>Enter your PIN</h1>
            <p className="lock-sub">Unlock to view patient records.</p>
            <label className="lock-field">
              <span>PIN or passphrase</span>
              <input
                type="password"
                autoComplete="current-password"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void onUnlockPin()}
              />
            </label>
            <button
              className="lock-btn"
              disabled={busy || pin.length === 0}
              onClick={() => void onUnlockPin()}
            >
              {busy ? 'Unlocking…' : 'Unlock'}
            </button>
            {bioReady && (
              <button className="lock-btn secondary" disabled={busy} onClick={() => void onUnlockBio()}>
                Use biometric
              </button>
            )}
            <button
              className="lock-link"
              onClick={() => {
                reset();
                setView({ k: 'recovery-code' });
              }}
            >
              Forgot PIN? Use recovery code
            </button>
          </>
        )}

        {view.k === 'recovery-code' && (
          <>
            <h1>Recovery code</h1>
            <p className="lock-sub">Enter the recovery code you saved when you set up the app.</p>
            <label className="lock-field">
              <span>Recovery code</span>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void onRecover()}
              />
            </label>
            <button
              className="lock-btn"
              disabled={busy || code.trim().length === 0}
              onClick={() => void onRecover()}
            >
              {busy ? 'Checking…' : 'Recover'}
            </button>
            <button
              className="lock-link"
              onClick={() => {
                reset();
                setView({ k: 'unlock' });
              }}
            >
              Back to PIN
            </button>
          </>
        )}

        {view.k === 'recovery-newpin' && (
          <>
            <h1>Set a new PIN</h1>
            <p className="lock-sub">Your records are unlocked. Choose a new PIN to continue.</p>
            <label className="lock-field">
              <span>New PIN or passphrase (min {MIN_PIN})</span>
              <input
                type="password"
                autoComplete="new-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </label>
            <label className="lock-field">
              <span>Confirm</span>
              <input
                type="password"
                autoComplete="new-password"
                value={pin2}
                onChange={(e) => setPin2(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void onResetPin()}
              />
            </label>
            <button className="lock-btn" disabled={busy} onClick={() => void onResetPin()}>
              {busy ? 'Saving…' : 'Set new PIN'}
            </button>
          </>
        )}

        {view.k === 'recovery-show' && (
          <>
            <h1>New recovery code</h1>
            <p className="lock-sub">
              Your PIN was reset. Here is a fresh recovery code — the old one no longer works.
            </p>
            <div className="lock-recovery-code">{view.code}</div>
            <p className="lock-warn">Store it somewhere safe. There is no other way to reset.</p>
            <button className="lock-btn secondary" onClick={() => void copy(view.code)}>
              Copy code
            </button>
            <button className="lock-btn" onClick={onUnlocked} style={{ marginTop: 10 }}>
              I’ve saved it — continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}
