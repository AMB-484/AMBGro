// Self-contained SVG growth chart: centile reference curves + plotted patient
// point(s). No charting library — full control and fully offline-capable.

import type { ReferenceCurve } from '../engine';

export interface PlottedPoint {
  age: number; // months
  value: number;
  label?: string;
}

interface Props {
  title: string;
  unit: string;
  xUnit: 'months' | 'years';
  minAge: number; // months
  maxAge: number; // months
  curves: ReferenceCurve[];
  points: PlottedPoint[];
}

const W = 840;
const H = 560;
const M = { top: 28, right: 54, bottom: 46, left: 58 };
const plotW = W - M.left - M.right;
const plotH = H - M.top - M.bottom;

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

export function GrowthChart({ title, unit, xUnit, minAge, maxAge, curves, points }: Props) {
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
  if (!Number.isFinite(yMin)) {
    yMin = 0;
    yMax = 1;
  }
  const pad = (yMax - yMin) * 0.05 || 1;
  yMin -= pad;
  yMax += pad;

  const xScale = (age: number) => M.left + ((age - minAge) / (maxAge - minAge)) * plotW;
  const yScale = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const xStep = xUnit === 'years' ? 24 : 3;
  const xTickVals: number[] = [];
  for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge + 1e-9; a += xStep) xTickVals.push(a);
  const yTicks = niceTicks(yMin, yMax, 8);

  const pathFor = (curve: ReferenceCurve) =>
    curve.points
      .filter((p) => p.age >= minAge && p.age <= maxAge)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.age).toFixed(1)},${yScale(p.value).toFixed(1)}`)
      .join(' ');

  const curveClass = (centile: number) =>
    centile === 50 ? 'curve curve-median' : centile <= 3 || centile >= 97 ? 'curve curve-outer' : 'curve';

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="chart-svg">
        {/* plot frame */}
        <rect x={M.left} y={M.top} width={plotW} height={plotH} className="plot-bg" />

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
        {points.length > 1 && (
          <path
            d={points
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.age).toFixed(1)},${yScale(p.value).toFixed(1)}`)
              .join(' ')}
            className="patient-line"
            fill="none"
          />
        )}

        {/* patient points */}
        {points.map((p, i) => (
          <circle key={i} cx={xScale(p.age)} cy={yScale(p.value)} r={5} className="patient-point" />
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
