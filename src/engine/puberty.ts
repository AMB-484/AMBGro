// Puberty assessment: Tanner staging, Prader orchidometer, menarche, and the
// clinical logic that turns a single assessment into passive warnings. Pure and
// framework-agnostic — the UI and charts consume these.
//
// Tanner stages are stored as integers 1–5 (never strings) so they can be
// compared, plotted and analysed directly.

import type { Sex } from './types';

/** One pubertal assessment, captured as part of a visit. All fields optional. */
export interface PubertyAssessment {
  // Male
  tannerGenitalia?: number; // G1–G5
  testicularVolLeft?: number; // mL (Prader)
  testicularVolRight?: number; // mL (Prader)
  stretchedPenileLength?: number; // cm
  // Female
  tannerBreast?: number; // B1–B5
  palpableGlandularTissue?: boolean;
  menarcheAchieved?: boolean;
  menarcheDate?: string; // yyyy-mm (month precision)
  // Both
  tannerPubicHair?: number; // PH1–PH5
}

export type TannerKind = 'genitalia' | 'breast' | 'pubicHair';

/** Prader orchidometer bead volumes (mL). ≥4 mL marks gonadarche in boys. */
export const PRADER_VOLUMES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25];

/** Testicular volume (mL) at/above which puberty is considered to have started. */
export const TESTIS_ONSET_ML = 4;

// Canonical Tanner descriptors (index 0 unused so stage N == array[N]).
const GENITALIA = [
  '',
  'G1 · Prepubertal; testes < 4 mL',
  'G2 · Testes enlarge (≥ 4 mL); scrotum thins & reddens',
  'G3 · Penis lengthens; testes & scrotum grow further',
  'G4 · Penis widens, glans develops; scrotum darkens',
  'G5 · Adult genitalia',
];
const BREAST = [
  '',
  'B1 · Prepubertal; no glandular tissue',
  'B2 · Breast bud; areola widens (thelarche)',
  'B3 · Breast & areola enlarge; no contour separation',
  'B4 · Areola & papilla form a secondary mound',
  'B5 · Mature; areola recedes to breast contour',
];
const PUBIC_HAIR = [
  '',
  'PH1 · No pubic hair',
  'PH2 · Sparse, lightly pigmented at base',
  'PH3 · Darker, coarser, spreading over junction',
  'PH4 · Adult type; area smaller, spares thighs',
  'PH5 · Adult in quantity & type; spreads to thighs',
];

export function tannerDescriptor(kind: TannerKind, stage: number): string {
  const table = kind === 'genitalia' ? GENITALIA : kind === 'breast' ? BREAST : PUBIC_HAIR;
  return table[stage] ?? '';
}

/** Short badge label, e.g. "G3", "B2", "PH4". */
export function tannerBadge(kind: TannerKind, stage: number): string {
  const prefix = kind === 'genitalia' ? 'G' : kind === 'breast' ? 'B' : 'PH';
  return `${prefix}${stage}`;
}

// --- Stretched penile length nomogram (Feldman & Smith, J Pediatr 1975;86:395) ---
// mean ± SD (cm) by age. Childhood + adult only — the original nomogram does not
// tabulate the pubertal years, so we decline to flag SPL there. VERIFY these
// constants against the source before relying on the micropenis flag clinically.
const SPL_NORM: [ageYears: number, mean: number, sd: number][] = [
  [0, 3.5, 0.4],
  [0.4, 3.9, 0.8],
  [0.9, 4.3, 0.8],
  [1.5, 4.7, 0.8],
  [2.5, 5.1, 0.9],
  [3.5, 5.5, 0.9],
  [4.5, 5.7, 0.9],
  [5.5, 6.0, 0.9],
  [6.5, 6.1, 0.9],
  [7.5, 6.2, 1.0],
  [8.5, 6.3, 1.0],
  [9.5, 6.3, 1.0],
  [10.5, 6.4, 1.1],
];
const SPL_ADULT: [number, number] = [13.3, 1.6]; // ≥ 17 y or adult
const SPL_GAP_MAX = 11; // above this (and below adult) the nomogram doesn't apply

export interface SplNorm {
  mean: number;
  sd: number;
}

/** Feldman SPL mean/SD at an age, or null where the nomogram is not defined. */
export function splNorm(ageYears: number): SplNorm | null {
  if (ageYears >= 17) return { mean: SPL_ADULT[0], sd: SPL_ADULT[1] };
  if (ageYears > SPL_GAP_MAX) return null; // pubertal gap — undefined
  // linear interpolation / endpoint clamp within the childhood table
  if (ageYears <= SPL_NORM[0][0]) return { mean: SPL_NORM[0][1], sd: SPL_NORM[0][2] };
  const last = SPL_NORM[SPL_NORM.length - 1];
  if (ageYears >= last[0]) return { mean: last[1], sd: last[2] };
  for (let i = 1; i < SPL_NORM.length; i++) {
    const [a, ma, sa] = SPL_NORM[i - 1];
    const [b, mb, sb] = SPL_NORM[i];
    if (ageYears <= b) {
      const f = (ageYears - a) / (b - a);
      return { mean: ma + f * (mb - ma), sd: sa + f * (sb - sa) };
    }
  }
  return null;
}

// --- Age thresholds for precocious / delayed puberty (consensus values) ---
export const ONSET_LIMITS = {
  male: { precociousBefore: 9, delayedBy: 14 },
  female: { precociousBefore: 8, delayedBy: 13 },
} as const;

export type WarningSeverity = 'info' | 'warn';
export interface PubertyWarning {
  severity: WarningSeverity;
  text: string;
}

/** True if any pubertal sign has been recorded in this assessment. */
export function hasPubertyData(p: PubertyAssessment): boolean {
  return (
    p.tannerGenitalia != null ||
    p.tannerBreast != null ||
    p.tannerPubicHair != null ||
    p.testicularVolLeft != null ||
    p.testicularVolRight != null ||
    p.stretchedPenileLength != null ||
    p.palpableGlandularTissue != null ||
    p.menarcheAchieved != null ||
    !!p.menarcheDate
  );
}

/** Max recorded testicular volume (mL), or null. */
export function maxTesticularVol(p: PubertyAssessment): number | null {
  const vs = [p.testicularVolLeft, p.testicularVolRight].filter(
    (v): v is number => v != null,
  );
  return vs.length ? Math.max(...vs) : null;
}

/**
 * Passive clinical warnings for one assessment at a chronological age (years).
 * Never blocks entry — the UI shows these as small non-modal alerts.
 */
export function assessPuberty(
  sex: Sex,
  chronoAgeYears: number | null,
  p: PubertyAssessment,
): PubertyWarning[] {
  const out: PubertyWarning[] = [];
  const age = chronoAgeYears;

  if (sex === 'male') {
    const tv = maxTesticularVol(p);
    const g = p.tannerGenitalia ?? null;
    const ph = p.tannerPubicHair ?? null;
    const started = (tv != null && tv >= TESTIS_ONSET_ML) || (g != null && g >= 2) || (ph != null && ph >= 2);

    if (age != null && started && age < ONSET_LIMITS.male.precociousBefore) {
      out.push({
        severity: 'warn',
        text: `Precocious puberty: pubertal signs before age ${ONSET_LIMITS.male.precociousBefore} (age ${age.toFixed(1)} y).`,
      });
    }
    const prepubertal = (tv == null || tv < TESTIS_ONSET_ML) && (g == null || g <= 1);
    if (age != null && age >= ONSET_LIMITS.male.delayedBy && prepubertal && (tv != null || g != null)) {
      out.push({
        severity: 'warn',
        text: `Delayed puberty: no testicular enlargement (≥ ${TESTIS_ONSET_ML} mL) by age ${ONSET_LIMITS.male.delayedBy} (age ${age.toFixed(1)} y).`,
      });
    }

    // Stretched penile length vs Feldman nomogram (micropenis at < −2.5 SD)
    if (p.stretchedPenileLength != null && age != null) {
      const norm = splNorm(age);
      if (norm) {
        const z = (p.stretchedPenileLength - norm.mean) / norm.sd;
        if (z < -2.5) {
          out.push({
            severity: 'warn',
            text: `SPL ${p.stretchedPenileLength.toFixed(1)} cm is ${z.toFixed(1)} SD below the mean for age (micropenis threshold −2.5 SD).`,
          });
        }
      }
    }
  } else {
    const b = p.tannerBreast ?? null;
    const ph = p.tannerPubicHair ?? null;
    const started = (b != null && b >= 2) || (ph != null && ph >= 2);

    if (age != null && started && age < ONSET_LIMITS.female.precociousBefore) {
      out.push({
        severity: 'warn',
        text: `Precocious puberty: pubertal signs before age ${ONSET_LIMITS.female.precociousBefore} (age ${age.toFixed(1)} y).`,
      });
    }
    if (age != null && age >= ONSET_LIMITS.female.delayedBy && (b != null && b <= 1)) {
      out.push({
        severity: 'warn',
        text: `Delayed puberty: no breast development (B2) by age ${ONSET_LIMITS.female.delayedBy} (age ${age.toFixed(1)} y).`,
      });
    }

    // Asynchrony: menarche reached but breast still prepubertal
    if (p.menarcheAchieved && b === 1) {
      out.push({
        severity: 'warn',
        text: 'Asynchrony: menarche reported but breast staged B1 — re-check staging or history.',
      });
    }
    // Primary amenorrhoea prompt
    if (age != null && age >= 15 && p.menarcheAchieved === false) {
      out.push({
        severity: 'info',
        text: 'No menarche by age 15 — consider evaluation for primary amenorrhoea.',
      });
    }
  }

  return out;
}
