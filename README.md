# GrowthTrack

Digital growth-charting for endocrinology. Enter a child's sex, age (or date of
birth), height and weight, and get **exact LMS-based Z-scores and centiles** for
height, weight and BMI, plotted on WHO/CDC growth charts — fully offline.

Built by Dr. Awais Butt. Clinical decision support for qualified clinicians; not
a substitute for clinical judgement.

## Status — Phase 1 (MVP)

Working today:

- Exact Z-scores & centiles from the underlying **LMS parameters** (not visual
  approximation).
- **WHO** standards for 0–<24 months and **CDC** reference for 24–240 months,
  with automatic dataset selection at the 2-year boundary.
- Age from **date of birth** (exact, to the day) or entered directly.
- Height / weight / **BMI-for-age**.
- On-screen **growth chart** (SVG) with 3rd–97th centile curves and the plotted
  patient point; month axis for infants, year axis for children.
- 100% offline: all reference data is bundled into the app.

Not yet built (see Roadmap): height velocity, mid-parental target height,
bone-age / Bayley–Pinneau prediction, CDC Extended-BMI for severe obesity,
Turner & Down syndrome charts, prematurity/corrected-age, PDF/PNG/CSV export,
saved longitudinal patient records, and packaging as an installable
Android app (PWA → Capacitor APK).

## Tech

- React 19 + TypeScript + Vite (web-first; becomes a PWA, then an Android APK via
  Capacitor, and a desktop app later — one codebase).
- No paid tools or data. All reference datasets are public.

## Project layout

```
data-src/                 raw reference files (provenance) — see data-src/SOURCES.md
  cdc/  *.csv             CDC 2000 growth charts (LMS + published percentiles)
  who/  *anthro.txt       WHO Child Growth Standards (LMS)
scripts/
  build-references.mjs    converts data-src/ -> bundled dataset; self-validates vs CDC percentiles
  validate.mjs            independent runtime checks (median->z=0, WHO +2SD anchors, round-trips)
src/engine/               framework-agnostic core
  lms.ts                  Z<->measurement, normal CDF/quantile
  references.ts           dataset lookup + age interpolation (WHO<24mo, CDC>=24mo)
  anthro.ts               assess(...) + reference-curve generation
  age.ts                  date-of-birth -> decimal age (months)
  data/references.*       AUTO-GENERATED bundled dataset (do not edit by hand)
src/components/GrowthChart.tsx   SVG chart
src/App.tsx               UI
```

## Commands

```
npm install        # once
npm run dev        # local dev server (http://localhost:5173)
npm run build      # typecheck + production build
npm run data       # regenerate the bundled dataset from data-src/ (with self-validation)
npm run validate   # run independent engine checks
```

## Data & validation

The bundled dataset is regenerated from `data-src/` by `npm run data`. During
generation, every CDC row's LMS parameters are used to recompute the 3rd/50th/97th
percentile measurements and compared against CDC's own published percentile
columns — the build **fails** if they disagree beyond 5e-4 relative error
(current max ≈ 1e-9). `npm run validate` adds independent anchors, including
WHO's published +2 SD birth values.

See [data-src/SOURCES.md](data-src/SOURCES.md) for exact sources and licensing.
