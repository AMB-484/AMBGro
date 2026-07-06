// Endocrine helpers: mid-parental (target) height and height velocity.

import type { Sex } from './types';

export interface TargetHeight {
  mph: number; // mid-parental height, cm
  low: number; // target range lower bound
  high: number; // target range upper bound
}

/**
 * Tanner mid-parental (target) height.
 *   boys:  (father + mother) / 2 + 6.5 cm   [= (father + mother + 13) / 2]
 *   girls: (father + mother) / 2 - 6.5 cm
 * Target range is mph ± `range` cm (default ±10 cm).
 */
export function midParentalHeight(
  sex: Sex,
  fatherCm: number,
  motherCm: number,
  range = 10,
): TargetHeight {
  const mid = (fatherCm + motherCm) / 2 + (sex === 'male' ? 6.5 : -6.5);
  return { mph: mid, low: mid - range, high: mid + range };
}

export interface Velocity {
  cmPerYear: number;
  intervalMonths: number;
  fromAgeMonths: number;
  toAgeMonths: number;
}

/** Annualised height velocity between two measurements at two ages (months). */
export function heightVelocity(
  h1: number,
  ageMonths1: number,
  h2: number,
  ageMonths2: number,
): Velocity | null {
  const intervalMonths = ageMonths2 - ageMonths1;
  if (intervalMonths <= 0) return null;
  return {
    cmPerYear: (h2 - h1) / (intervalMonths / 12),
    intervalMonths,
    fromAgeMonths: ageMonths1,
    toAgeMonths: ageMonths2,
  };
}
