// Reference-data lookup: picks the right dataset (WHO 0-<24mo, CDC >=24mo) for a
// given age and linearly interpolates the LMS parameters between grid points.

import references from './data/references.generated';
import type { Lms, LmsPoint, Measure, MeasureRefs, RefSet, Sex, Source } from './types';

export const BOUNDARY_MONTHS = references.meta.boundaryMonths;
export const MIN_AGE_MONTHS = 0;
export const MAX_AGE_MONTHS = 240;

export function sourceForAge(ageMonths: number): Source {
  return ageMonths < BOUNDARY_MONTHS ? 'WHO' : 'CDC';
}

function measureRefs(measure: Measure, refSet: RefSet): MeasureRefs {
  if (refSet === 'down') return references.down[measure];
  if (refSet === 'turner') return references.turner[measure];
  return references.data[measure];
}

function seriesFor(measure: Measure, sex: Sex, source: Source, refSet: RefSet): LmsPoint[] {
  const refs = measureRefs(measure, refSet);
  return (source === 'WHO' ? refs.who : refs.cdc)[sex];
}

/** Linear interpolation of L, M, S at `age`, clamping at the series endpoints. */
function interpolate(series: LmsPoint[], age: number): Lms | null {
  if (series.length === 0) return null;
  if (age <= series[0][0]) return { L: series[0][1], M: series[0][2], S: series[0][3] };
  const last = series[series.length - 1];
  if (age >= last[0]) return { L: last[1], M: last[2], S: last[3] };

  // binary search for the bracketing interval
  let lo = 0;
  let hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= age) lo = mid;
    else hi = mid;
  }
  const a = series[lo];
  const b = series[hi];
  const f = (age - a[0]) / (b[0] - a[0]);
  return {
    L: a[1] + f * (b[1] - a[1]),
    M: a[2] + f * (b[2] - a[2]),
    S: a[3] + f * (b[3] - a[3]),
  };
}

export function lookupLMS(
  measure: Measure,
  sex: Sex,
  ageMonths: number,
  refSet: RefSet = 'standard',
): Lms | null {
  if (ageMonths < MIN_AGE_MONTHS || ageMonths > MAX_AGE_MONTHS) return null;
  const series = seriesFor(measure, sex, sourceForAge(ageMonths), refSet);
  return interpolate(series, ageMonths);
}

export interface ExtBmi {
  sigma: number;
  p95: number;
}

/** CDC Extended-BMI sigma + P95 at `age` (CDC range only). */
export function extendedBmiParams(sex: Sex, ageMonths: number): ExtBmi | null {
  if (ageMonths < BOUNDARY_MONTHS || ageMonths > MAX_AGE_MONTHS) return null;
  const series = references.extendedBmi[sex];
  if (series.length === 0) return null;
  let point = series[series.length - 1];
  if (ageMonths <= series[0][0]) point = series[0];
  else if (ageMonths < point[0]) {
    let lo = 0;
    let hi = series.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (series[mid][0] <= ageMonths) lo = mid;
      else hi = mid;
    }
    const a = series[lo];
    const b = series[hi];
    const f = (ageMonths - a[0]) / (b[0] - a[0]);
    return { sigma: a[1] + f * (b[1] - a[1]), p95: a[2] + f * (b[2] - a[2]) };
  }
  return { sigma: point[1], p95: point[2] };
}

/** Grid ages (months) available for a measure/sex within [minAge, maxAge]. */
export function gridAges(
  measure: Measure,
  sex: Sex,
  minAge: number,
  maxAge: number,
  refSet: RefSet = 'standard',
): number[] {
  const refs = measureRefs(measure, refSet);
  const ages: number[] = [];
  for (const series of [refs.who[sex], refs.cdc[sex]]) {
    for (const p of series) {
      if (p[0] >= minAge && p[0] <= maxAge) ages.push(p[0]);
    }
  }
  ages.sort((x, y) => x - y);
  return ages;
}

export function referenceMeta() {
  return references.meta;
}
