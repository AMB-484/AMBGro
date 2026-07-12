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
  interpret,
  predictAdultHeight,
  assessPuberty,
  hasPubertyData,
  maxTesticularVol,
  tannerBadge,
  TESTIS_ONSET_ML,
  TERM_WEEKS,
  BOUNDARY_MONTHS,
  MAX_AGE_MONTHS,
} from './engine';
import type {
  Assessment,
  Maturity,
  Measure,
  PubertyAssessment,
  RefSet,
  Sex,
  Velocity,
} from './engine';
import { GrowthChart } from './components/GrowthChart';
import type { PlottedPoint, TargetBand, ChartMarker } from './components/GrowthChart';
import { PubertyPad } from './components/PubertyPad';
import { VelocityChart } from './components/VelocityChart';
import type { VelocityPoint, Milestone } from './components/VelocityChart';
import { exportChartPng, exportReportPdf, exportCsv } from './export/chartExport';
import type { CsvVisit, ReportMeta } from './export/chartExport';
import {
  loadPatients,
  savePatients,
  sortedVisits,
  uid,
  exportPatientsJson,
  parsePatientsJson,
  mergePatients,
} from './store/patients';
import type { Patient, Visit } from './store/patients';
import './App.css';

const APP_NAME = 'AMBGro';
const DEVELOPER = 'Dr. Awais Muhammad Butt';

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

const MATURITY_LABEL: Record<Maturity, string> = {
  average: 'average',
  accelerated: 'accelerated (advanced)',
  delayed: 'delayed (retarded)',
};

/** Chronological age (years) at a date, from date of birth. */
function ageYearsAt(dob: string, date: string): number {
  return ageMonthsFromDates(new Date(dob), new Date(date)) / 12;
}

/** Compact one-line pubertal summary for the visits table. */
function pubertySummary(sex: Sex, p?: PubertyAssessment): string {
  if (!p) return '';
  const parts: string[] = [];
  if (sex === 'male') {
    if (p.tannerGenitalia) parts.push(tannerBadge('genitalia', p.tannerGenitalia));
    const tv = maxTesticularVol(p);
    if (tv != null) parts.push(`${tv}mL`);
  } else {
    if (p.tannerBreast) parts.push(tannerBadge('breast', p.tannerBreast));
    if (p.menarcheAchieved) parts.push('M+');
  }
  if (p.tannerPubicHair) parts.push(tannerBadge('pubicHair', p.tannerPubicHair));
  return parts.join(' ');
}

/**
 * Effective (assessed/plotted) age of a saved visit: corrected for prematurity
 * when the patient has a preterm gestational age, else chronological. Keeps saved
 * records consistent with the live single-entry calculation.
 */
function visitAgeMonths(p: Patient, date: string): number {
  const chrono = ageMonthsFromDates(new Date(p.dob), new Date(date));
  if (p.gestWeeks != null && p.gestWeeks < TERM_WEEKS) {
    return correctedAgeMonths(chrono, p.gestWeeks);
  }
  return chrono;
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
  const [chartView, setChartView] = useState<'growth' | 'velocity'>('growth');
  const [puberty, setPuberty] = useState<PubertyAssessment>({});
  const chartRef = useRef<HTMLDivElement>(null);

  const patchPuberty = (patch: Partial<PubertyAssessment>) =>
    setPuberty((prev) => {
      const next = { ...prev, ...patch };
      // strip keys explicitly cleared to undefined so hasPubertyData stays honest
      for (const k of Object.keys(patch) as (keyof PubertyAssessment)[]) {
        if (patch[k] === undefined) delete next[k];
      }
      return next;
    });

  // ---- patient records ----
  const [patients, setPatients] = useState<Patient[]>(() => loadPatients());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [saveError, setSaveError] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const firstRun = useRef(true);
  const selectedPatient = patients.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    // Skip the initial mount so we don't rewrite storage before any change.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveError(!savePatients(patients));
  }, [patients]);

  // on any patient switch (including back to ad-hoc), clear the transient inputs so a
  // previous entry or context can't leak to the wrong child; then, if a patient is
  // selected, drive its stored clinical context from the record.
  useEffect(() => {
    setHeight('');
    setWeight('');
    setBoneAge('');
    setFatherH('');
    setMotherH('');
    setGestAge('');
    setPuberty({});
    setChartView('growth');
    if (selectedPatient) {
      setSex(selectedPatient.sex);
      setDob(selectedPatient.dob);
      setAgeMode('dob');
      setVisit(today);
      if (selectedPatient.gestWeeks != null) setGestAge(String(selectedPatient.gestWeeks));
      setRefSet(selectedPatient.refSet ?? 'standard');
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
  const hasMeasurement = heightCm != null || weightKg != null;

  const values: Record<Measure, number | null> = {
    height: heightCm,
    weight: weightKg,
    bmi: bmiVal,
  };

  const ageValid = effAge != null && effAge >= 0 && effAge <= MAX_AGE_MONTHS;

  // Live "preview" of the current entry, merged into the selected patient's saved
  // visits so height, velocity and pubertal milestones plot in real time — before
  // the visit is saved. Replaces any saved visit sharing the same date.
  const previewVisit: Visit | null =
    selectedPatient && (hasMeasurement || hasPubertyData(puberty))
      ? {
          id: '__preview__',
          date: visit,
          heightCm,
          weightKg,
          ...(hasPubertyData(puberty) ? { puberty } : {}),
        }
      : null;
  const effectiveVisits: Visit[] = selectedPatient
    ? [
        ...sortedVisits(selectedPatient).filter((v) => !previewVisit || v.date !== previewVisit.date),
        ...(previewVisit ? [previewVisit] : []),
      ].sort((a, b) => a.date.localeCompare(b.date))
    : [];

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

  // longitudinal points: the selected patient's visits (incl. the live preview),
  // else the live ad-hoc entry. Saved visits use corrected age for preterms.
  const chartPoints: PlottedPoint[] = selectedPatient
    ? effectiveVisits
        .map((v) => {
          const am = visitAgeMonths(selectedPatient, v.date);
          const val = valueForMeasure(chartMeasure, v.heightCm, v.weightKg);
          return val != null && am >= 0 && am <= MAX_AGE_MONTHS
            ? ({ age: am, value: val, preview: v.id === '__preview__' } as PlottedPoint)
            : null;
        })
        .filter((p): p is PlottedPoint => p !== null)
    : !ageValid || effAge == null
      ? []
      : values[chartMeasure] == null
        ? []
        : [{ age: effAge, value: values[chartMeasure]! }];

  // Choose the age window. Normally infant (0–2 y) or child (2–20 y). But when a
  // patient's saved visits straddle the 2-year boundary, use a continuous window
  // from birth so the whole trajectory shows on one WHO→CDC chart.
  const ptAges = chartPoints.map((p) => p.age);
  const spansBoundary =
    selectedPatient != null &&
    ptAges.some((a) => a < BOUNDARY_MONTHS) &&
    ptAges.some((a) => a >= BOUNDARY_MONTHS);
  const refAge = ptAges.length ? Math.max(...ptAges) : effAge;
  const infantChart = !spansBoundary && refAge != null && refAge < BOUNDARY_MONTHS;
  let minAge: number;
  let maxAge: number;
  let xUnit: 'months' | 'years';
  if (spansBoundary) {
    minAge = 0;
    maxAge = Math.min(MAX_AGE_MONTHS, Math.max(36, Math.ceil(Math.max(...ptAges) / 12) * 12));
    xUnit = 'years';
  } else if (infantChart) {
    [minAge, maxAge] = [0, BOUNDARY_MONTHS];
    xUnit = 'months';
  } else {
    [minAge, maxAge] = [BOUNDARY_MONTHS, MAX_AGE_MONTHS];
    xUnit = 'years';
  }
  const pointsOutOfWindow = chartPoints.filter((p) => p.age < minAge || p.age > maxAge).length;
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

  // EXPERIMENTAL: Bayley-Pinneau adult-height prediction (hand-transcribed tables).
  const hasBoneAgeInputs = boneAgeYears != null && heightCm != null && ageMonths != null;
  const adultPrediction =
    hasBoneAgeInputs && boneAgeYears && heightCm && ageMonths != null
      ? predictAdultHeight(sex, heightCm, ageMonths / 12, boneAgeYears)
      : null;
  const predictionInTarget =
    adultPrediction && target
      ? adultPrediction.predictedCm >= target.low && adultPrediction.predictedCm <= target.high
      : null;

  // height velocity between consecutive visits (incl. the live preview) of the patient
  const velocities: Velocity[] = (() => {
    if (!selectedPatient) return [];
    const vs = effectiveVisits.filter((v) => v.heightCm != null);
    const out: Velocity[] = [];
    for (let i = 1; i < vs.length; i++) {
      const a1 = visitAgeMonths(selectedPatient, vs[i - 1].date);
      const a2 = visitAgeMonths(selectedPatient, vs[i].date);
      const vel = heightVelocity(vs[i - 1].heightCm!, a1, vs[i].heightCm!, a2);
      if (vel) out.push(vel);
    }
    return out;
  })();
  const latestVelocity = velocities.at(-1) ?? null;

  // ---- puberty ----
  const chronoAgeYears = ageMonths != null ? ageMonths / 12 : null;
  const pubertyWarnings = assessPuberty(sex, chronoAgeYears, puberty);

  // velocity points (cm/yr) plotted at the midpoint age of each interval
  const velocityPoints: VelocityPoint[] = velocities.map((v) => ({
    ageYears: (v.fromAgeMonths + v.toAgeMonths) / 2 / 12,
    cmPerYear: v.cmPerYear,
  }));

  // pubertal milestones + menarche marker, from the selected patient's visits
  const firstAgeWhere = (pred: (p: PubertyAssessment) => boolean): number | null => {
    if (!selectedPatient) return null;
    for (const v of effectiveVisits) {
      if (v.puberty && pred(v.puberty)) return ageYearsAt(selectedPatient.dob, v.date);
    }
    return null;
  };
  const milestones: Milestone[] = [];
  let menarcheAgeYears: number | null = null;
  if (selectedPatient) {
    if (sex === 'male') {
      const tvOnset = firstAgeWhere((p) => (maxTesticularVol(p) ?? 0) >= TESTIS_ONSET_ML);
      if (tvOnset != null) milestones.push({ ageYears: tvOnset, label: 'TV≥4', tone: 'onset' });
      const g4 = firstAgeWhere((p) => (p.tannerGenitalia ?? 0) >= 4);
      if (g4 != null) milestones.push({ ageYears: g4, label: 'G4', tone: 'phv' });
      const g2 = firstAgeWhere((p) => (p.tannerGenitalia ?? 0) >= 2);
      if (g2 != null) milestones.push({ ageYears: g2, label: 'G2', tone: 'other' });
    } else {
      const b2 = firstAgeWhere((p) => (p.tannerBreast ?? 0) >= 2);
      if (b2 != null) milestones.push({ ageYears: b2, label: 'B2', tone: 'onset' });
      const b4 = firstAgeWhere((p) => (p.tannerBreast ?? 0) >= 4);
      if (b4 != null) milestones.push({ ageYears: b4, label: 'B4', tone: 'other' });
      for (const v of effectiveVisits) {
        const md = v.puberty?.menarcheDate;
        if (md) {
          menarcheAgeYears = ageYearsAt(selectedPatient.dob, `${md}-01`);
          break;
        }
      }
    }
  }
  const peakAgeYears = velocityPoints.length
    ? velocityPoints.reduce((b, p) => (p.cmPerYear > b.cmPerYear ? p : b), velocityPoints[0]).ageYears
    : null;
  let alignNote: string | null = null;
  if (peakAgeYears != null) {
    const ref =
      sex === 'male'
        ? milestones.find((m) => m.label === 'G4')
        : milestones.find((m) => m.label === 'B2');
    if (ref) {
      const d = Math.abs(peakAgeYears - ref.ageYears);
      alignNote =
        d <= 1.5
          ? `Peak height velocity (${peakAgeYears.toFixed(1)} y) aligns with ${ref.label} at ${ref.ageYears.toFixed(1)} y — as expected.`
          : `Peak height velocity (${peakAgeYears.toFixed(1)} y) is ${d.toFixed(1)} y from ${ref.label} (${ref.ageYears.toFixed(1)} y) — review pubertal tempo.`;
    }
  }
  const showVelocity = chartView === 'velocity' && selectedPatient != null;

  // plain-language interpretation flags (standard references only)
  const interpretations = MEASURES.map(({ key, label }) => {
    const a = assessments[key];
    if (!a || effAge == null) return null;
    const it = interpret(key, effAge, a.centile, refSet);
    return it ? { key, measure: label, text: it.label, tone: it.tone } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

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
  const canSaveVisit = hasMeasurement || hasPubertyData(puberty);
  const segmentLabel = effAge != null && effAge < BOUNDARY_MONTHS ? 'WHO' : 'CDC';
  const sourceLabel =
    refSet === 'down' ? 'Down (Zemel)' : refSet === 'turner' ? 'Turner (Isojima)' : segmentLabel;
  const patientLocked = selectedPatient != null;

  const nameSlug = selectedPatient
    ? selectedPatient.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    : sex;
  const fileBase = `growth_${nameSlug}_${ageMode === 'dob' ? visit : today}`;

  // ---- record actions ----
  const createPatient = () => {
    if (!newName.trim() || !dob) return;
    const p: Patient = {
      id: uid(),
      name: newName.trim(),
      sex,
      dob,
      gestWeeks: gestWeeks ?? null,
      refSet,
      visits: [],
    };
    setPatients((prev) => [...prev, p]);
    setSelectedId(p.id);
    setNewName('');
  };

  const saveVisit = () => {
    if (!selectedPatient || !canSaveVisit) return;
    const v: (typeof selectedPatient.visits)[number] = {
      id: uid(),
      date: visit,
      heightCm,
      weightKg,
      ...(hasPubertyData(puberty) ? { puberty: { ...puberty } } : {}),
    };
    setPatients((prev) =>
      prev.map((p) => (p.id === selectedPatient.id ? { ...p, visits: [...p.visits, v] } : p)),
    );
    setPuberty({}); // fresh pad for the next visit
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
      source:
        forRefSet === 'down'
          ? 'Down (Zemel)'
          : forRefSet === 'turner'
            ? 'Turner (Isojima)'
            : am < BOUNDARY_MONTHS
              ? 'WHO'
              : 'CDC',
    };
  };

  const onExportPng = () => {
    const svg = getSvg();
    if (!svg) return;
    const subtitle = showVelocity
      ? `Height velocity · ${sex}${selectedPatient ? ` · ${selectedPatient.name}` : ''}`
      : `${measureMeta.label}-for-age · ${sourceLabel} · ${sex}${selectedPatient ? ` · ${selectedPatient.name}` : ''}`;
    void exportChartPng(svg, `${fileBase}_${showVelocity ? 'velocity' : chartMeasure}.png`, {
      title: APP_NAME,
      byline: `by ${DEVELOPER}`,
      subtitle,
    });
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
            visitAgeMonths(selectedPatient, v.date),
            v.heightCm,
            v.weightKg,
            selectedPatient.sex,
            refSet,
          ),
        )
      : effAge != null
        ? [csvForVisit(ageMode === 'dob' ? visit : today, effAge, heightCm, weightKg, sex, refSet)]
        : [];
    if (rows.length) exportCsv(rows, `${fileBase}.csv`);
  };

  // ---- backup / restore (full patient database) ----
  const onExportData = () => {
    if (patients.length === 0) return;
    const blob = new Blob([exportPatientsJson(patients)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ambgro-backup-${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setImportMsg(`Backed up ${patients.length} patient record(s).`);
  };

  const onImportData = async (file: File) => {
    try {
      const incoming = parsePatientsJson(await file.text());
      const existingIds = new Set(patients.map((p) => p.id));
      const added = incoming.filter((p) => !existingIds.has(p.id)).length;
      const updated = incoming.length - added;
      setPatients((prev) => mergePatients(prev, incoming));
      setImportMsg(`Imported ${incoming.length} record(s): ${added} added, ${updated} updated.`);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : 'Could not read that backup file.');
    }
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
        <section className="panel inputs" aria-label="Measurement">
          <h2>Measurement</h2>

          <div className="field">
            <span className="field-label">Reference chart</span>
            <select
              className="select"
              value={refSet}
              onChange={(e) => setRefSet(e.target.value as RefSet)}
            >
              <option value="standard">Standard (WHO / CDC)</option>
              <option value="down">Down syndrome (Zemel 2015)</option>
              <option value="turner">Turner syndrome (Isojima, girls)</option>
            </select>
          </div>

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

          {adultPrediction && (
            <div className="tool-readout experimental">
              <div className="exp-badge">⚠ Experimental — not for clinical decisions</div>
              <div>
                Predicted adult height (Bayley–Pinneau):{' '}
                <strong>{adultPrediction.predictedCm.toFixed(1)} cm</strong> (
                {(adultPrediction.predictedCm / 2.54).toFixed(1)} in)
                {predictionInTarget != null && (
                  <span className={predictionInTarget ? 'ok' : 'warn'}>
                    {' '}
                    · {predictionInTarget ? 'within' : 'outside'} target
                  </span>
                )}
              </div>
              <div className="exp-detail">
                {MATURITY_LABEL[adultPrediction.maturity]} skeletal maturity ·{' '}
                {adultPrediction.pct.toFixed(1)}% of adult height attained at bone age{' '}
                {adultPrediction.skeletalAgeYears.toFixed(1)} y. Tables hand-transcribed &amp;
                unvalidated.
              </div>
            </div>
          )}
          {hasBoneAgeInputs && !adultPrediction && (
            <p className="hint">
              Bayley–Pinneau: bone age {boneAgeYears?.toFixed(1)} y is outside the tabulated range
              for this maturity category.
            </p>
          )}
        </section>

        <section className="panel patient" aria-label="Patient">
          <h2>Patient</h2>

          {saveError && (
            <p className="banner-error">
              ⚠ Records could not be saved to this device (storage full or disabled). Export a backup
              to avoid losing data.
            </p>
          )}

          <div className="field">
            <span className="field-label">Record</span>
            <select
              className="select"
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value || null)}
            >
              <option value="">— Ad-hoc (one-time, no record) —</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sex[0].toUpperCase()}, {p.visits.length}v)
                </option>
              ))}
            </select>
          </div>

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

          {!selectedPatient ? (
            <div className="new-patient">
              <input
                type="text"
                placeholder="New patient name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button className="primary" onClick={createPatient} disabled={!newName.trim() || !dob}>
                Create record
              </button>
              {!dob && <span className="hint">Enter a date of birth above to keep a tracked record.</span>}
            </div>
          ) : (
            <>
              <div className="record-actions">
                <button className="primary" onClick={saveVisit} disabled={!canSaveVisit}>
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
                    <th>Pub.</th>
                    <th aria-label="delete" />
                  </tr>
                </thead>
                <tbody>
                  {sortedVisits(selectedPatient).map((v) => {
                    const am = visitAgeMonths(selectedPatient, v.date);
                    return (
                      <tr key={v.id}>
                        <td>{v.date}</td>
                        <td>{formatAge(am)}</td>
                        <td>{v.heightCm ?? '—'}</td>
                        <td>{v.weightKg ?? '—'}</td>
                        <td className="pub-cell">{pubertySummary(selectedPatient.sex, v.puberty) || '—'}</td>
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
                      <td colSpan={6} className="muted">
                        No visits yet — enter a measurement, then Save visit.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}

          <div className="backup-bar">
            <button onClick={onExportData} disabled={patients.length === 0} title="Download all records as a JSON backup">
              Export data
            </button>
            <button onClick={() => importRef.current?.click()} title="Restore records from a backup file">
              Import data
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportData(f);
                e.target.value = '';
              }}
            />
          </div>
          {importMsg && <p className="hint" role="status">{importMsg}</p>}
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
          {interpretations.length > 0 && (
            <div className="interp" aria-label="Interpretation">
              {interpretations.map((f) => (
                <span key={f.key} className={`interp-chip ${f.tone}`} title={f.measure}>
                  {f.text}
                </span>
              ))}
            </div>
          )}
          {refSet === 'turner' && (
            <p className="note">
              Turner reference: <strong>height-for-age only</strong>, girls, ages 1–18 y (Isojima
              et al. 2010).
              {sex === 'male' && ' Turner syndrome (45,X) affects girls — select Female for results.'}
            </p>
          )}
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
            <h2>{showVelocity ? 'Height velocity' : 'Growth chart'}</h2>
            <div className="chart-toggles">
              {selectedPatient && (
                <div className="segmented small">
                  <button
                    className={!showVelocity ? 'on' : ''}
                    onClick={() => setChartView('growth')}
                  >
                    Growth
                  </button>
                  <button
                    className={showVelocity ? 'on' : ''}
                    onClick={() => setChartView('velocity')}
                  >
                    Velocity
                  </button>
                </div>
              )}
              {!showVelocity && (
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
              )}
            </div>
          </div>
          <div ref={chartRef}>
            {showVelocity ? (
              <VelocityChart
                points={velocityPoints}
                milestones={milestones}
                menarcheAgeYears={menarcheAgeYears}
              />
            ) : (
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
            )}
          </div>
          <div className="chart-foot">
            {showVelocity ? (
              <>
                <p className="chart-caption">
                  {sex} · {velocityPoints.length} interval(s) · milestones from staged visits
                </p>
                {alignNote && <p className="note">{alignNote}</p>}
                {milestones.length === 0 && menarcheAgeYears == null && (
                  <p className="note">
                    Stage a few visits (Puberty assessment below) to overlay milestones here.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="chart-caption">
                  {refSet === 'down'
                    ? 'Down syndrome (Zemel 2015)'
                    : refSet === 'turner'
                      ? 'Turner syndrome (Isojima 2010)'
                      : spansBoundary
                        ? 'WHO → CDC, 0–20 years'
                        : infantChart
                          ? 'WHO standards, 0–2 years'
                          : 'CDC reference, 2–20 years'}{' '}
                  · {sex} ·
                  {selectedPatient ? ` ${chartPoints.length} visit(s)` : ' centile curves 3–97'}
                </p>
                {curves.every((c) => c.points.length === 0) && (
                  <p className="note">
                    No reference curve for this measure/sex/age in the selected chart.
                  </p>
                )}
                {pointsOutOfWindow > 0 && (
                  <p className="note">
                    {pointsOutOfWindow} visit(s) fall outside this age range and aren't shown on this
                    chart.
                  </p>
                )}
              </>
            )}
            <div className="export-bar">
              <button onClick={onExportPng} disabled={!canExport && !showVelocity}>
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

        <section className="panel puberty" aria-label="Puberty assessment">
          <div className="chart-head">
            <h2>Puberty assessment {selectedPatient ? `· ${selectedPatient.name}` : ''}</h2>
            {chronoAgeYears != null && (
              <span className="src-chip">chrono {chronoAgeYears.toFixed(1)} y</span>
            )}
          </div>

          <PubertyPad sex={sex} value={puberty} onChange={patchPuberty} />

          {pubertyWarnings.length > 0 && (
            <div className="puberty-warnings" role="status">
              {pubertyWarnings.map((w, i) => (
                <div key={i} className={`pwarn ${w.severity}`}>
                  <span aria-hidden="true">{w.severity === 'warn' ? '⚠' : 'ℹ'}</span> {w.text}
                </div>
              ))}
            </div>
          )}

          <p className="note">
            {selectedPatient
              ? 'Staged fields are saved with the visit (Save visit) and overlaid on the Velocity chart.'
              : 'Select or create a patient to save this assessment and build a pubertal trajectory.'}{' '}
            Staging uses Tanner criteria; SPL norms: Feldman &amp; Smith 1975 (verify before clinical
            use).
          </p>
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
