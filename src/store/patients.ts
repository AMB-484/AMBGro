// Offline patient records, persisted to localStorage. Kept deliberately simple:
// a single JSON blob under one key. Sufficient for a single-clinician device;
// can migrate to IndexedDB later without changing the UI contract.

import type { Sex } from '../engine';

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
  visits: Visit[];
}

const KEY = 'growthtrack.patients.v1';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function loadPatients(): Patient[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as Patient[]) : [];
  } catch {
    return [];
  }
}

export function savePatients(patients: Patient[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(patients));
  } catch {
    // storage full / disabled — surfaced by callers noticing state didn't persist
  }
}

export function sortedVisits(p: Patient): Visit[] {
  return [...p.visits].sort((a, b) => a.date.localeCompare(b.date));
}
