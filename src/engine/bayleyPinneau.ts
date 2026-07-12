// Bayley-Pinneau adult-height prediction from current height + skeletal (bone) age.
//
// EXPERIMENTAL — the underlying tables are hand-transcribed from the 1952 paper
// (RCPCH growth-references, MIT) and are NOT validated. Predictions are for
// review only, not clinical decisions. See scripts/build-bayley-pinneau.mjs.
//
//   predicted adult height = current height / (% of mature height / 100)
//
// The percentage is a function of sex, skeletal-maturity category and skeletal
// age. Category is chosen the classic way: compare skeletal age (SA) to
// chronological age (CA) — within ±1 y = average, SA more than 1 y ahead =
// accelerated, more than 1 y behind = delayed.

import type { Sex } from './types';
import table from './data/bayleyPinneau.generated';

export type Maturity = 'average' | 'accelerated' | 'delayed';

/** [skeletalAgeYears, percentOfMatureHeight] pairs, ascending by age. */
export type PctSeries = [age: number, pct: number][];

export interface BayleyPinneauData {
  female: Record<Maturity, PctSeries>;
  male: Record<Maturity, PctSeries>;
  meta: {
    generated: string;
    source: string;
    method: string;
    note: string;
  };
}

export interface AdultHeightPrediction {
  predictedCm: number;
  /** % of mature height attained at this skeletal age (interpolated). */
  pct: number;
  maturity: Maturity;
  /** SA − CA in years (positive = skeletally advanced). */
  saMinusCaYears: number;
  skeletalAgeYears: number;
}

function classify(saYears: number, caYears: number): Maturity {
  const diff = saYears - caYears;
  if (diff > 1) return 'accelerated';
  if (diff < -1) return 'delayed';
  return 'average';
}

/** Linear interpolation of % within a category's series; null if SA is out of range. */
function pctAt(series: PctSeries, saYears: number): number | null {
  if (series.length === 0) return null;
  if (saYears < series[0][0] || saYears > series[series.length - 1][0]) return null;
  for (let i = 1; i < series.length; i++) {
    const [a, pa] = series[i - 1];
    const [b, pb] = series[i];
    if (saYears <= b) {
      const f = b === a ? 0 : (saYears - a) / (b - a);
      return pa + f * (pb - pa);
    }
  }
  return series[series.length - 1][1];
}

/**
 * Predict adult height. Returns null when inputs are non-positive or the
 * skeletal age falls outside the tabulated range for the chosen category.
 */
export function predictAdultHeight(
  sex: Sex,
  currentHeightCm: number,
  chronoAgeYears: number,
  skeletalAgeYears: number,
): AdultHeightPrediction | null {
  if (!(currentHeightCm > 0) || !(skeletalAgeYears > 0)) return null;
  const maturity = classify(skeletalAgeYears, chronoAgeYears);
  const series = table[sex][maturity];
  const pct = pctAt(series, skeletalAgeYears);
  if (pct == null || pct <= 0) return null;
  return {
    predictedCm: currentHeightCm / (pct / 100),
    pct,
    maturity,
    saMinusCaYears: skeletalAgeYears - chronoAgeYears,
    skeletalAgeYears,
  };
}

export const bayleyPinneauMeta = table.meta;
