// Self-contained SVG growth chart: centile reference curves + plotted patient
// point(s). No charting library — full control and fully offline-capable.

import type { ReferenceCurve } from '../engine';

export interface PlottedPoint {
  age: number; // months
  value: number;
  label?: string;
}

export interface TargetBand {
  low: number;
  high: number;
  label: string;
}

export interface ChartMarker {
  age: number; // months
  value: number;
  label: string;
}

interface Props {
  title: string;
  unit: string;
  xUnit: 'months' | 'years';
  minAge: number; // months
  maxAge: number; // months
  curves: ReferenceCurve[];
  points: PlottedPoint[];
  band?: TargetBand; // e.g. mid-parental target height range
  markers?: ChartMarker[]; // e.g. height plotted at bone age
}

const W = 840;
const H = 560;
const M = { top: 28, right: 54, bottom: 46, left: 58 };
const plotW = W - M.left - M.right;
const plotH = H - M.top - M.bottom;

// Styles are embedded in the SVG (with literal colours, not CSS variables) so the
// chart is fully self-contained and rasterises correctly when exported to PNG/PDF.
const CHART_CSS = `
svg { background: #ffffff; }
text { font-family: system-ui, 'Segoe UI', Roboto, sans-serif; }
.plot-bg { fill: #ffffff; stroke: #e2e4ee; }
.grid { stroke: #eef0f6; stroke-width: 1; }
.axis-label { fill: #6b6375; font-size: 11px; }
.y-label { text-anchor: end; dominant-baseline: middle; }
.x-label { text-anchor: middle; }
.axis-title { fill: #6b6375; font-size: 12px; text-anchor: middle; font-weight: 500; }
.curve { fill: none; stroke: #9aa4b8; stroke-width: 1.3; }
.curve-median { stroke: #1f2937; stroke-width: 1.8; }
.curve-outer { stroke: #dc2626; stroke-width: 1.3; }
.centile-label { fill: #6b6375; font-size: 10px; dominant-baseline: middle; }
.patient-line { fill: none; stroke: #2563eb; stroke-width: 2; }
.patient-point { fill: #2563eb; stroke: #ffffff; stroke-width: 1.5; }
.chart-title { fill: #0f1222; font-size: 14px; font-weight: 600; }
.target-band { fill: rgba(22, 163, 74, 0.10); }
.target-line { stroke: #16a34a; stroke-width: 1; stroke-dasharray: 4 3; }
.target-label { fill: #15803d; font-size: 10px; font-weight: 600; }
.bone-marker { fill: #ffffff; stroke: #a855f7; stroke-width: 2; }
.bone-label { fill: #7e22ce; font-size: 10px; font-weight: 600; }
`;

function niceTicks(min: number, max: number, target = 7): number[] {
  const span = max - min || 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

export function GrowthChart({
  title,
  unit,
  xUnit,
  minAge,
  maxAge,
  curves,
  points,
  band,
  markers,
}: Props) {
  // value range across all curves + patient points, with padding
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const c of curves) {
    for (const p of c.points) {
      if (p.age < minAge || p.age > maxAge) continue;
      if (p.value < yMin) yMin = p.value;
      if (p.value > yMax) yMax = p.value;
    }
  }
  for (const p of points) {
    if (p.value < yMin) yMin = p.value;
    if (p.value > yMax) yMax = p.value;
  }
  for (const mk of markers ?? []) {
    if (mk.value < yMin) yMin = mk.value;
    if (mk.value > yMax) yMax = mk.value;
  }
  if (band) {
    if (band.low < yMin) yMin = band.low;
    if (band.high > yMax) yMax = band.high;
  }
  if (!Number.isFinite(yMin)) {
    yMin = 0;
    yMax = 1;
  }
  const pad = (yMax - yMin) * 0.05 || 1;
  yMin -= pad;
  yMax += pad;

  const xScale = (age: number) => M.left + ((age - minAge) / (maxAge - minAge)) * plotW;
  const yScale = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  // Tick every 3 months on infant charts; on year charts use 1-year ticks for
  // short spans (e.g. a longitudinal series crossing age 2) and 2-year otherwise.
  const xStep = xUnit === 'years' ? (maxAge - minAge <= 60 ? 12 : 24) : 3;
  const xTickVals: number[] = [];
  for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge + 1e-9; a += xStep) xTickVals.push(a);
  const yTicks = niceTicks(yMin, yMax, 8);

  // Only plot patient points that fall within the displayed age window, so a
  // measurement on the other side of the WHO/CDC boundary can't render outside
  // the plot frame.
  const visiblePoints = points.filter((p) => p.age >= minAge && p.age <= maxAge);

  const pathFor = (curve: ReferenceCurve) =>
    curve.points
      .filter((p) => p.age >= minAge && p.age <= maxAge)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.age).toFixed(1)},${yScale(p.value).toFixed(1)}`)
      .join(' ');

  const curveClass = (centile: number) =>
    centile === 50 ? 'curve curve-median' : centile <= 3 || centile >= 97 ? 'curve curve-outer' : 'curve';

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        className="chart-svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        <style>{CHART_CSS}</style>
        {/* plot frame */}
        <rect x={M.left} y={M.top} width={plotW} height={plotH} className="plot-bg" />

        {/* mid-parental target band (drawn behind curves) */}
        {band && (
          <g>
            <rect
              x={M.left}
              y={yScale(band.high)}
              width={plotW}
              height={yScale(band.low) - yScale(band.high)}
              className="target-band"
            />
            <line x1={M.left} x2={M.left + plotW} y1={yScale(band.low)} y2={yScale(band.low)} className="target-line" />
            <line x1={M.left} x2={M.left + plotW} y1={yScale(band.high)} y2={yScale(band.high)} className="target-line" />
            <text x={M.left + plotW - 4} y={yScale(band.high) - 4} textAnchor="end" className="target-label">
              {band.label}
            </text>
          </g>
        )}

        {/* y gridlines + labels */}
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={M.left} x2={M.left + plotW} y1={yScale(v)} y2={yScale(v)} className="grid" />
            <text x={M.left - 8} y={yScale(v)} className="axis-label y-label">
              {v}
            </text>
          </g>
        ))}

        {/* x gridlines + labels */}
        {xTickVals.map((a) => (
          <g key={`x${a}`}>
            <line x1={xScale(a)} x2={xScale(a)} y1={M.top} y2={M.top + plotH} className="grid" />
            <text x={xScale(a)} y={M.top + plotH + 18} className="axis-label x-label">
              {xUnit === 'years' ? a / 12 : a}
            </text>
          </g>
        ))}

        {/* centile curves + right-edge labels */}
        {curves.map((c) => {
          const last = c.points.filter((p) => p.age <= maxAge).at(-1);
          return (
            <g key={c.centile}>
              <path d={pathFor(c)} className={curveClass(c.centile)} fill="none" />
              {last && (
                <text x={M.left + plotW + 6} y={yScale(last.value)} className="centile-label">
                  {c.label}
                </text>
              )}
            </g>
          );
        })}

        {/* patient longitudinal line */}
        {visiblePoints.length > 1 && (
          <path
            d={visiblePoints
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.age).toFixed(1)},${yScale(p.value).toFixed(1)}`)
              .join(' ')}
            className="patient-line"
            fill="none"
          />
        )}

        {/* patient points */}
        {visiblePoints.map((p, i) => (
          <circle key={i} cx={xScale(p.age)} cy={yScale(p.value)} r={5} className="patient-point" />
        ))}

        {/* extra markers, e.g. height plotted at bone age (open diamond) */}
        {(markers ?? []).map((mk, i) => (
          <g key={`mk${i}`}>
            <rect
              x={xScale(mk.age) - 5}
              y={yScale(mk.value) - 5}
              width={10}
              height={10}
              transform={`rotate(45 ${xScale(mk.age)} ${yScale(mk.value)})`}
              className="bone-marker"
            />
            <text x={xScale(mk.age)} y={yScale(mk.value) - 11} textAnchor="middle" className="bone-label">
              {mk.label}
            </text>
          </g>
        ))}

        {/* axis titles */}
        <text x={M.left + plotW / 2} y={H - 6} className="axis-title">
          Age ({xUnit})
        </text>
        <text transform={`translate(14 ${M.top + plotH / 2}) rotate(-90)`} className="axis-title">
          {title} ({unit})
        </text>
      </svg>
    </figure>
  );
}
