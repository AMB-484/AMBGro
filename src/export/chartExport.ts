// Chart / report export: PNG (rasterised from the self-contained SVG), PDF
// (jsPDF clinical report), and CSV. All fully offline. jsPDF is loaded on demand
// (dynamic import) so it stays out of the initial bundle.

export interface ReportMeasurement {
  label: string;
  value: string;
  z: string;
  centile: string;
  source: string;
}

export interface ReportMeta {
  appName: string;
  developer: string;
  sex: string;
  ageLabel: string;
  dateLabel: string; // e.g. "DOB 2018-01-15 · visit 2026-07-06" or "Age entered directly"
  chartTitle: string;
  measurements: ReportMeasurement[];
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

export async function exportReportPdf(svg: SVGSVGElement, meta: ReportMeta, filename: string) {
  const { jsPDF } = await import('jspdf');
  const canvas = await renderChartCanvas(svg, 2.5);
  const png = canvas.toDataURL('image/png');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 50;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 18, 34);
  doc.text(meta.appName, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`by ${meta.developer}`, pageW - margin, y, { align: 'right' });
  y += 22;

  doc.setDrawColor(226, 228, 238);
  doc.line(margin, y, pageW - margin, y);
  y += 22;

  doc.setTextColor(40);
  doc.setFontSize(11);
  doc.text(`Sex: ${meta.sex}`, margin, y);
  doc.text(`Age: ${meta.ageLabel}`, margin + 150, y);
  y += 16;
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(meta.dateLabel, margin, y);
  y += 20;

  // chart image
  const imgW = pageW - margin * 2;
  const imgH = imgW * (canvas.height / canvas.width);
  doc.addImage(png, 'PNG', margin, y, imgW, imgH);
  y += imgH + 24;

  // results table
  doc.setFontSize(11);
  doc.setTextColor(15, 18, 34);
  doc.setFont('helvetica', 'bold');
  doc.text(meta.chartTitle, margin, y);
  y += 16;

  const cols = [margin, margin + 170, margin + 300, margin + 400];
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text('Measure', cols[0], y);
  doc.text('Value', cols[1], y);
  doc.text('Z-score', cols[2], y);
  doc.text('Centile', cols[3], y);
  y += 6;
  doc.setDrawColor(226, 228, 238);
  doc.line(margin, y, pageW - margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30);
  for (const m of meta.measurements) {
    doc.text(m.label, cols[0], y);
    doc.text(m.value, cols[1], y);
    doc.text(m.z, cols[2], y);
    doc.text(m.centile, cols[3], y);
    y += 16;
  }

  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(
    `Generated with ${meta.appName} by ${meta.developer}. Clinical decision support for qualified` +
      ' clinicians — not a substitute for clinical judgement.',
    margin,
    doc.internal.pageSize.getHeight() - 30,
    { maxWidth: pageW - margin * 2 },
  );

  doc.save(filename);
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
