// Chart / report export: PNG (rasterised from the self-contained SVG), PDF
// (jsPDF clinical report), and CSV. All fully offline. jsPDF is loaded on demand
// (dynamic import) so it stays out of the initial bundle.

// ---- professional multi-page growth report ----

/** A single measured value with its centile, shown stacked in a table cell. */
export interface ReportCell {
  value: string; // e.g. "155.0"
  centile?: string; // e.g. "58th"
}

/** One visit = one column of the per-visit table. */
export interface ReportVisitColumn {
  date: string;
  ageLabel: string;
  height?: ReportCell;
  weight?: ReportCell;
  bmi?: ReportCell;
  velocity?: string; // cm/yr from the previous visit (blank on the first)
  /** Puberty parameter values keyed by the same keys as GrowthReport.pubertyRows. */
  puberty: Record<string, string>;
}

/** Once-recorded demographics shown at the head of the report. */
export interface ReportDemographics {
  name: string;
  mrn?: string;
  guardianName?: string;
  sex: string;
  dobLabel: string; // "2011-07-01" or "Age entered directly"
  ageLabel: string; // age at the latest visit
  fatherHeight?: string; // "180 cm"
  motherHeight?: string;
  mph?: string; // "179.0 cm (169–189)"
  gestation?: string; // "34 wk" (preterm) — omitted at term
  reference: string; // "WHO / CDC", "Down (Zemel)", …
}

/** Sex-specific puberty rows, in display order. */
export interface ReportPubertyRow {
  key: string;
  label: string;
}

export interface GrowthReport {
  appName: string;
  developer: string;
  demographics: ReportDemographics;
  visits: ReportVisitColumn[];
  pubertyRows: ReportPubertyRow[];
}

/** The four report charts as live SVG elements (rasterised at export time). */
export interface ReportChartSvgs {
  height?: SVGSVGElement | null;
  weight?: SVGSVGElement | null;
  bmi?: SVGSVGElement | null;
  velocity?: SVGSVGElement | null;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Rasterise an SVG element to a canvas at `scale`x resolution, on white. */
function renderChartCanvas(svg: SVGSVGElement, scale = 2): Promise<HTMLCanvasElement> {
  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : svg.clientWidth || 840;
  const h = vb && vb.height ? vb.height : svg.clientHeight || 560;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const svgText = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        reject(new Error('no 2d context'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(svgUrl);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('failed to rasterise SVG'));
    };
    img.src = svgUrl;
  });
}

export interface ExportHeader {
  title: string; // e.g. "AMBGro"
  byline: string; // e.g. "by Dr. Awais Muhammad Butt"
  subtitle?: string; // chart context, e.g. "Height-for-age · CDC · male · Jane Doe"
}

/** Return a new canvas: `header` band drawn above the chart on a white strip. */
function composeWithHeader(
  chart: HTMLCanvasElement,
  header: ExportHeader,
  scale: number,
): HTMLCanvasElement {
  const padX = 16 * scale;
  const headerH = (header.subtitle ? 60 : 44) * scale;
  const out = document.createElement('canvas');
  out.width = chart.width;
  out.height = chart.height + headerH;
  const ctx = out.getContext('2d');
  if (!ctx) return chart;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);

  const titleY = 26 * scale;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#0f1222';
  ctx.font = `700 ${20 * scale}px system-ui, 'Segoe UI', Roboto, sans-serif`;
  ctx.fillText(header.title, padX, titleY);
  const titleW = ctx.measureText(header.title).width;

  ctx.fillStyle = '#6b6375';
  ctx.font = `${12 * scale}px system-ui, 'Segoe UI', Roboto, sans-serif`;
  ctx.fillText(header.byline, padX + titleW + 8 * scale, titleY);

  if (header.subtitle) {
    ctx.fillText(header.subtitle, padX, titleY + 18 * scale);
  }

  ctx.strokeStyle = '#e2e4ee';
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.moveTo(0, headerH - scale);
  ctx.lineTo(out.width, headerH - scale);
  ctx.stroke();

  ctx.drawImage(chart, 0, headerH);
  return out;
}

export async function exportChartPng(svg: SVGSVGElement, filename: string, header?: ExportHeader) {
  const scale = 2.5;
  const chart = await renderChartCanvas(svg, scale);
  const canvas = header ? composeWithHeader(chart, header, scale) : chart;
  await new Promise<void>((resolve) =>
    canvas.toBlob((blob) => {
      if (blob) download(blob, filename);
      resolve();
    }, 'image/png'),
  );
}

/**
 * Rasterise an SVG to a JPEG data URL (on the white chart background), returning its
 * natural aspect ratio (h/w). JPEG keeps the embedded charts small — a lossless PNG
 * of these ~1500 px charts bloats the PDF to tens of MB; at quality 0.92 the line art
 * stays crisp while the whole report lands well under a megabyte.
 */
async function svgToImg(svg: SVGSVGElement, scale = 2): Promise<{ data: string; aspect: number }> {
  const canvas = await renderChartCanvas(svg, scale);
  return { data: canvas.toDataURL('image/jpeg', 0.92), aspect: canvas.height / canvas.width };
}

const INK = { head: [15, 18, 34], body: [40, 42, 54], muted: [120, 118, 130], rule: [214, 217, 228] };
const ACCENT: [number, number, number] = [37, 99, 235];

/**
 * Multi-page clinical growth report: height chart + demographics + per-visit table
 * (values with centiles) on page 1, the remaining charts on a following page, and
 * extra pages when a patient has more visits than fit across the table.
 */
export async function exportGrowthReportPdf(
  report: GrowthReport,
  svgs: ReportChartSvgs,
  filename: string,
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentR = pageW - margin;

  // rasterise the charts up front (async) so the synchronous layout below is simple
  const heightImg = svgs.height ? await svgToImg(svgs.height) : null;
  const weightImg = svgs.weight ? await svgToImg(svgs.weight) : null;
  const bmiImg = svgs.bmi ? await svgToImg(svgs.bmi) : null;
  const velocityImg = svgs.velocity ? await svgToImg(svgs.velocity) : null;

  const setInk = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);

  const pageHeader = (subtitle: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    setInk(INK.head);
    doc.text(report.appName, margin, 44);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setInk(INK.muted);
    doc.text(subtitle.toUpperCase(), contentR, 38, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`by ${report.developer}`, contentR, 50, { align: 'right' });
    doc.setDrawColor(INK.rule[0], INK.rule[1], INK.rule[2]);
    doc.setLineWidth(0.8);
    doc.line(margin, 58, contentR, 58);
  };

  // ---------- page 1: height chart + demographics + first table chunk ----------
  pageHeader('Growth Report');

  // square height chart, top-left
  const chartX = margin;
  const chartY = 72;
  const chartSize = 300;
  if (heightImg) {
    doc.addImage(heightImg.data, 'JPEG', chartX, chartY, chartSize, chartSize);
  } else {
    doc.setDrawColor(INK.rule[0], INK.rule[1], INK.rule[2]);
    doc.rect(chartX, chartY, chartSize, chartSize);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setInk(INK.muted);
  doc.text('HEIGHT / LENGTH-FOR-AGE', chartX, chartY + chartSize + 12);

  // demographics, top-right
  const dx = chartX + chartSize + 16;
  const dRight = contentR;
  let dy = chartY + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setInk(ACCENT);
  doc.text('PATIENT', dx, dy);
  dy += 14;
  const demoLine = (label: string, value: string) => {
    if (!value) return;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setInk(INK.muted);
    doc.text(label.toUpperCase(), dx, dy);
    dy += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    setInk(INK.body);
    const lines = doc.splitTextToSize(value, dRight - dx);
    doc.text(lines, dx, dy);
    dy += 11 * lines.length + 4;
  };
  const d = report.demographics;
  demoLine('Name', d.name);
  demoLine('Record no.', d.mrn ?? '');
  demoLine('Father / guardian', d.guardianName ?? '');
  demoLine('Sex', d.sex);
  demoLine('Date of birth', d.dobLabel);
  demoLine('Age (latest visit)', d.ageLabel);
  const parents = [d.fatherHeight && `F ${d.fatherHeight}`, d.motherHeight && `M ${d.motherHeight}`]
    .filter(Boolean)
    .join('  ·  ');
  demoLine('Parent heights', parents);
  demoLine('Target height (MPH)', d.mph ?? '');
  demoLine('Gestation', d.gestation ?? '');
  demoLine('Reference', d.reference);

  // ---- per-visit table ----
  const MAX_COLS = 6;
  const paramColW = 118;
  const tableTop = Math.max(chartY + chartSize + 28, dy + 8);
  const rows = buildRowDefs(report);

  let firstChunkBottom = tableTop;
  const chunks: ReportVisitColumn[][] = [];
  for (let i = 0; i < report.visits.length; i += MAX_COLS) {
    chunks.push(report.visits.slice(i, i + MAX_COLS));
  }
  if (chunks.length === 0) chunks.push([]);

  chunks.forEach((chunk, ci) => {
    let top: number;
    if (ci === 0) {
      top = tableTop;
    } else {
      doc.addPage();
      pageHeader('Growth Report — visits continued');
      top = 74;
    }
    const bottom = drawVisitTable(
      doc,
      chunk,
      rows,
      margin,
      contentR,
      paramColW,
      top,
      pageH - 48,
      setInk,
    );
    if (ci === 0) firstChunkBottom = bottom;
  });

  // note under the first table if the trajectory has no saved visits
  if (report.visits.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    setInk(INK.muted);
    doc.text('No saved visits for this patient yet.', margin, firstChunkBottom + 16);
  }

  // ---------- charts page(s): weight, BMI, velocity ----------
  const extraCharts: { title: string; img: { data: string; aspect: number } }[] = [];
  if (weightImg) extraCharts.push({ title: 'WEIGHT-FOR-AGE', img: weightImg });
  if (bmiImg) extraCharts.push({ title: 'BMI-FOR-AGE', img: bmiImg });

  if (extraCharts.length) {
    doc.addPage();
    pageHeader('Growth Report — charts');
    let cy = 78;
    const cw = Math.min(contentR - margin, 500);
    const cx = margin;
    for (const ec of extraCharts) {
      const ch = cw * ec.img.aspect;
      if (cy + ch + 20 > pageH - 40) {
        doc.addPage();
        pageHeader('Growth Report — charts');
        cy = 78;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      setInk(INK.muted);
      doc.text(ec.title, cx, cy);
      cy += 8;
      doc.addImage(ec.img.data, 'JPEG', cx, cy, cw, ch);
      cy += ch + 26;
    }
  }

  if (velocityImg) {
    doc.addPage();
    pageHeader('Growth Report — height velocity');
    const cw = Math.min(contentR - margin, 500);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setInk(INK.muted);
    doc.text('HEIGHT VELOCITY (cm/year)', margin, 78);
    doc.addImage(velocityImg.data, 'JPEG', margin, 86, cw, cw * velocityImg.aspect);
  }

  // ---------- footers: page numbers + disclaimer on every page ----------
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(INK.rule[0], INK.rule[1], INK.rule[2]);
    doc.setLineWidth(0.6);
    doc.line(margin, pageH - 34, contentR, pageH - 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setInk(INK.muted);
    doc.text(
      `${report.appName} by ${report.developer} — clinical decision support for qualified clinicians; not a substitute for clinical judgement.`,
      margin,
      pageH - 22,
      { maxWidth: contentR - margin - 70 },
    );
    doc.text(`Page ${p} of ${total}`, contentR, pageH - 22, { align: 'right' });
  }

  doc.save(filename);
}

/** Row definitions for the per-visit table, in display order (measure rows carry centiles). */
function buildRowDefs(report: GrowthReport): TableRow[] {
  const rows: TableRow[] = [
    { label: 'Age', kind: 'text', get: (v) => ({ value: v.ageLabel }) },
    { label: 'Height / length (cm)', kind: 'measure', get: (v) => v.height },
    { label: 'Weight (kg)', kind: 'measure', get: (v) => v.weight },
    { label: 'BMI (kg/m²)', kind: 'measure', get: (v) => v.bmi },
    { label: 'Height velocity (cm/yr)', kind: 'text', get: (v) => ({ value: v.velocity ?? '—' }) },
  ];
  if (report.pubertyRows.length) {
    rows.push({ label: 'PUBERTY', kind: 'section', get: () => ({ value: '' }) });
    for (const pr of report.pubertyRows) {
      rows.push({ label: pr.label, kind: 'text', get: (v) => ({ value: v.puberty[pr.key] ?? '—' }) });
    }
  }
  return rows;
}

interface TableRow {
  label: string;
  kind: 'measure' | 'text' | 'section';
  get: (v: ReportVisitColumn) => ReportCell | undefined;
}

/** Draw the parameter × visit table; returns the y just below it. Never draws a chart. */
function drawVisitTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  visits: ReportVisitColumn[],
  rows: TableRow[],
  left: number,
  right: number,
  paramColW: number,
  top: number,
  maxY: number,
  setInk: (c: number[]) => void,
): number {
  const nCols = Math.max(visits.length, 1);
  const colW = (right - (left + paramColW)) / nCols;
  const colX = (i: number) => left + paramColW + i * colW;

  // header: visit dates
  let y = top;
  doc.setDrawColor(INK.rule[0], INK.rule[1], INK.rule[2]);
  doc.setLineWidth(0.6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setInk(INK.head);
  doc.text('Parameter', left, y + 9);
  visits.forEach((v, i) => {
    doc.text(v.date, colX(i) + 4, y + 9);
  });
  y += 15;
  doc.line(left, y, right, y);
  y += 4;

  for (const row of rows) {
    if (row.kind === 'section') {
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setInk(ACCENT);
      doc.text(row.label, left, y + 8);
      y += 13;
      doc.setDrawColor(INK.rule[0], INK.rule[1], INK.rule[2]);
      doc.line(left, y, right, y);
      y += 3;
      continue;
    }
    const isMeasure = row.kind === 'measure';
    const rowH = isMeasure ? 22 : 15;
    if (y + rowH > maxY) break; // safety — chunks keep us within a page in practice

    // label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setInk(INK.body);
    doc.text(row.label, left, y + 9);

    // cells
    visits.forEach((v, i) => {
      const cell = row.get(v);
      const cx = colX(i) + 4;
      if (!cell || cell.value === '') {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        setInk(INK.muted);
        doc.text('—', cx, y + 9);
        return;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isMeasure ? 9 : 8);
      setInk(INK.head);
      doc.text(cell.value, cx, y + 9);
      if (isMeasure && cell.centile) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        setInk(INK.muted);
        doc.text(`${cell.centile} %ile`, cx, y + 18);
      }
    });

    y += rowH;
    doc.setDrawColor(238, 240, 246);
    doc.setLineWidth(0.4);
    doc.line(left, y - 2, right, y - 2);
  }
  return y;
}

export interface CsvVisit {
  date: string;
  ageMonths: number;
  ageLabel: string;
  sex: string;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  heightZ: number | null;
  heightCentile: number | null;
  weightZ: number | null;
  weightCentile: number | null;
  bmiZ: number | null;
  bmiCentile: number | null;
  source: string;
}

const CSV_HEADER = [
  'date',
  'age_months',
  'age',
  'sex',
  'height_cm',
  'weight_kg',
  'bmi',
  'height_z',
  'height_centile',
  'weight_z',
  'weight_centile',
  'bmi_z',
  'bmi_centile',
  'source',
];

function cell(v: string | number | null, digits?: number): string {
  if (v == null) return '';
  const s = typeof v === 'number' && digits != null ? v.toFixed(digits) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(visits: CsvVisit[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const v of visits) {
    lines.push(
      [
        cell(v.date),
        cell(v.ageMonths, 2),
        cell(v.ageLabel),
        cell(v.sex),
        cell(v.heightCm, 1),
        cell(v.weightKg, 2),
        cell(v.bmi, 2),
        cell(v.heightZ, 2),
        cell(v.heightCentile, 1),
        cell(v.weightZ, 2),
        cell(v.weightCentile, 1),
        cell(v.bmiZ, 2),
        cell(v.bmiCentile, 1),
        cell(v.source),
      ].join(','),
    );
  }
  return lines.join('\n');
}

export function exportCsv(visits: CsvVisit[], filename: string) {
  download(new Blob([buildCsv(visits)], { type: 'text/csv;charset=utf-8' }), filename);
}
