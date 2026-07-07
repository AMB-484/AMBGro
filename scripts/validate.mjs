// Independent runtime validation of the generated dataset + LMS algorithm.
// Reimplements the math from scratch (a deliberate second implementation) and
// checks it against known anchors, including WHO's own published +2SD values.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const refs = JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'engine', 'data', 'references.json'), 'utf8'),
);

const measurementFromZ = (z, L, M, S) =>
  Math.abs(L) < 1e-7 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
const zFromMeasurement = (x, L, M, S) =>
  Math.abs(L) < 1e-7 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
const erfc = (x) => {
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const p = [0.17087277, -0.82215223, 1.48851587, -1.13520398, 0.27886807, -0.18628806, 0.09678418, 0.37409196, 1.00002368];
  let poly = 0;
  for (const c of p) poly = poly * t + c;
  const tau = t * Math.exp(-x * x - 1.26551223 + t * poly);
  return x >= 0 ? tau : 2 - tau;
};
const normalCdf = (z) => 0.5 * erfc(-z / Math.SQRT2);

function lookup(measure, sex, age, root = refs.data) {
  const series = age < refs.meta.boundaryMonths ? root[measure].who[sex] : root[measure].cdc[sex];
  if (age <= series[0][0]) return series[0];
  const last = series[series.length - 1];
  if (age >= last[0]) return last;
  let lo = 0, hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= age) lo = mid; else hi = mid;
  }
  const a = series[lo], b = series[hi], f = (age - a[0]) / (b[0] - a[0]);
  return [age, a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), a[3] + f * (b[3] - a[3])];
}

let failures = 0;
function check(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} got ${got.toFixed(4)}  want ${want}±${tol}`);
}

// 1) Median measurement -> z == 0 (WHO weight, boy, birth)
{
  const [, L, M, S] = lookup('weight', 'male', 0);
  check('WHO weight male @0mo, value=M -> z=0', zFromMeasurement(M, L, M, S), 0, 1e-9);
}
// 2) WHO published +2SD anchors (from WHO Child Growth Standards tables)
{
  const [, L, M, S] = lookup('height', 'male', 0);
  check('WHO length male @birth +2SD ~ 53.7cm', measurementFromZ(2, L, M, S), 53.7, 0.15);
}
{
  const [, L, M, S] = lookup('weight', 'male', 0);
  check('WHO weight male @birth +2SD ~ 4.42kg', measurementFromZ(2, L, M, S), 4.42, 0.1);
}
// 3) CDC BMI boy @24mo median -> z=0, and centile via round-trip
{
  const [, L, M, S] = lookup('bmi', 'male', 24);
  check('CDC BMI male @24mo, value=M -> z=0', zFromMeasurement(M, L, M, S), 0, 1e-9);
}
// 4) Exact round-trip at an interpolated age
{
  const [, L, M, S] = lookup('height', 'female', 30.5);
  const v = measurementFromZ(-1.5, L, M, S);
  check('round-trip z=-1.5 (CDC height f @30.5mo)', zFromMeasurement(v, L, M, S), -1.5, 1e-9);
}
// 5) WHO->CDC handoff at 24mo: expect a SMALL step (~0.7-1.5cm) because WHO uses
//    recumbent length and CDC uses standing height. This documents the known,
//    clinically-accepted discontinuity at the 2-year chart switch.
{
  const whoLast = lookup('height', 'male', 23.9);
  const cdcFirst = lookup('height', 'male', 24);
  const diff = Math.abs(whoLast[2] - cdcFirst[2]);
  check('WHO->CDC median height step @24mo (length vs height) < 1.6cm', diff, 0, 1.6);
}

// 6) Extended BMI: P95 in the sigma table matches the LMS-derived 95th percentile,
//    and BMI 2*sigma above P95 maps to ~99.77th percentile.
{
  const target = 120;
  const ext = refs.extendedBmi.male.reduce((best, p) =>
    Math.abs(p[0] - target) < Math.abs(best[0] - target) ? p : best,
  ); // [age, sigma, p95]
  const [, L, M, S] = lookup('bmi', 'male', ext[0]);
  const lmsP95 = measurementFromZ(1.6448536, L, M, S);
  check(`extBMI male @${ext[0]}mo: P95 == LMS 95th pct`, ext[2], lmsP95, 0.1);
  const bmi = ext[2] + 2 * ext[1];
  const pct = 90 + 10 * normalCdf((bmi - ext[2]) / ext[1]);
  check('extBMI pct at P95 + 2*sigma ~ 99.77', pct, 99.77, 0.5);
}

// 7) Down syndrome (Zemel): children are shorter, so the Down height median must
//    sit well below the standard CDC height median at the same age.
{
  const stdM = lookup('height', 'male', 60)[2];
  const downM = lookup('height', 'male', 60, refs.down)[2];
  check('Down male height median @60mo < standard', downM < stdM ? downM : stdM + 1, downM, 1e-6);
  check('Down male height @60mo is 3-9cm below standard', stdM - downM, 6, 4);
}
// 8) Corrected age for prematurity (reimplemented): 32wk infant at chrono 3mo.
{
  const DPM = 30.4375;
  const chrono = 3;
  const corrected = Math.max(0, chrono - ((40 - 32) * 7) / DPM);
  check('corrected age 32wk @3mo chrono ~ 1.16mo', corrected, 1.16, 0.02);
}

// 9) Turner (Isojima): height-SDS = (x - mean)/SD, median @10y = 118.82,
//    adult height @18y ~ 139.5cm. A typical girl (~138cm @10y) is very high on Turner.
{
  const [, L, M, S] = lookup('height', 'female', 120, refs.turner);
  check('Turner female height median @10y = 118.82', M, 118.82, 0.01);
  check('Turner @10y x=mean -> z=0', zFromMeasurement(118.82, L, M, S), 0, 1e-9);
  const M18 = lookup('height', 'female', 216, refs.turner)[2];
  check('Turner female final height @18y ~ 139.5', M18, 139.51, 0.01);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
