// Converts raw CDC/WHO LMS reference files (data-src/) into a single bundled
// JSON asset (src/engine/data/references.json) used by the app at runtime.
//
// It also SELF-VALIDATES: for every CDC row it recomputes the 3rd/50th/97th
// percentile measurement from the LMS parameters and compares against CDC's own
// published P3/P50/P97 columns. If any row disagrees beyond tolerance the build
// fails, so we never ship data that is inconsistent with CDC's published charts.
//
// Age is unified to MONTHS across all sources:
//   - WHO files are indexed by day  -> months = days / 30.4375
//   - CDC files are already in months
//   - WHO is kept for 0..<24 months, CDC for >=24 months.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'data-src');
const OUT_DIR = join(ROOT, 'src', 'engine', 'data');

const DAYS_PER_MONTH = 30.4375;
const WHO_MAX_MONTHS = 24; // WHO used 0..<24 months, CDC from 24 months

// ---- LMS math (kept in sync with src/engine/lms.ts) ----
function measurementFromZ(z, L, M, S) {
  if (Math.abs(L) < 1e-7) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}
// z for the 3rd / 50th / 97th percentiles (standard normal quantiles)
const Z_P3 = -1.8807936081512509;
const Z_P50 = 0;
const Z_P97 = 1.8807936081512509;

function parseCdc(file, measure) {
  const text = readFileSync(join(SRC, 'cdc', file), 'utf8').trim();
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.trim());
  const idx = (name) => header.indexOf(name);
  const iSex = idx('Sex'), iAge = idx('Agemos'), iL = idx('L'), iM = idx('M'), iS = idx('S');
  const iP3 = idx('P3'), iP50 = idx('P50'), iP97 = idx('P97');
  const out = { male: [], female: [] };
  let checked = 0, maxErr = 0;
  for (let r = 1; r < lines.length; r++) {
    const c = lines[r].split(',');
    const age = parseFloat(c[iAge]);
    if (!(age >= 24)) continue; // CDC segment only from 24 months
    const sex = c[iSex].trim() === '1' ? 'male' : 'female';
    const L = parseFloat(c[iL]), M = parseFloat(c[iM]), S = parseFloat(c[iS]);
    // self-validation against CDC's own percentile columns
    for (const [z, col] of [[Z_P3, iP3], [Z_P50, iP50], [Z_P97, iP97]]) {
      if (col < 0) continue;
      const published = parseFloat(c[col]);
      const rel = Math.abs(measurementFromZ(z, L, M, S) - published) / published;
      maxErr = Math.max(maxErr, rel);
      checked++;
    }
    out[sex].push([round(age), L, M, S]);
  }
  if (maxErr > 5e-4) {
    throw new Error(`CDC ${measure} (${file}) self-validation FAILED: max relative error ${maxErr}`);
  }
  console.log(`  CDC ${measure.padEnd(6)} ${file.padEnd(16)} rows m=${out.male.length} f=${out.female.length} | ${checked} pctile checks, max rel err ${(maxErr * 100).toExponential(2)}%`);
  return out;
}

function parseWho(file, measure) {
  const text = readFileSync(join(SRC, 'who', file), 'utf8').trim();
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(/\t/).map((h) => h.trim().toLowerCase());
  const iSex = header.indexOf('sex'), iAge = header.indexOf('age');
  const iL = header.indexOf('l'), iM = header.indexOf('m'), iS = header.indexOf('s');
  const out = { male: [], female: [] };
  let maxAge = 0;
  for (let r = 1; r < lines.length; r++) {
    const c = lines[r].split(/\t/);
    const ageDays = parseFloat(c[iAge]);
    maxAge = Math.max(maxAge, ageDays);
    const months = ageDays / DAYS_PER_MONTH;
    if (months >= WHO_MAX_MONTHS) continue; // hand off to CDC at 24 months
    const sex = c[iSex].trim() === '1' ? 'male' : 'female';
    out[sex].push([round(months), parseFloat(c[iL]), parseFloat(c[iM]), parseFloat(c[iS])]);
  }
  if (maxAge < 100) throw new Error(`WHO ${file}: expected age in DAYS (max age ${maxAge} looks like months)`);
  console.log(`  WHO ${measure.padEnd(6)} ${file.padEnd(16)} rows m=${out.male.length} f=${out.female.length} | source max age ${maxAge} days`);
  return out;
}

function round(n) {
  return Math.round(n * 1e6) / 1e6;
}

console.log('Building growth reference dataset...');
const refs = {
  height: { who: parseWho('lenanthro.txt', 'height'), cdc: parseCdc('statage.csv', 'height') },
  weight: { who: parseWho('weianthro.txt', 'weight'), cdc: parseCdc('wtage.csv', 'weight') },
  bmi: { who: parseWho('bmianthro.txt', 'bmi'), cdc: parseCdc('bmiagerev.csv', 'bmi') },
};

const payload = {
  meta: {
    generated: new Date().toISOString().slice(0, 10),
    ageUnit: 'months',
    boundaryMonths: WHO_MAX_MONTHS,
    sources: {
      who: 'WHO Child Growth Standards (length/weight/BMI-for-age), LMS, 0 to <24 months',
      cdc: 'CDC 2000 Growth Charts (stature/weight/BMI-for-age), LMS, 24 to 240 months',
    },
    note: 'height = WHO recumbent length (0-2y) then CDC standing stature (2-20y)',
  },
  data: refs,
};

mkdirSync(OUT_DIR, { recursive: true });

// 1) raw JSON (handy for inspection / external tooling)
const jsonStr = JSON.stringify(payload);
writeFileSync(join(OUT_DIR, 'references.json'), jsonStr);

// 2) typed TS module used by the app. The data is embedded as a string literal
//    that is JSON.parse'd at runtime, which keeps `tsc` fast (no giant inferred
//    literal type) while still bundling everything for offline use.
const tsModule = `// AUTO-GENERATED by scripts/build-references.mjs — do not edit by hand.
import type { ReferencesFile } from '../types';

const references = JSON.parse(${JSON.stringify(jsonStr)}) as ReferencesFile;

export default references;
`;
writeFileSync(join(OUT_DIR, 'references.generated.ts'), tsModule);

console.log(`Wrote references.json + references.generated.ts (${(jsonStr.length / 1024).toFixed(1)} KB payload)`);
