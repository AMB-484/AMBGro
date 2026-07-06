import { useMemo, useRef, useState } from 'react';
import {
  assess,
  bmiFrom,
  referenceCurves,
  ageMonthsFromDates,
  yearsToMonths,
  formatAge,
  BOUNDARY_MONTHS,
  MAX_AGE_MONTHS,
} from './engine';
import type { Assessment, Measure, Sex } from './engine';
import { GrowthChart } from './components/GrowthChart';
import type { PlottedPoint } from './components/GrowthChart';
import { exportChartPng, exportReportPdf, exportCsv } from './export/chartExport';
import type { CsvVisit, ReportMeta } from './export/chartExport';
import './App.css';

const APP_NAME = 'GrowthTrack';
const DEVELOPER = 'Dr. Awais Butt';

const MEASURES: { key: Measure; label: string; unit: string }[] = [
  { key: 'height', label: 'Height / Length', unit: 'cm' },
  { key: 'weight', label: 'Weight', unit: 'kg' },
  { key: 'bmi', label: 'BMI', unit: 'kg/m²' },
];

const today = new Date().toISOString().slice(0, 10);

function num(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function fmtCentile(c: number): string {
  if (c < 0.1) return '< 0.1';
  if (c > 99.9) return '> 99.9';
  if (c < 1 || c > 99) return c.toFixed(2);
  return c.toFixed(1);
}

export default function App() {
  const [sex, setSex] = useState<Sex>('male');
  const [ageMode, setAgeMode] = useState<'dob' | 'age'>('dob');
  const [dob, setDob] = useState('');
  const [visit, setVisit] = useState(today);
  const [ageYears, setAgeYears] = useState('');
  const [ageMonthsInput, setAgeMonthsInput] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [chartMeasure, setChartMeasure] = useState<Measure>('height');
  const chartRef = useRef<HTMLDivElement>(null);

  const ageMonths = useMemo<number | null>(() => {
    if (ageMode === 'dob') {
      if (!dob || !visit) return null;
      const m = ageMonthsFromDates(new Date(dob), new Date(visit));
      return m >= 0 ? m : null;
    }
    const y = num(ageYears) ?? 0;
    const mo = num(ageMonthsInput) ?? 0;
    const m = yearsToMonths(y) + mo;
    return m > 0 ? m : null;
  }, [ageMode, dob, visit, ageYears, ageMonthsInput]);

  const heightCm = num(height);
  const weightKg = num(weight);
  const bmiVal = heightCm && weightKg ? bmiFrom(weightKg, heightCm) : null;

  const values: Record<Measure, number | null> = {
    height: heightCm,
    weight: weightKg,
    bmi: bmiVal,
  };

  const ageValid = ageMonths != null && ageMonths >= 0 && ageMonths <= MAX_AGE_MONTHS;

  const assessments = useMemo(() => {
    const out: Partial<Record<Measure, Assessment>> = {};
    if (!ageValid || ageMonths == null) return out;
    for (const { key } of MEASURES) {
      const v = values[key];
      if (v == null) continue;
      const a = assess(key, sex, ageMonths, v);
      if (a) out[key] = a;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageValid, ageMonths, sex, heightCm, weightKg, bmiVal]);

  // chart window: infants on a 0-2y month axis, older children on a 2-20y year axis
  const infantChart = ageMonths != null && ageMonths < BOUNDARY_MONTHS;
  const [minAge, maxAge] = infantChart ? [0, BOUNDARY_MONTHS] : [BOUNDARY_MONTHS, MAX_AGE_MONTHS];
  const xUnit: 'months' | 'years' = infantChart ? 'months' : 'years';
  const measureMeta = MEASURES.find((m) => m.key === chartMeasure)!;

  const curves = useMemo(
    () => referenceCurves(chartMeasure, sex, minAge, maxAge),
    [chartMeasure, sex, minAge, maxAge],
  );

  const chartPoints: PlottedPoint[] = useMemo(() => {
    if (!ageValid || ageMonths == null) return [];
    const v = values[chartMeasure];
    if (v == null) return [];
    return [{ age: ageMonths, value: v }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageValid, ageMonths, chartMeasure, heightCm, weightKg, bmiVal]);

  const ageOutOfRange = ageMonths != null && ageMonths > MAX_AGE_MONTHS;

  const hasResults = Object.keys(assessments).length > 0;
  const sourceLabel = ageMonths != null && ageMonths < BOUNDARY_MONTHS ? 'WHO' : 'CDC';
  const fileDate = ageMode === 'dob' ? visit : today;
  const fileBase = `growth_${sex}_${fileDate}`;

  const getSvg = () => chartRef.current?.querySelector('svg') as SVGSVGElement | null;

  const buildReportMeta = (): ReportMeta => ({
    appName: APP_NAME,
    developer: DEVELOPER,
    sex: sex[0].toUpperCase() + sex.slice(1),
    ageLabel: ageMonths != null ? `${formatAge(ageMonths)} (${ageMonths.toFixed(2)} mo)` : '—',
    dateLabel:
      ageMode === 'dob' ? `DOB ${dob} · visit ${visit}` : 'Age entered directly',
    chartTitle: `${measureMeta.label}-for-age · ${sourceLabel}`,
    measurements: MEASURES.filter((m) => assessments[m.key]).map((m) => {
      const a = assessments[m.key]!;
      const v = values[m.key]!;
      return {
        label: m.label,
        value: `${v.toFixed(1)} ${m.unit}`,
        z: `${a.z >= 0 ? '+' : ''}${a.z.toFixed(2)}`,
        centile: fmtCentile(a.centile),
        source: a.source,
      };
    }),
  });

  const buildCsvVisit = (): CsvVisit => ({
    date: fileDate,
    ageMonths: ageMonths ?? 0,
    ageLabel: ageMonths != null ? formatAge(ageMonths) : '',
    sex,
    heightCm,
    weightKg,
    bmi: bmiVal,
    heightZ: assessments.height?.z ?? null,
    heightCentile: assessments.height?.centile ?? null,
    weightZ: assessments.weight?.z ?? null,
    weightCentile: assessments.weight?.centile ?? null,
    bmiZ: assessments.bmi?.z ?? null,
    bmiCentile: assessments.bmi?.centile ?? null,
    source: sourceLabel,
  });

  const onExportPng = () => {
    const svg = getSvg();
    if (svg) void exportChartPng(svg, `${fileBase}_${chartMeasure}.png`);
  };
  const onExportPdf = () => {
    const svg = getSvg();
    if (svg) void exportReportPdf(svg, buildReportMeta(), `${fileBase}.pdf`);
  };
  const onExportCsv = () => exportCsv([buildCsvVisit()], `${fileBase}.csv`);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>{APP_NAME}</h1>
          <p className="tagline">Digital growth charts · WHO 0–2 y &amp; CDC 2–20 y</p>
        </div>
        <span className="dev">by {DEVELOPER}</span>
      </header>

      <main className="layout">
        <section className="panel inputs" aria-label="Patient inputs">
          <h2>Patient</h2>

          <div className="field">
            <span className="field-label">Sex</span>
            <div className="segmented">
              <button className={sex === 'male' ? 'on' : ''} onClick={() => setSex('male')}>
                Male
              </button>
              <button className={sex === 'female' ? 'on' : ''} onClick={() => setSex('female')}>
                Female
              </button>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Age input</span>
            <div className="segmented">
              <button className={ageMode === 'dob' ? 'on' : ''} onClick={() => setAgeMode('dob')}>
                Date of birth
              </button>
              <button className={ageMode === 'age' ? 'on' : ''} onClick={() => setAgeMode('age')}>
                Enter age
              </button>
            </div>
          </div>

          {ageMode === 'dob' ? (
            <div className="grid2">
              <label>
                Date of birth
                <input type="date" value={dob} max={visit} onChange={(e) => setDob(e.target.value)} />
              </label>
              <label>
                Date of visit
                <input type="date" value={visit} onChange={(e) => setVisit(e.target.value)} />
              </label>
            </div>
          ) : (
            <div className="grid2">
              <label>
                Years
                <input type="number" min="0" max="20" value={ageYears} onChange={(e) => setAgeYears(e.target.value)} />
              </label>
              <label>
                Months
                <input type="number" min="0" max="11" value={ageMonthsInput} onChange={(e) => setAgeMonthsInput(e.target.value)} />
              </label>
            </div>
          )}

          <div className="grid2">
            <label>
              Height / Length (cm)
              <input type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} />
            </label>
            <label>
              Weight (kg)
              <input type="number" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </label>
          </div>

          <div className="age-readout">
            {ageMonths != null && (
              <>
                Age: <strong>{formatAge(ageMonths)}</strong> ({ageMonths.toFixed(2)} months)
                <span className="src-chip">{ageMonths < BOUNDARY_MONTHS ? 'WHO' : 'CDC'}</span>
              </>
            )}
            {ageOutOfRange && <span className="warn"> · beyond 20 y (out of chart range)</span>}
          </div>
        </section>

        <section className="panel results" aria-label="Results">
          <h2>Results</h2>
          <table className="results-table">
            <thead>
              <tr>
                <th>Measure</th>
                <th>Value</th>
                <th>Z-score</th>
                <th>Centile</th>
              </tr>
            </thead>
            <tbody>
              {MEASURES.map(({ key, label, unit }) => {
                const a = assessments[key];
                const v = values[key];
                return (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{v != null ? `${v.toFixed(1)} ${unit}` : '—'}</td>
                    <td className={a?.extreme ? 'z extreme' : 'z'}>
                      {a ? `${a.z >= 0 ? '+' : ''}${a.z.toFixed(2)}` : '—'}
                    </td>
                    <td>{a ? fmtCentile(a.centile) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {assessments.bmi?.method === 'extended-BMI' && (
            <p className="note">
              BMI ≥ 95th percentile: z-score &amp; centile use the <strong>CDC Extended BMI-for-age
              (2022)</strong> method so severe obesity is not compressed near the 99th centile.
            </p>
          )}
          {Object.values(assessments).some((a) => a?.extreme) && (
            <p className="note">
              ⚠ A value beyond ±3 SD on the LMS scale is an extrapolation — interpret extreme
              height / weight z-scores with caution.
            </p>
          )}
          {!ageValid && <p className="note">Enter sex, age and a measurement to see results.</p>}
        </section>

        <section className="panel chart-panel" aria-label="Growth chart">
          <div className="chart-head">
            <h2>Growth chart</h2>
            <div className="segmented small">
              {MEASURES.map((m) => (
                <button
                  key={m.key}
                  className={chartMeasure === m.key ? 'on' : ''}
                  onClick={() => setChartMeasure(m.key)}
                >
                  {m.key === 'bmi' ? 'BMI' : m.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
          <div ref={chartRef}>
            <GrowthChart
              title={`${measureMeta.label}-for-age`}
              unit={measureMeta.unit}
              xUnit={xUnit}
              minAge={minAge}
              maxAge={maxAge}
              curves={curves}
              points={chartPoints}
            />
          </div>
          <div className="chart-foot">
            <p className="chart-caption">
              {infantChart ? 'WHO standards, 0–2 years' : 'CDC reference, 2–20 years'} · {sex} ·
              centile curves 3–97
            </p>
            <div className="export-bar">
              <button onClick={onExportPng} disabled={!hasResults}>
                PNG
              </button>
              <button onClick={onExportPdf} disabled={!hasResults}>
                PDF
              </button>
              <button onClick={onExportCsv} disabled={!hasResults}>
                CSV
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <span>
          {APP_NAME} — clinical decision support for qualified clinicians. Not a substitute for
          clinical judgement.
        </span>
      </footer>
    </div>
  );
}
