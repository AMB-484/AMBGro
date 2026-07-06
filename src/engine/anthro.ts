// High-level assessment API: turn (sex, age, measurement) into z-score + centile,
// plus reference-curve generation for plotting.

import {
  centileFromZ,
  measurementFromZ,
  zFromCentile,
  zFromMeasurement,
} from './lms';
import { gridAges, lookupLMS, sourceForAge } from './references';
import type { Measure, Sex, Source } from './types';

export interface Assessment {
  measure: Measure;
  sex: Sex;
  ageMonths: number;
  value: number;
  source: Source;
  z: number;
  centile: number;
  /** True when |z| > 3 — the LMS tails are extrapolations; flag for the clinician. */
  extreme: boolean;
}

export function bmiFrom(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function assess(
  measure: Measure,
  sex: Sex,
  ageMonths: number,
  value: number,
): Assessment | null {
  const lms = lookupLMS(measure, sex, ageMonths);
  if (!lms || !(value > 0)) return null;
  const z = zFromMeasurement(value, lms.L, lms.M, lms.S);
  return {
    measure,
    sex,
    ageMonths,
    value,
    source: sourceForAge(ageMonths),
    z,
    centile: centileFromZ(z),
    extreme: Math.abs(z) > 3,
  };
}

export interface CurvePoint {
  age: number;
  value: number;
}

export interface ReferenceCurve {
  centile: number;
  z: number;
  label: string;
  points: CurvePoint[];
}

/** Default clinical centile set shown on the charts. */
export const DEFAULT_CENTILES = [3, 10, 25, 50, 75, 90, 97];

/**
 * Build reference centile curves for a measure/sex across an age window.
 * Each curve follows the native grid resolution of the underlying dataset.
 */
export function referenceCurves(
  measure: Measure,
  sex: Sex,
  minAgeMonths: number,
  maxAgeMonths: number,
  centiles: number[] = DEFAULT_CENTILES,
): ReferenceCurve[] {
  const ages = gridAges(measure, sex, minAgeMonths, maxAgeMonths);
  return centiles.map((centile) => {
    const z = zFromCentile(centile);
    const points: CurvePoint[] = [];
    for (const age of ages) {
      const lms = lookupLMS(measure, sex, age);
      if (lms) points.push({ age, value: measurementFromZ(z, lms.L, lms.M, lms.S) });
    }
    return { centile, z, label: ordinal(centile), points };
  });
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
