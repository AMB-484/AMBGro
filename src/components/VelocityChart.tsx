// Height-velocity chart (cm/year vs age) with pubertal-milestone overlays. Like
// GrowthChart it is a self-contained SVG (literal colours in embedded CSS) so it
// rasterises correctly on PNG/PDF export.

import { niceTicks } from './chartUtils';

export interface VelocityPoint {
  ageYears: number;
  cmPerYear: number;
}

export interface Milestone {
  ageYears: number;
  label: string; // e.g. "TV≥4", "G4", "B2"
  tone: 'onset' | 'phv' | 'other';
}

interface Props {
  points: VelocityPoint[];
  milestones: Milestone[];
  menarcheAgeYears?: number | null;
}

const W = 840;
const H = 440;
const M = { top: 30, right: 24, bottom: 46, left: 52 };
const plotW = W - M.left - M.right;
const plotH = H - M.top - M.bottom;

const CSS = `
svg { background: #ffffff; }
text { font-family: system-ui, 'Segoe UI', Roboto, sans-serif; }
.plot-bg { fill: #ffffff; stroke: #e2e4ee; }
.grid { stroke: #eef0f6; stroke-width: 1; }
.axis-label { fill: #6b6375; font-size: 11px; }
.y-label { text-anchor: end; dominant-baseline: middle; }
.x-label { text-anchor: middle; }
.axis-title { fill: #6b6375; font-size: 12px; text-anchor: middle; font-weight: 500; }
.chart-title { fill: #0f1222; font-size: 14px; font-weight: 600; }
.vel-line { fill: none; stroke: #2563eb; stroke-width: 2; }
.vel-point { fill: #2563eb; stroke: #ffffff; stroke-width: 1.5; }
.vel-peak { fill: #f59e0b; stroke: #ffffff; stroke-width: 1.5; }
.peak-label { fill: #b45309; font-size: 10px; font-weight: 600; text-anchor: middle; }
.ms-line { stroke-width: 1.2; stroke-dasharray: 4 3; }
.ms-onset { stroke: #16a34a; }
.ms-phv { stroke: #a855f7; }
.ms-other { stroke: #9aa4b8; }
.ms-label { font-size: 10px; font-weight: 600; }
.ms-label-onset { fill: #15803d; }
.ms-label-phv { fill: #7e22ce; }
.ms-label-other { fill: #6b6375; }
.menarche-mark { fill: #dc2626; }
.menarche-label { fill: #b91c1c; font-size: 10px; font-weight: 600; text-anchor: middle; }
.empty-note { fill: #6b6375; font-size: 12px; text-anchor: middle; }
`;

export function VelocityChart({ points, milestones, menarcheAgeYears }: Props) {
  const sorted = [...points].sort((a, b) => a.ageYears - b.ageYears);
  const overlayAges = [
    ...milestones.map((m) => m.ageYears),
    ...(menarcheAgeYears != null ? [menarcheAgeYears] : []),
  ];

  const ages = [...sorted.map((p) => p.ageYears), ...overlayAges];
  let xMin = ages.length ? Math.min(...ages) : 8;
  let xMax = ages.length ? Math.max(...ages) : 18;
  if (xMax - xMin < 2) {
    xMin -= 1;
    xMax += 1;
  } else {
    xMin -= 0.5;
    xMax += 0.5;
  }

  const vMax = sorted.length ? Math.max(...sorted.map((p) => p.cmPerYear)) : 12;
  const yMax = Math.max(4, Math.ceil((vMax + 1) / 2) * 2);

  const xScale = (a: number) => M.left + ((a - xMin) / (xMax - xMin)) * plotW;
  const yScale = (v: number) => M.top + (1 - v / yMax) * plotH;

  const xTicks = niceTicks(xMin, xMax, 8).filter((t) => t >= xMin && t <= xMax);
  const yTicks = niceTicks(0, yMax, 6);

  const peak =
    sorted.length > 0
      ? sorted.reduce((best, p) => (p.cmPerYear > best.cmPerYear ? p : best), sorted[0])
      : null;

  const linePath = sorted
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.ageYears).toFixed(1)},${yScale(p.cmPerYear).toFixed(1)}`)
    .join(' ');

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Height velocity with pubertal milestones"
        className="chart-svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        <style>{CSS}</style>
        <rect x={M.left} y={M.top} width={plotW} height={plotH} className="plot-bg" />

        {/* gridlines + labels */}
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={M.left} x2={M.left + plotW} y1={yScale(v)} y2={yScale(v)} className="grid" />
            <text x={M.left - 8} y={yScale(v)} className="axis-label y-label">
              {v}
            </text>
          </g>
        ))}
        {xTicks.map((a) => (
          <g key={`x${a}`}>
            <line x1={xScale(a)} x2={xScale(a)} y1={M.top} y2={M.top + plotH} className="grid" />
            <text x={xScale(a)} y={M.top + plotH + 18} className="axis-label x-label">
              {a}
            </text>
          </g>
        ))}

        {/* pubertal milestones as vertical dashed lines */}
        {milestones.map((m, i) => (
          <g key={`ms${i}`}>
            <line
              x1={xScale(m.ageYears)}
              x2={xScale(m.ageYears)}
              y1={M.top}
              y2={M.top + plotH}
              className={`ms-line ms-${m.tone}`}
            />
            <text
              x={xScale(m.ageYears) + 3}
              y={M.top + 12 + (i % 3) * 12}
              className={`ms-label ms-label-${m.tone}`}
            >
              {m.label}
            </text>
          </g>
        ))}

        {/* velocity line + points */}
        {sorted.length > 1 && <path d={linePath} className="vel-line" />}
        {sorted.map((p, i) => {
          const isPeak = peak != null && p === peak && sorted.length > 1;
          return (
            <circle
              key={i}
              cx={xScale(p.ageYears)}
              cy={yScale(p.cmPerYear)}
              r={isPeak ? 6 : 4.5}
              className={isPeak ? 'vel-peak' : 'vel-point'}
            />
          );
        })}
        {peak != null && sorted.length > 1 && (
          <text x={xScale(peak.ageYears)} y={yScale(peak.cmPerYear) - 10} className="peak-label">
            PHV {peak.cmPerYear.toFixed(1)}
          </text>
        )}

        {/* menarche marker: inverted triangle on the x-axis */}
        {menarcheAgeYears != null && (
          <g>
            <path
              d={`M${xScale(menarcheAgeYears) - 6},${M.top + plotH} L${xScale(menarcheAgeYears) + 6},${M.top + plotH} L${xScale(menarcheAgeYears)},${M.top + plotH - 11} Z`}
              className="menarche-mark"
            />
            <text x={xScale(menarcheAgeYears)} y={M.top + plotH - 15} className="menarche-label">
              menarche
            </text>
          </g>
        )}

        {sorted.length === 0 && (
          <text x={M.left + plotW / 2} y={M.top + plotH / 2} className="empty-note">
            Two visits with height are needed to show velocity.
          </text>
        )}

        {/* axis titles */}
        <text x={M.left + plotW / 2} y={H - 6} className="axis-title">
          Age (years)
        </text>
        <text transform={`translate(14 ${M.top + plotH / 2}) rotate(-90)`} className="axis-title">
          Height velocity (cm/year)
        </text>
      </svg>
    </figure>
  );
}
