import { useEffect, useMemo, useRef, useState } from 'react';
import {
  assess,
  bmiFrom,
  referenceCurves,
  ageMonthsFromDates,
  yearsToMonths,
  formatAge,
  midParentalHeight,
  heightVelocity,
  correctedAgeMonths,
  TERM_WEEKS,
  BOUNDARY_MONTHS,
  MAX_AGE_MONTHS,
} from './engine';
import type { Assessment, Measure, RefSet, Sex, Velocity } from './engine';
import { GrowthChart } from './components/GrowthChart';
import type { PlottedPoint, TargetBand, ChartMarker } from './components/GrowthChart';
import { exportChartPng, exportReportPdf, exportCsv } from './export/chartExport';
import type { CsvVisit, ReportMeta } from './export/chartExport';
import {
  loadPatients,
  savePatients,
  sortedVisits,
  uid,
} from './store/patients';
import type { Patient } from './store/patients';
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

function valueForMeasure(measure: Measure, h: number | null, w: number | null): number | null {
  if (measure === 'height') return h;
  if (measure === 'weight') return w;
  return h && w ? bmiFrom(w, h) : null;
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
  const [fatherH, setFatherH] = useState('');
  const [motherH, setMotherH] = useState('');
  const [boneAge, setBoneAge] = useState('');
  const [gestAge, setGestAge] = useState('');
  const [refSet, setRefSet] = useState<RefSet>('standard');
  const [chartMeasure, setChartMeasure] = useState<Measure>('height');
  const chartRef = useRef<HTMLDivElement>(null);

  // ---- patient records ----
  const [patients, setPatients] = useState<Patient[]>(() => loadPatients());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const selectedPatient = patients.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    savePatients(patients);
  }, [patients]);

  // when a patient is selected, drive sex/dob from the record
  useEffect(() => {
    if (selectedPatient) {
      setSex(selectedPatient.sex);
      setDob(selectedPatient.dob);
      setAgeMode('dob');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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

  // prematurity: corrected age is what we plot/score against, up to 24 months
  const gestWeeks = num(gestAge);
  const isPreterm = gestWeeks != null && gestWeeks < TERM_WEEKS;
  const corrected =
    isPreterm && ageMonths != null ? correctedAgeMonths(ageMonths, gestWeeks) : null;
  const effAge = corrected ?? ageMonths; // age used for z-scores & plotting

  const heightCm = num(height);
  const weightKg = num(weight);
  const bmiVal = heightCm && weightKg ? bmiFrom(weightKg, heightCm) : null;

  const values: Record<Measure, number | null> = {
    height: heightCm,
    weight: weightKg,
    bmi: bmiVal,
  };

  const ageValid = effAge != null && effAge >= 0 && effAge <= MAX_AGE_MONTHS;

  const assessments = useMemo(() => {
    const out: Partial<Record<Measure, Assessment>> = {};
    if (!ageValid || effAge == null) return out;
    for (const { key } of MEASURES) {
      const v = values[key];
      if (v == null) continue;
      const a = assess(key, sex, effAge, v, refSet);
      if (a) out[key] = a;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageValid, effAge, sex, refSet, heightCm, weightKg, bmiVal]);

  // longitudinal points: saved visits for a selected patient, else the live entry
  const chartPoints: PlottedPoint[] = useMemo(() => {
    if (selectedPatient) {
      return sortedVisits(selectedPatient)
        .map((v) => {
          const am = ageMonthsFromDates(new Date(selectedPatient.dob), new Date(v.date));
          const val = valueForMeasure(chartMeasure, v.heightCm, v.weightKg);
          return val != null && am >= 0 && am <= MAX_AGE_MONTHS
            ? ({ age: am, value: val } as PlottedPoint)
            : null;
        })
        .filter((p): p is PlottedPoint => p !== null);
    }
    if (!ageValid || effAge == null) return [];
    const v = values[chartMeasure];
    return v == null ? [] : [{ age: effAge, value: v }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatient, patients, chartMeasure, ageValid, effAge, heightCm, weightKg, bmiVal]);

  // chart window based on the most relevant age (latest visit, or the live entry)
  const refAge =
    selectedPatient && chartPoints.length
      ? Math.max(...chartPoints.map((p) => p.age))
      : effAge;
  const infantChart = refAge != null && refAge < BOUNDARY_MONTHS;
  const [minAge, maxAge] = infantChart ? [0, BOUNDARY_MONTHS] : [BOUNDARY_MONTHS, MAX_AGE_MONTHS];
  const xUnit: 'months' | 'years' = infantChart ? 'months' : 'years';
  const measureMeta = MEASURES.find((m) => m.key === chartMeasure)!;

  const curves = useMemo(
    () => referenceCurves(chartMeasure, sex, minAge, maxAge, undefined, refSet),
    [chartMeasure, sex, minAge, maxAge, refSet],
  );

  // mid-parental target height (Tanner, ±10 cm)
  const fatherCm = num(fatherH);
  const motherCm = num(motherH);
  const target = fatherCm && motherCm ? midParentalHeight(sex, fatherCm, motherCm) : null;

  // bone age: plot current height at the bone-age position on the height chart
  const boneAgeYears = num(boneAge);
  const boneMarker =
    boneAgeYears && heightCm ? { age: boneAgeYears * 12, value: heightCm, label: 'BA' } : null;

  // height velocity between consecutive visits of the selected patient
  const velocities = useMemo<Velocity[]>(() => {
    if (!selectedPatient) return [];
    const vs = sortedVisits(selectedPatient).filter((v) => v.heightCm != null);
    const out: Velocity[] = [];
    for (let i = 1; i < vs.length; i++) {
      const a1 = ageMonthsFromDates(new Date(selectedPatient.dob), new Date(vs[i - 1].date));
      const a2 = ageMonthsFromDates(new Date(selectedPatient.dob), new Date(vs[i].date));
      const vel = heightVelocity(vs[i - 1].heightCm!, a1, vs[i].heightCm!, a2);
      if (vel) out.push(vel);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatient, patients]);
  const latestVelocity = velocities.at(-1) ?? null;

  // overlays only make sense on the height chart for children
  const heightChart = chartMeasure === 'height' && !infantChart;
  const chartBand: TargetBand | undefined =
    heightChart && target
      ? { low: target.low, high: target.high, label: `Target ${target.mph.toFixed(0)} cm` }
      : undefined;
  const chartMarkers: ChartMarker[] | undefined =
    heightChart && boneMarker ? [boneMarker] : undefined;

  const ageOutOfRange = effAge != null && effAge > MAX_AGE_MONTHS;
  const hasResults = Object.keys(assessments).length > 0;
  const hasMeasurement = heightCm != null || weightKg != null;
  const segmentLabel = effAge != null && effAge < BOUNDARY_MONTHS ? 'WHO' : 'CDC';
  const sourceLabel = refSet === 'down' ? 'Down (Zemel)' : segmentLabel;
  const patientLocked = selectedPatient != null;

  const nameSlug = selectedPatient
    ? selectedPatient.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    : sex;
  const fileBase = `growth_${nameSlug}_${ageMode === 'dob' ? visit : today}`;

  // ---- record actions ----
  const createPatient = () => {
    if (!newName.trim() || !dob) return;
    const p: Patient = { id: uid(), name: newName.trim(), sex, dob, visits: [] };
    setPatients((prev) => [...prev, p]);
    setSelectedId(p.id);
    setNewName('');
  };

  const saveVisit = () => {
    if (!selectedPatient || !hasMeasurement) return;
    const v = { id: uid(), date: visit, heightCm, weightKg };
    setPatients((prev) =>
      prev.map((p) => (p.id === selectedPatient.id ? { ...p, visits: [...p.visits, v] } : p)),
    );
  };

  const deleteVisit = (visitId: string) => {
    if (!selectedPatient) return;
    setPatients((prev) =>
      prev.map((p) =>
        p.id === selectedPatient.id
          ? { ...p, visits: p.visits.filter((v) => v.id !== visitId) }
          : p,
      ),
    );
  };

  const deletePatient = () => {
    if (!selectedPatient) return;
    setPatients((prev) => prev.filter((p) => p.id !== selectedPatient.id));
    setSelectedId(null);
  };

  // ---- exports ----
  const getSvg = () => chartRef.current?.querySelector('svg') as SVGSVGElement | null;

  const buildReportMeta = (): ReportMeta => ({
    appName: APP_NAME,
    developer: DEVELOPER,
    sex: sex[0].toUpperCase() + sex.slice(1),
    ageLabel: ageMonths != null ? `${formatAge(ageMonths)} (${ageMonths.toFixed(2)} mo)` : '—',
    dateLabel:
      (selectedPatient ? `${selectedPatient.name} · ` : '') +
      (ageMode === 'dob' ? `DOB ${dob} · visit ${visit}` : 'Age entered directly'),
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

  const csvForVisit = (
    date: string,
    am: number,
    h: number | null,
    w: number | null,
    forSex: Sex,
    forRefSet: RefSet = 'standard',
  ): CsvVisit => {
    const bmi = h && w ? bmiFrom(w, h) : null;
    const aH = h != null ? assess('height', forSex, am, h, forRefSet) : null;
    const aW = w != null ? assess('weight', forSex, am, w, forRefSet) : null;
    const aB = bmi != null ? assess('bmi', forSex, am, bmi, forRefSet) : null;
    return {
      date,
      ageMonths: am,
      ageLabel: formatAge(am),
      sex: forSex,
      heightCm: h,
      weightKg: w,
      bmi,
      heightZ: aH?.z ?? null,
      heightCentile: aH?.centile ?? null,
      weightZ: aW?.z ?? null,
      weightCentile: aW?.centile ?? null,
      bmiZ: aB?.z ?? null,
      bmiCentile: aB?.centile ?? null,
      source: forRefSet === 'down' ? 'Down' : am < BOUNDARY_MONTHS ? 'WHO' : 'CDC',
    };
  };

  const onExportPng = () => {
    const svg = getSvg();
    if (svg) void exportChartPng(svg, `${fileBase}_${chartMeasure}.png`);
  };
  const onExportPdf = () => {
    const svg = getSvg();
    if (svg) void exportReportPdf(svg, buildReportMeta(), `${fileBase}.pdf`);
  };
  const onExportCsv = () => {
    const rows = selectedPatient
      ? sortedVisits(selectedPatient).map((v) =>
          csvForVisit(
            v.date,
            ageMonthsFromDates(new Date(selectedPatient.dob), new Date(v.date)),
            v.heightCm,
            v.weightKg,
            selectedPatient.sex,
          ),
        )
      : effAge != null
        ? [csvForVisit(ageMode === 'dob' ? visit : today, effAge, heightCm, weightKg, sex, refSet)]
        : [];
    if (rows.length) exportCsv(rows, `${fileBase}.csv`);
  };

  const canExport = hasResults || (selectedPatient != null && selectedPatient.visits.length > 0);

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
          <h2>Measurement</h2>

          <div className="field">
            <span className="field-label">Sex</span>
            <div className="segmented">
              <button
                className={sex === 'male' ? 'on' : ''}
                disabled={patientLocked}
                onClick={() => setSex('male')}
              >
                Male
              </button>
              <button
                className={sex === 'female' ? 'on' : ''}
                disabled={patientLocked}
                onClick={() => setSex('female')}
              >
                Female
              </button>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Reference chart</span>
            <div className="segmented">
              <button
                className={refSet === 'standard' ? 'on' : ''}
                onClick={() => setRefSet('standard')}
              >
                Standard
              </button>
              <button className={refSet === 'down' ? 'on' : ''} onClick={() => setRefSet('down')}>
                Down syndrome
              </button>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Age input</span>
            <div className="segmented">
              <button
                className={ageMode === 'dob' ? 'on' : ''}
                disabled={patientLocked}
                onClick={() => setAgeMode('dob')}
              >
                Date of birth
              </button>
              <button
                className={ageMode === 'age' ? 'on' : ''}
                disabled={patientLocked}
                onClick={() => setAgeMode('age')}
              >
                Enter age
              </button>
            </div>
          </div>

          {ageMode === 'dob' ? (
            <div className="grid2">
              <label>
                Date of birth
                <input
                  type="date"
                  value={dob}
                  max={visit}
                  disabled={patientLocked}
                  onChange={(e) => setDob(e.target.value)}
                />
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

          <label>
            Gestational age at birth (weeks — for preterm correction)
            <input
              type="number"
              step="1"
              min="22"
              max="42"
              value={gestAge}
              onChange={(e) => setGestAge(e.target.value)}
            />
          </label>

          <span className="field-label" style={{ marginTop: 4 }}>
            Genetic &amp; skeletal (optional)
          </span>
          <div className="grid3">
            <label>
              Father (cm)
              <input type="number" step="0.1" value={fatherH} onChange={(e) => setFatherH(e.target.value)} />
            </label>
            <label>
              Mother (cm)
              <input type="number" step="0.1" value={motherH} onChange={(e) => setMotherH(e.target.value)} />
            </label>
            <label>
              Bone age (y)
              <input type="number" step="0.1" value={boneAge} onChange={(e) => setBoneAge(e.target.value)} />
            </label>
          </div>

          {(target || (boneAgeYears && ageMonths != null)) && (
            <div className="tool-readout">
              {target && (
                <div>
                  Target height (MPH):{' '}
                  <strong>{target.mph.toFixed(1)} cm</strong> ({target.low.toFixed(0)}–
                  {target.high.toFixed(0)})
                </div>
              )}
              {boneAgeYears != null && ageMonths != null && (
                <div>
                  Bone age <strong>{boneAgeYears.toFixed(1)} y</strong> vs chronological{' '}
                  {formatAge(ageMonths)} ({(boneAgeYears - ageMonths / 12 >= 0 ? '+' : '') +
                    (boneAgeYears - ageMonths / 12).toFixed(1)}{' '}
                  y)
                </div>
              )}
            </div>
          )}

          <div className="age-readout">
            {ageMonths != null && (
              <>
                {corrected != null ? (
                  <>
                    Corrected age: <strong>{formatAge(corrected)}</strong> ({corrected.toFixed(2)} mo)
                    · chronological {formatAge(ageMonths)}
                  </>
                ) : (
                  <>
                    Age: <strong>{formatAge(ageMonths)}</strong> ({ageMonths.toFixed(2)} months)
                  </>
                )}
                <span className="src-chip">{sourceLabel}</span>
              </>
            )}
            {isPreterm && corrected == null && ageMonths != null && ageMonths > 24 && (
              <span className="hint"> · preterm correction not applied beyond 24 months</span>
            )}
            {ageOutOfRange && <span className="warn"> · beyond 20 y (out of chart range)</span>}
          </div>
        </section>

        <section className="panel records" aria-label="Patient records">
          <h2>Records</h2>
          <div className="field">
            <span className="field-label">Patient</span>
            <select
              className="select"
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value || null)}
            >
              <option value="">— Ad-hoc (no record) —</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sex[0].toUpperCase()}, {p.visits.length}v)
                </option>
              ))}
            </select>
          </div>

          {!selectedPatient ? (
            <div className="new-patient">
              <input
                type="text"
                placeholder="New patient name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button className="primary" onClick={createPatient} disabled={!newName.trim() || !dob}>
                Create
              </button>
              {!dob && <span className="hint">Set a date of birth to create a patient.</span>}
            </div>
          ) : (
            <>
              <div className="record-actions">
                <button className="primary" onClick={saveVisit} disabled={!hasMeasurement}>
                  Save visit
                </button>
                <button className="danger" onClick={deletePatient}>
                  Delete patient
                </button>
              </div>
              <table className="visits-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Age</th>
                    <th>Ht</th>
                    <th>Wt</th>
                    <th aria-label="delete" />
                  </tr>
                </thead>
                <tbody>
                  {sortedVisits(selectedPatient).map((v) => {
                    const am = ageMonthsFromDates(
                      new Date(selectedPatient.dob),
                      new Date(v.date),
                    );
                    return (
                      <tr key={v.id}>
                        <td>{v.date}</td>
                        <td>{formatAge(am)}</td>
                        <td>{v.heightCm ?? '—'}</td>
                        <td>{v.weightKg ?? '—'}</td>
                        <td>
                          <button className="link" onClick={() => deleteVisit(v.id)} title="Delete visit">
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {selectedPatient.visits.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">
                        No visits yet — enter measurements above and Save visit.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section className="panel results" aria-label="Results">
          <h2>Results {selectedPatient ? `· ${selectedPatient.name}` : ''}</h2>
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
          {latestVelocity && (
            <div className="velocity">
              <span className="field-label">Height velocity (latest interval)</span>
              <div>
                <strong>{latestVelocity.cmPerYear.toFixed(1)} cm/yr</strong> ·{' '}
                {formatAge(latestVelocity.fromAgeMonths)} → {formatAge(latestVelocity.toAgeMonths)} (
                {latestVelocity.intervalMonths.toFixed(1)} mo)
                {latestVelocity.intervalMonths < 6 && (
                  <span className="warn"> · interval &lt; 6 mo; interpret with caution</span>
                )}
              </div>
            </div>
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
              band={chartBand}
              markers={chartMarkers}
            />
          </div>
          <div className="chart-foot">
            <p className="chart-caption">
              {refSet === 'down'
                ? 'Down syndrome (Zemel 2015)'
                : infantChart
                  ? 'WHO standards, 0–2 years'
                  : 'CDC reference, 2–20 years'}{' '}
              · {sex} ·
              {selectedPatient ? ` ${chartPoints.length} visit(s)` : ' centile curves 3–97'}
            </p>
            <div className="export-bar">
              <button onClick={onExportPng} disabled={!canExport}>
                PNG
              </button>
              <button onClick={onExportPdf} disabled={!hasResults}>
                PDF
              </button>
              <button onClick={onExportCsv} disabled={!canExport}>
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
