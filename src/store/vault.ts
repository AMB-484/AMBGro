// The encrypted vault: owns at-rest encryption of the patient database and the
// in-memory session (the decrypted DEK + a plaintext snapshot for the UI).
//
// Storage layout (localStorage key `ambgro.vault.v1`) holds only ciphertext and
// public KDF parameters — never a secret. One random DEK encrypts the patient
// JSON; that DEK is wrapped independently under the PIN and under a recovery
// code, so either can unlock it. Biometric adds a third path via the Keystore.
//
// The UI keeps its synchronous contract: LockGate unlocks first, populating the
// snapshot, after which loadPatients() can read it synchronously. Writes go back
// through persist() which re-encrypts.

import {
  decryptJson,
  deriveKey,
  encryptJson,
  exportDekRaw,
  fromB64,
  generateDek,
  generateRecoveryCode,
  importDek,
  newKdfParams,
  normalizeRecoveryCode,
  toB64,
  unwrapKey,
  wrapKey,
  type CipherBlob,
  type KdfParams,
} from './crypto';
import { biometricAvailable, clearSecret, fetchSecret, storeSecret } from './biometric';
import { coercePatients } from './patients';
import type { Patient } from './patients';

const VAULT_KEY = 'ambgro.vault.v1';
const LEGACY_KEY = 'growthtrack.patients.v1';

/** A DEK wrapped under one derived secret (PIN or recovery code). */
interface WrapSlot {
  kdf: KdfParams;
  blob: CipherBlob;
}

interface VaultFile {
  v: 1;
  pin: WrapSlot;
  recovery: WrapSlot;
  data: CipherBlob;
  attempts: { count: number; lockedUntil: number };
  bio: boolean;
}

// ---- brute-force throttle ----
const MAX_ATTEMPTS = 10;

function backoffMs(count: number): number {
  if (count < 5) return 0; // first 5 tries are free
  return Math.min(30_000 * 2 ** (count - 5), 15 * 60_000); // 30s → cap 15m
}

// ---- in-memory session state (cleared on lock / background) ----
let dek: CryptoKey | null = null;
let snapshot: Patient[] = [];

export function isUnlocked(): boolean {
  return dek !== null;
}

/** The decrypted patient list for the current session (empty when locked). */
export function getSnapshot(): Patient[] {
  return snapshot;
}

// ---- raw storage ----
function readVault(): VaultFile | null {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VaultFile;
  } catch {
    return null;
  }
}

function writeVault(v: VaultFile): void {
  localStorage.setItem(VAULT_KEY, JSON.stringify(v));
}

export function vaultExists(): boolean {
  return localStorage.getItem(VAULT_KEY) !== null;
}

export function hasLegacyPlaintext(): boolean {
  return localStorage.getItem(LEGACY_KEY) !== null;
}

// ---- typed unlock errors ----
export type UnlockReason =
  | 'no-vault'
  | 'bad-pin'
  | 'bad-recovery'
  | 'locked-out'
  | 'no-biometric';

export interface UnlockError extends Error {
  reason: UnlockReason;
  retryAfterMs?: number;
  attemptsLeft?: number;
}

function unlockError(reason: UnlockReason, extra?: Partial<UnlockError>): UnlockError {
  const e = new Error(reason) as UnlockError;
  e.reason = reason;
  Object.assign(e, extra);
  return e;
}

// ---- creation / first-run migration ----
export interface CreateResult {
  recoveryCode: string;
  migrated: number;
}

/**
 * Create the vault, migrating any existing plaintext records. Non-destructive:
 * the vault is written and verified (decrypts cleanly) *before* the legacy
 * plaintext key is deleted, so a crash mid-migration never loses data.
 */
export async function createVault(pin: string): Promise<CreateResult> {
  const legacyRaw = localStorage.getItem(LEGACY_KEY);
  let initial: Patient[] = [];
  if (legacyRaw) {
    try {
      initial = coercePatients(JSON.parse(legacyRaw));
    } catch {
      initial = [];
    }
  }

  const newDek = await generateDek();
  const pinKdf = newKdfParams();
  const recKdf = newKdfParams();
  const recoveryCode = generateRecoveryCode();

  const pinKek = await deriveKey(pin, pinKdf);
  const recKek = await deriveKey(normalizeRecoveryCode(recoveryCode), recKdf);

  const vault: VaultFile = {
    v: 1,
    pin: { kdf: pinKdf, blob: await wrapKey(pinKek, newDek) },
    recovery: { kdf: recKdf, blob: await wrapKey(recKek, newDek) },
    data: await encryptJson(newDek, initial),
    attempts: { count: 0, lockedUntil: 0 },
    bio: false,
  };

  // Write, then read back and fully decrypt to prove the vault is sound.
  writeVault(vault);
  const check = readVault();
  if (!check) throw new Error('Could not write the encrypted vault to this device.');
  const verifyDek = await unwrapKey(pinKek, check.pin.blob);
  await decryptJson<Patient[]>(verifyDek, check.data);

  // Committed: activate the session and drop the plaintext copy.
  dek = newDek;
  snapshot = initial;
  if (legacyRaw) localStorage.removeItem(LEGACY_KEY);

  return { recoveryCode, migrated: initial.length };
}

// ---- unlock paths ----
export async function unlockWithPin(pin: string): Promise<void> {
  const v = readVault();
  if (!v) throw unlockError('no-vault');

  const now = Date.now();
  if (v.attempts.lockedUntil > now) {
    throw unlockError('locked-out', { retryAfterMs: v.attempts.lockedUntil - now });
  }

  let unlockedDek: CryptoKey;
  let patients: Patient[];
  try {
    const kek = await deriveKey(pin, v.pin.kdf);
    unlockedDek = await unwrapKey(kek, v.pin.blob); // throws on wrong PIN
    patients = await decryptJson<Patient[]>(unlockedDek, v.data);
  } catch {
    const count = v.attempts.count + 1;
    const wait = backoffMs(count);
    v.attempts = { count, lockedUntil: wait > 0 ? now + wait : 0 };
    writeVault(v);
    throw unlockError('bad-pin', {
      retryAfterMs: wait > 0 ? wait : undefined,
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - count),
    });
  }

  dek = unlockedDek;
  snapshot = coercePatients(patients);
  if (v.attempts.count !== 0 || v.attempts.lockedUntil !== 0) {
    v.attempts = { count: 0, lockedUntil: 0 };
    writeVault(v);
  }
}

export async function unlockWithRecovery(code: string): Promise<void> {
  const v = readVault();
  if (!v) throw unlockError('no-vault');

  let unlockedDek: CryptoKey;
  let patients: Patient[];
  try {
    const kek = await deriveKey(normalizeRecoveryCode(code), v.recovery.kdf);
    unlockedDek = await unwrapKey(kek, v.recovery.blob);
    patients = await decryptJson<Patient[]>(unlockedDek, v.data);
  } catch {
    throw unlockError('bad-recovery');
  }

  dek = unlockedDek;
  snapshot = coercePatients(patients);
  // A successful recovery clears any PIN lockout.
  v.attempts = { count: 0, lockedUntil: 0 };
  writeVault(v);
}

export async function unlockWithBiometric(): Promise<void> {
  const v = readVault();
  if (!v || !v.bio) throw unlockError('no-biometric');
  const b64 = await fetchSecret(); // prompts; throws on cancel/failure
  const unlockedDek = await importDek(fromB64(b64));
  const patients = await decryptJson<Patient[]>(unlockedDek, v.data);
  dek = unlockedDek;
  snapshot = coercePatients(patients);
}

// ---- session lifecycle ----
/** Drop the in-memory key and plaintext snapshot. Called on lock / background. */
export function lock(): void {
  dek = null;
  snapshot = [];
}

/** Encrypt and persist the patient list. Returns false if locked or storage fails. */
export async function persist(patients: Patient[]): Promise<boolean> {
  if (!dek) return false;
  const v = readVault();
  if (!v) return false;
  try {
    v.data = await encryptJson(dek, patients);
    writeVault(v);
    snapshot = patients;
    return true;
  } catch {
    return false;
  }
}

// ---- credential management (require an unlocked session) ----
export async function changePin(newPin: string): Promise<void> {
  if (!dek) throw new Error('Unlock before changing the PIN.');
  const v = readVault();
  if (!v) throw new Error('No vault to update.');
  const kdf = newKdfParams();
  const kek = await deriveKey(newPin, kdf);
  v.pin = { kdf, blob: await wrapKey(kek, dek) };
  v.attempts = { count: 0, lockedUntil: 0 };
  writeVault(v);
}

/** Mint a fresh recovery code (invalidates the previous one). */
export async function regenerateRecoveryCode(): Promise<string> {
  if (!dek) throw new Error('Unlock before regenerating the recovery code.');
  const v = readVault();
  if (!v) throw new Error('No vault to update.');
  const code = generateRecoveryCode();
  const kdf = newKdfParams();
  const kek = await deriveKey(normalizeRecoveryCode(code), kdf);
  v.recovery = { kdf, blob: await wrapKey(kek, dek) };
  writeVault(v);
  return code;
}

// ---- biometric enrolment ----
export function biometricSupported(): Promise<boolean> {
  return biometricAvailable();
}

export function biometricEnabled(): boolean {
  return !!readVault()?.bio;
}

export async function enableBiometric(): Promise<void> {
  if (!dek) throw new Error('Unlock before enabling biometric unlock.');
  await storeSecret(toB64(await exportDekRaw(dek)));
  const v = readVault();
  if (v) {
    v.bio = true;
    writeVault(v);
  }
}

export async function disableBiometric(): Promise<void> {
  await clearSecret();
  const v = readVault();
  if (v) {
    v.bio = false;
    writeVault(v);
  }
}

// ---- auto-lock suspension ----
// The lock-on-background listener must not fire when the app itself opens a
// system UI that briefly backgrounds it (a file picker / share sheet for
// import/export). Callers bracket those flows with suspend/resume.
let autoLockSuspended = false;

export function suspendAutoLock(): void {
  autoLockSuspended = true;
}

export function resumeAutoLock(): void {
  autoLockSuspended = false;
}

export function isAutoLockSuspended(): boolean {
  return autoLockSuspended;
}
