// Public surface of the growth engine.

export * from './types';
export {
  zFromMeasurement,
  measurementFromZ,
  centileFromZ,
  zFromCentile,
  normalCdf,
  normalInv,
} from './lms';
export {
  lookupLMS,
  sourceForAge,
  gridAges,
  referenceMeta,
  BOUNDARY_MONTHS,
  MIN_AGE_MONTHS,
  MAX_AGE_MONTHS,
} from './references';
export {
  assess,
  bmiFrom,
  referenceCurves,
  DEFAULT_CENTILES,
} from './anthro';
export type { Assessment, CurvePoint, ReferenceCurve, Method } from './anthro';
export {
  ageMonthsFromDates,
  daysBetween,
  yearsToMonths,
  formatAge,
  DAYS_PER_MONTH,
} from './age';
export { midParentalHeight, heightVelocity, correctedAgeMonths, TERM_WEEKS } from './clinical';
export type { TargetHeight, Velocity } from './clinical';
export { interpret } from './interpret';
export type { Interpretation, Tone } from './interpret';
export { predictAdultHeight, bayleyPinneauMeta } from './bayleyPinneau';
export type { AdultHeightPrediction, Maturity } from './bayleyPinneau';
export {
  assessPuberty,
  tannerDescriptor,
  tannerBadge,
  splNorm,
  hasPubertyData,
  maxTesticularVol,
  PRADER_VOLUMES,
  TESTIS_ONSET_ML,
  ONSET_LIMITS,
} from './puberty';
export type {
  PubertyAssessment,
  PubertyWarning,
  WarningSeverity,
  TannerKind,
  SplNorm,
} from './puberty';
