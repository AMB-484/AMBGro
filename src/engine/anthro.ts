// High-level assessment API: turn (sex, age, measurement) into z-score + centile,
// plus reference-curve generation for plotting.

import {
  centileFromZ,
  measurementFromZ,
  normalCdf,
  normalInv,
  zFromCentile,
  zFromMeasurement,
} from './lms';
import { extendedBmiParams, gridAges, lookupLMS, sourceForAge } from './references';
import type { Measure, Sex, Source } from './types';

export type Method = 'LMS' | 'extended-BMI';

export interface Assessment {
  measure: Measure;
  sex: Sex;
  ageMonths: number;
  value: number;
  source: Source;
  z: number;
  centile: number;
  method: Method;
  /** True when |z| > 3 on the LMS path — an extrapolation to flag for the clinician.
   *  Extended-BMI values are NOT flagged; they are valid severe-obesity estimates. */
  extreme: boolean;
}

// CDC caps the extended tail near the 99.99th percentile (z ~ 5).
const MAX_EXT_Z = 5;

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
  const source = sourceForAge(ageMonths);

  let z = zFromMeasurement(value, lms.L, lms.M, lms.S);
  let centile = centileFromZ(z);
  let method: Method = 'LMS';

  // CDC Extended BMI (2022): above the 95th percentile, use the half-normal tail
  // so severe obesity doesn't saturate near the 99th percentile.
  if (measure === 'bmi') {
    const ext = extendedBmiParams(sex, ageMonths);
    if (ext && value > ext.p95) {
      const pct = 90 + 10 * normalCdf((value - ext.p95) / ext.sigma);
      z = Math.min(normalInv(Math.min(pct, 99.999_97) / 100), MAX_EXT_Z);
      centile = centileFromZ(z);
      method = 'extended-BMI';
    }
  }

  return {
    measure,
    sex,
    ageMonths,
    value,
    source,
    z,
    centile,
    method,
    extreme: method === 'LMS' && Math.abs(z) > 3,
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
