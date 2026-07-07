// Plain-language clinical interpretation of a centile/z result. Uses standard
// clinical conventions on already-computed values — no extra reference data.
// Only meaningful for the standard WHO/CDC population; population-specific charts
// (Down, Turner) have their own norms, so we return null for those.

import { BOUNDARY_MONTHS } from './references';
import type { Measure, RefSet } from './types';

export type Tone = 'low' | 'high' | 'normal';

export interface Interpretation {
  label: string;
  tone: Tone;
}

/**
 * Interpret a single measure's centile.
 *   height: <3rd = short stature, >97th = tall stature
 *   BMI (>=2y): CDC categories — <5th underweight, 85–<95 overweight, >=95 obese
 *   weight: <3rd low, >97th high (informational)
 * Returns null when the result is unremarkable or interpretation doesn't apply.
 */
export function interpret(
  measure: Measure,
  ageMonths: number,
  centile: number,
  refSet: RefSet = 'standard',
): Interpretation | null {
  if (refSet !== 'standard' || !Number.isFinite(centile)) return null;

  if (measure === 'height') {
    if (centile < 3) return { label: 'Short stature (<3rd centile)', tone: 'low' };
    if (centile > 97) return { label: 'Tall stature (>97th centile)', tone: 'high' };
    return null;
  }

  if (measure === 'bmi') {
    // CDC weight-status categories are defined for children/teens (>=2 y).
    if (ageMonths < BOUNDARY_MONTHS) return null;
    if (centile < 5) return { label: 'Underweight (<5th centile)', tone: 'low' };
    if (centile >= 95) return { label: 'Obese (≥95th centile)', tone: 'high' };
    if (centile >= 85) return { label: 'Overweight (85–95th centile)', tone: 'high' };
    return null;
  }

  if (measure === 'weight') {
    if (centile < 3) return { label: 'Low weight-for-age (<3rd centile)', tone: 'low' };
    if (centile > 97) return { label: 'High weight-for-age (>97th centile)', tone: 'high' };
    return null;
  }

  return null;
}
