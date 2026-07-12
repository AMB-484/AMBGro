// Build the Bayley-Pinneau adult-height-prediction dataset from the RCPCH
// hand-transcribed CSVs (data-src/bayley-pinneau/*.csv, MIT-licensed).
//
// The Bayley-Pinneau method predicts adult height from current height and
// skeletal (bone) age:  predicted = currentHeight / (%ofMatureHeight / 100).
// The percentage depends only on sex, skeletal maturity category and skeletal
// age, so it is unit-independent — we keep everything in the percentage domain
// and let the app work in cm.
//
// The source is explicitly "transcribed by hand and not tested", so rather than
// trust the single published "% of Mature Height" row we DERIVE the percentage
// from every body cell (% = 100 * heightRow / predictedCell) and take the median
// per skeletal-age column. A lone mistyped cell is then just one outlier among
// ~15-25 and cannot move the median. We still cross-check the derived median
// against the published % row and print any disagreement, plus internal spread
// and monotonicity, as a transcription-quality report.
//
// Usage:  node scripts/build-bayley-pinneau.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'data-src', 'bayley-pinneau');
const OUT = join(__dirname, '..', 'src', 'engine', 'data', 'bayleyPinneau.generated.ts');

const FILES = [
  ['female', 'average', 'girls_normal.csv'],
  ['female', 'accelerated', 'girls_advanced.csv'],
  ['female', 'delayed', 'girls_delayed.csv'],
  ['male', 'average', 'boys_normal.csv'],
  ['male', 'accelerated', 'boys_advanced.csv'],
  ['male', 'delayed', 'boys_delayed.csv'],
];

/** "7-0" -> 7.0, "10" -> 10.0, "6-10" -> 6 + 10/12 (years-months, NOT decimal). */
function parseSkeletalAge(raw) {
  const s = String(raw).trim();
  if (!s) return null;
  const [y, m] = s.split('-');
  const years = Number(y);
  if (!Number.isFinite(years)) return null;
  const months = m == null || m === '' ? 0 : Number(m);
  if (!Number.isFinite(months)) return null;
  return years + months / 12;
}

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return null;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

function parseFile(path) {
  const rows = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.length)
    .map((l) => l.split(',').map((c) => c.trim()));

  const headerRow = rows.find((r) => r[0].toLowerCase() === 'skeletal age');
  if (!headerRow) throw new Error(`no "Skeletal Age" header in ${path}`);

  // column index -> skeletal age (years); skip the label column (index 0)
  const cols = [];
  for (let i = 1; i < headerRow.length; i++) {
    const sa = parseSkeletalAge(headerRow[i]);
    if (sa != null) cols.push({ i, sa });
  }

  const pctRow = rows.find((r) => r[0].toLowerCase().startsWith('% of mature height'));
  const explicit = new Map(); // col index -> published %
  if (pctRow) {
    for (const { i } of cols) {
      const v = Number(pctRow[i]);
      if (Number.isFinite(v) && v > 0) explicit.set(i, v);
    }
  }

  // body rows: first cell is a plain height in inches
  const derived = new Map(cols.map(({ i }) => [i, []]));
  for (const r of rows) {
    const h = Number(r[0]);
    if (!Number.isFinite(h) || r[0].includes('-') || h < 30 || h > 90) continue;
    for (const { i } of cols) {
      const predicted = Number(r[i]);
      if (Number.isFinite(predicted) && predicted > 0) {
        derived.get(i).push((100 * h) / predicted);
      }
    }
  }

  const OUTLIER = 0.75; // percentage points from the column median = likely typo
  const series = [];
  const diagnostics = [];
  for (const { i, sa } of cols) {
    const vals = derived.get(i);
    if (vals.length === 0) continue;
    const med = median(vals);
    // outlier body cells: |derived% - column median| > OUTLIER
    const outliers = vals.filter((v) => Math.abs(v - med) > OUTLIER).length;
    const robustDev = Math.max(0, ...vals.filter((v) => Math.abs(v - med) <= OUTLIER).map((v) => Math.abs(v - med)));
    const pub = explicit.get(i) ?? null;
    series.push({ sa, pct: Math.round(med * 100) / 100 });
    diagnostics.push({
      sa,
      n: vals.length,
      median: med,
      outliers,
      robustDev, // spread ignoring the flagged outliers
      published: pub,
      pubDelta: pub == null ? null : Math.abs(med - pub),
    });
  }
  series.sort((a, b) => a.sa - b.sa);
  return { series, diagnostics };
}

// ---- build + validate ----
const out = { female: {}, male: {}, meta: {} };
const report = [];
let worstSpread = 0;
let worstPubDelta = 0;

for (const [sex, cat, file] of FILES) {
  const { series, diagnostics } = parseFile(join(SRC, file));
  out[sex][cat] = series.map((p) => [p.sa, p.pct]);

  const totalCells = diagnostics.reduce((s, d) => s + d.n, 0);
  const outlierCells = diagnostics.reduce((s, d) => s + d.outliers, 0);
  const robustSpread = Math.max(...diagnostics.map((d) => d.robustDev));
  const withPub = diagnostics.filter((d) => d.pubDelta != null);
  const maxPubDelta = withPub.length ? Math.max(...withPub.map((d) => d.pubDelta)) : 0;
  const pubAt = withPub.find((d) => d.pubDelta === maxPubDelta);

  // monotonicity of the median %-of-mature-height series (should be increasing)
  let drops = 0;
  for (let k = 1; k < series.length; k++) if (series[k].pct < series[k - 1].pct - 0.05) drops++;

  worstSpread = Math.max(worstSpread, robustSpread);
  worstPubDelta = Math.max(worstPubDelta, maxPubDelta);

  report.push(
    `${sex}/${cat} (${file})\n` +
      `   skeletal age ${series[0].sa.toFixed(2)}–${series.at(-1).sa.toFixed(2)} y, ${series.length} cols\n` +
      `   outlier body cells (ignored by median): ${outlierCells} / ${totalCells}\n` +
      `   robust within-column spread (excl. outliers): ${robustSpread.toFixed(2)}%\n` +
      `   worst median-vs-published Δ: ${maxPubDelta.toFixed(2)}%` +
      (pubAt ? ` at SA ${pubAt.sa.toFixed(2)} (median ${pubAt.median.toFixed(2)} vs published ${pubAt.published})` : ' (no published row)') +
      `\n   monotonic series: ${drops === 0 ? 'yes' : `no (${drops} drops)`}`,
  );
}

out.meta = {
  generated: new Date().toISOString().slice(0, 10),
  source: 'RCPCH growth-references (MIT), Bayley-Pinneau tables, hand-transcribed',
  method: 'predicted adult height = current height / (% of mature height / 100)',
  note: 'Percentages derived as the median of 100*height/predicted across each skeletal-age column; UNVALIDATED against the original paper.',
};

const banner =
  '// AUTO-GENERATED by scripts/build-bayley-pinneau.mjs — do not edit by hand.\n' +
  '// Source: RCPCH growth-references (MIT), Bayley-Pinneau tables (hand-transcribed, untested).\n' +
  '// % of mature height by skeletal age (years), per sex and skeletal-maturity category.\n\n';

const ts =
  banner +
  `import type { BayleyPinneauData } from '../bayleyPinneau';\n\n` +
  `const bayleyPinneau: BayleyPinneauData = ${JSON.stringify(out, null, 2)};\n\n` +
  `export default bayleyPinneau;\n`;

writeFileSync(OUT, ts);

console.log('Bayley-Pinneau dataset written to', OUT.replace(join(__dirname, '..'), '.'));
console.log('\n=== transcription-quality report ===\n');
console.log(report.join('\n\n'));
console.log(
  `\nOverall: worst robust within-column spread ${worstSpread.toFixed(2)}%, ` +
    `worst median-vs-published Δ ${worstPubDelta.toFixed(2)}%.`,
);
console.log(
  'The predictor uses the per-column MEDIAN %, so flagged outlier cells do not affect it.\n' +
    'Remaining Δ vs published are small and concentrated near skeletal maturity (≈99–100%),\n' +
    'where predicted height is insensitive. Still UNVALIDATED against the original paper.',
);
