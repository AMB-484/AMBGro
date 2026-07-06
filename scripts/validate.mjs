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

function lookup(measure, sex, age) {
  const series = age < refs.meta.boundaryMonths ? refs.data[measure].who[sex] : refs.data[measure].cdc[sex];
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

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
