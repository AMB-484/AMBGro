// Shared domain types for the growth-reference engine.

export type Sex = 'male' | 'female';
export type Measure = 'height' | 'weight' | 'bmi';
export type Source = 'WHO' | 'CDC';
/** Which reference population the charts describe. */
export type RefSet = 'standard' | 'down';

/** One reference point: [ageMonths, L, M, S]. */
export type LmsPoint = [age: number, L: number, M: number, S: number];

export interface SexSeries {
  male: LmsPoint[];
  female: LmsPoint[];
}

export interface MeasureRefs {
  who: SexSeries;
  cdc: SexSeries;
}

/** Extended-BMI parameters: [ageMonths, sigma, P95]. */
export type ExtBmiPoint = [age: number, sigma: number, p95: number];

export interface ReferencesFile {
  meta: {
    generated: string;
    ageUnit: string;
    boundaryMonths: number;
    sources: Record<string, string>;
    note: string;
  };
  data: Record<Measure, MeasureRefs>;
  extendedBmi: { male: ExtBmiPoint[]; female: ExtBmiPoint[] };
  down: Record<Measure, MeasureRefs>;
}

export interface Lms {
  L: number;
  M: number;
  S: number;
}
