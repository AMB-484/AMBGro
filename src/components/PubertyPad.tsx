// The "Clinical Assessment Pad": rapid, tap-based pubertal staging for exams.
// Tanner cards (no dropdowns), a Prader orchidometer, and a menarche tracker.
// Fully controlled — holds a PubertyAssessment `value` and emits patches.

import { useState } from 'react';
import {
  tannerDescriptor,
  tannerBadge,
  PRADER_VOLUMES,
  TESTIS_ONSET_ML,
} from '../engine';
import type { PubertyAssessment, Sex, TannerKind } from '../engine';

interface Props {
  sex: Sex;
  value: PubertyAssessment;
  onChange: (patch: Partial<PubertyAssessment>) => void;
}

const STAGES = [1, 2, 3, 4, 5];

/** A small non-anatomical "maturity ramp" glyph filled to stage/5. */
function RampGlyph({ stage }: { stage: number }) {
  const frac = stage / 5;
  return (
    <svg className="ramp" viewBox="0 0 40 10" aria-hidden="true">
      <rect x="0" y="3" width="40" height="4" rx="2" className="ramp-track" />
      <rect x="0" y="3" width={40 * frac} height="4" rx="2" className="ramp-fill" />
    </svg>
  );
}

function TannerRow({
  kind,
  label,
  value,
  onSelect,
}: {
  kind: TannerKind;
  label: string;
  value: number | undefined;
  onSelect: (stage: number) => void;
}) {
  return (
    <div className="tanner-block">
      <span className="field-label">{label}</span>
      <div className="tanner-row" role="group" aria-label={label}>
        {STAGES.map((s) => {
          const on = value === s;
          return (
            <button
              key={s}
              type="button"
              className={`tanner-card ${on ? 'on' : ''}`}
              aria-pressed={on}
              onClick={() => onSelect(on ? 0 : s)}
              title={tannerDescriptor(kind, s)}
            >
              <span className="card-badge">{tannerBadge(kind, s)}</span>
              <RampGlyph stage={s} />
              <span className="card-caption">{tannerDescriptor(kind, s).split(' · ')[1]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** cbrt-scaled bead diameter so the beads look like a real orchidometer. */
function beadSize(vol: number): number {
  return 20 + (Math.cbrt(vol) - 1) * 9; // ~20px (1 mL) → ~46px (25 mL)
}

function Orchidometer({
  value,
  onChange,
}: {
  value: PubertyAssessment;
  onChange: (patch: Partial<PubertyAssessment>) => void;
}) {
  const [linked, setLinked] = useState(true);

  const setVol = (side: 'L' | 'R', vol: number) => {
    const cur = side === 'L' ? value.testicularVolLeft : value.testicularVolRight;
    const next = cur === vol ? undefined : vol;
    if (linked) onChange({ testicularVolLeft: next, testicularVolRight: next });
    else if (side === 'L') onChange({ testicularVolLeft: next });
    else onChange({ testicularVolRight: next });
  };

  const row = (side: 'L' | 'R', selected: number | undefined, disabled: boolean) => (
    <div className="orchid-row">
      <span className="orchid-side">{side}</span>
      <div className="beads">
        {PRADER_VOLUMES.map((v) => {
          const on = selected === v;
          const d = beadSize(v);
          return (
            <button
              key={v}
              type="button"
              className={`bead ${on ? 'on' : ''} ${v >= TESTIS_ONSET_ML ? 'pubertal' : ''}`}
              style={{ width: d, height: d }}
              disabled={disabled}
              aria-pressed={on}
              onClick={() => setVol(side, v)}
              title={`${v} mL`}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="tanner-block">
      <div className="orchid-head">
        <span className="field-label">Testicular volume (Prader, mL)</span>
        <button
          type="button"
          className={`link-toggle ${linked ? 'on' : ''}`}
          aria-pressed={linked}
          onClick={() => setLinked((v) => !v)}
          title="Mirror the left selection to the right"
        >
          {linked ? '🔗 L = R' : 'Link L/R'}
        </button>
      </div>
      {row('L', value.testicularVolLeft, false)}
      {row('R', value.testicularVolRight, linked)}
      <span className="hint">Beads ≥ {TESTIS_ONSET_ML} mL (highlighted) mark the onset of puberty.</span>
    </div>
  );
}

function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`switch ${on ? 'on' : ''}`}
      role="switch"
      aria-checked={on}
      onClick={onToggle}
    >
      <span className="switch-track"><span className="switch-thumb" /></span>
      {label}
    </button>
  );
}

export function PubertyPad({ sex, value, onChange }: Props) {
  return (
    <div className="puberty-pad">
      {sex === 'male' ? (
        <>
          <TannerRow
            kind="genitalia"
            label="Tanner — genitalia"
            value={value.tannerGenitalia}
            onSelect={(s) => onChange({ tannerGenitalia: s || undefined })}
          />
          <TannerRow
            kind="pubicHair"
            label="Tanner — pubic hair"
            value={value.tannerPubicHair}
            onSelect={(s) => onChange({ tannerPubicHair: s || undefined })}
          />
          <Orchidometer value={value} onChange={onChange} />
          <label className="spl-field">
            Stretched penile length (cm)
            <input
              type="number"
              step="0.1"
              min="0"
              value={value.stretchedPenileLength ?? ''}
              onChange={(e) =>
                onChange({
                  stretchedPenileLength: e.target.value === '' ? undefined : parseFloat(e.target.value),
                })
              }
            />
          </label>
        </>
      ) : (
        <>
          <TannerRow
            kind="breast"
            label="Tanner — breast"
            value={value.tannerBreast}
            onSelect={(s) => onChange({ tannerBreast: s || undefined })}
          />
          <TannerRow
            kind="pubicHair"
            label="Tanner — pubic hair"
            value={value.tannerPubicHair}
            onSelect={(s) => onChange({ tannerPubicHair: s || undefined })}
          />
          <div className="tanner-block">
            <Toggle
              on={value.palpableGlandularTissue === true}
              onToggle={() =>
                onChange({
                  palpableGlandularTissue: value.palpableGlandularTissue ? undefined : true,
                })
              }
              label="Palpable glandular tissue"
            />
          </div>
          <div className="tanner-block">
            <Toggle
              on={value.menarcheAchieved === true}
              onToggle={() =>
                onChange(
                  value.menarcheAchieved
                    ? { menarcheAchieved: false, menarcheDate: undefined }
                    : { menarcheAchieved: true },
                )
              }
              label="Menarche reached"
            />
            {value.menarcheAchieved && (
              <label className="menarche-date">
                Onset (month/year)
                <input
                  type="month"
                  value={value.menarcheDate ?? ''}
                  onChange={(e) => onChange({ menarcheDate: e.target.value || undefined })}
                />
              </label>
            )}
          </div>
        </>
      )}
    </div>
  );
}
