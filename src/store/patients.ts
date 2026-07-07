// Offline patient records, persisted to localStorage. Kept deliberately simple:
// a single JSON blob under one key. Sufficient for a single-clinician device;
// can migrate to IndexedDB later without changing the UI contract.

import type { RefSet, Sex } from '../engine';

export interface Visit {
  id: string;
  date: string; // yyyy-mm-dd (measurement date)
  heightCm: number | null;
  weightKg: number | null;
}

export interface Patient {
  id: string;
  name: string;
  sex: Sex;
  dob: string; // yyyy-mm-dd — required for longitudinal age
  /** Gestational age at birth (weeks); enables corrected-age plotting for preterms. */
  gestWeeks?: number | null;
  /** Reference population this patient is charted against (standard / down / turner). */
  refSet?: RefSet;
  visits: Visit[];
}

const KEY = 'growthtrack.patients.v1';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Narrow unknown JSON to a Patient[], dropping anything malformed. */
function coercePatients(data: unknown): Patient[] {
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

export function loadPatients(): Patient[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return coercePatients(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Returns true on success, false if storage is full/disabled so callers can warn. */
export function savePatients(patients: Patient[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(patients));
    return true;
  } catch {
    return false;
  }
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
