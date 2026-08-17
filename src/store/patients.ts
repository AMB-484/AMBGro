// Offline patient records. At rest they are AES-GCM encrypted inside the vault
// (see ./vault) — this module no longer touches localStorage directly. It keeps
// its original synchronous read contract by serving the vault's already-decrypted
// session snapshot; writes go back through the vault to be re-encrypted.

import type { PubertyAssessment, RefSet, Sex } from '../engine';
import { getSnapshot, persist } from './vault';
import {
  decryptJson,
  deriveKey,
  encryptJson,
  newKdfParams,
  type CipherBlob,
  type KdfParams,
} from './crypto';

export interface Visit {
  id: string;
  date: string; // yyyy-mm-dd (measurement date)
  heightCm: number | null;
  weightKg: number | null;
  /** Optional pubertal assessment captured at the same visit. */
  puberty?: PubertyAssessment;
}

export interface Patient {
  id: string;
  name: string;
  /** Optional father's / guardian name — administrative, shown on the report header. */
  guardianName?: string;
  /** Optional record number (MRN) — administrative, shown on the report header. */
  mrn?: string;
  sex: Sex;
  dob: string; // yyyy-mm-dd — required for longitudinal age
  /** Gestational age at birth (weeks); enables corrected-age plotting for preterms. */
  gestWeeks?: number | null;
  /**
   * Parent heights (cm) for the mid-parental (target) height. Persisted on the
   * patient — not the visit — since they don't change between visits; kept editable
   * so an entry error can be corrected at a follow-up. Drives the target band on
   * every chart without re-entry.
   */
  fatherHeightCm?: number | null;
  motherHeightCm?: number | null;
  /** Reference population this patient is charted against (standard / down / turner). */
  refSet?: RefSet;
  visits: Visit[];
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Narrow unknown JSON to a Patient[], dropping anything malformed. */
export function coercePatients(data: unknown): Patient[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (p): p is Patient =>
      !!p &&
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      (p.sex === 'male' || p.sex === 'female') &&
      typeof p.dob === 'string' &&
      Array.isArray(p.visits),
  );
}

/** The current session's decrypted records. Requires an unlocked vault (the
 *  LockGate guarantees this before <App> mounts), so it stays synchronous. */
export function loadPatients(): Patient[] {
  return getSnapshot();
}

/** Encrypt and persist. Async now (Web Crypto); false if locked or storage fails. */
export function savePatients(patients: Patient[]): Promise<boolean> {
  return persist(patients);
}

export function sortedVisits(p: Patient): Visit[] {
  return [...p.visits].sort((a, b) => a.date.localeCompare(b.date));
}

// ---- backup / restore (full patient database as JSON) ----

interface Backup {
  app: string;
  version: number;
  exported: string;
  patients: Patient[];
}

export function exportPatientsJson(patients: Patient[]): string {
  const backup: Backup = {
    app: 'AMBGro',
    version: 1,
    exported: new Date().toISOString(),
    patients,
  };
  return JSON.stringify(backup, null, 2);
}

/** Parse a backup file (either a bare Patient[] or a { patients } wrapper). Throws on garbage. */
export function parsePatientsJson(text: string): Patient[] {
  const data = JSON.parse(text) as unknown;
  const arr = Array.isArray(data)
    ? data
    : (data as { patients?: unknown } | null)?.patients;
  const patients = coercePatients(arr);
  if (patients.length === 0 && !(Array.isArray(arr) && arr.length === 0)) {
    throw new Error('No valid AMBGro patient records found in this file.');
  }
  return patients;
}

// ---- encrypted backup (passphrase-protected) ----

const ENC_FORMAT = 'ambgro-enc';

interface EncryptedBackup extends CipherBlob {
  app: 'AMBGro';
  format: typeof ENC_FORMAT;
  v: 1;
  kdf: KdfParams;
}

/** True if a backup file is a passphrase-encrypted AMBGro export. */
export function isEncryptedBackup(text: string): boolean {
  try {
    return (JSON.parse(text) as { format?: unknown })?.format === ENC_FORMAT;
  } catch {
    return false;
  }
}

/** Produce a passphrase-encrypted backup — no readable PHI leaves the device. */
export async function exportPatientsEncrypted(
  patients: Patient[],
  passphrase: string,
): Promise<string> {
  const kdf = newKdfParams();
  const key = await deriveKey(passphrase, kdf);
  const blob = await encryptJson(key, {
    app: 'AMBGro',
    version: 1,
    exported: new Date().toISOString(),
    patients,
  } satisfies Backup);
  const out: EncryptedBackup = { app: 'AMBGro', format: ENC_FORMAT, v: 1, kdf, ...blob };
  return JSON.stringify(out, null, 2);
}

/** Decrypt a passphrase-encrypted backup. Throws on a wrong passphrase or garbage. */
export async function parsePatientsEncrypted(text: string, passphrase: string): Promise<Patient[]> {
  const file = JSON.parse(text) as EncryptedBackup;
  if (file.format !== ENC_FORMAT || !file.kdf || !file.iv || !file.ct) {
    throw new Error('This is not an AMBGro encrypted backup.');
  }
  const key = await deriveKey(passphrase, file.kdf);
  let payload: unknown;
  try {
    payload = await decryptJson<unknown>(key, { iv: file.iv, ct: file.ct });
  } catch {
    throw new Error('Wrong passphrase, or the backup file is corrupt.');
  }
  const arr = Array.isArray(payload)
    ? payload
    : (payload as { patients?: unknown } | null)?.patients;
  const patients = coercePatients(arr);
  if (patients.length === 0 && !(Array.isArray(arr) && arr.length === 0)) {
    throw new Error('No valid AMBGro patient records found in this backup.');
  }
  return patients;
}

/** Merge imported patients into existing ones by id (imported wins on conflict). */
export function mergePatients(existing: Patient[], incoming: Patient[]): Patient[] {
  const merged = [...existing];
  for (const inc of incoming) {
    const i = merged.findIndex((p) => p.id === inc.id);
    if (i >= 0) merged[i] = inc;
    else merged.push(inc);
  }
  return merged;
}
