# AMBGro

Digital growth-charting for endocrinology. Enter a child's sex, age (or date of
birth), height and weight, and get **exact LMS-based Z-scores and centiles** for
height, weight and BMI, plotted on WHO/CDC growth charts — fully offline.

Built by Dr. Awais Muhammad Butt. Clinical decision support for qualified clinicians; not
a substitute for clinical judgement.

## What works

- Exact Z-scores & centiles from the underlying **LMS parameters** (not visual
  approximation), for height, weight and **BMI-for-age**.
- **WHO** standards 0–<24 months and **CDC** 24–240 months, auto-selected at the
  2-year boundary. Age from **date of birth** (exact, to the day) or entered directly.
- **CDC Extended BMI-for-age (2022)** for severe obesity — z-scores above the 95th
  percentile don't saturate.
- **Plain-language interpretation** of the standard-reference results: short/tall
  stature (<3rd / >97th centile) and CDC BMI weight-status categories
  (underweight / overweight / obese).
- **Export**: high-res PNG, a PDF clinical report, and CSV of measurements + z/centiles.
- **Saved patient records** (offline, localStorage): visits plot as a longitudinal
  trajectory; per-patient CSV. Each record stores the child's gestational age and
  reference set, so saved visits, velocity and CSV all use the same corrected age and
  chart as the live calculation. A series that crosses age 2 is shown on one
  continuous WHO→CDC chart.
- **Backup & restore**: export the whole patient database to a JSON file and import
  it back (merge by record), so records survive a cache clear or device change.
- **Endocrine tools**: mid-parental (target) height (Tanner, ±10 cm) as a chart band;
  height velocity between visits; bone age plotted on the height chart.
- **Puberty assessment & trajectory**: a tap-based *Clinical Assessment Pad* — Tanner
  staging cards (stored as integers 1–5), a Prader orchidometer with Link-L/R, and a
  menarche tracker — captured per visit. A **height-velocity chart** overlays the
  pubertal milestones (testicular volume ≥ 4 mL / G4 for boys, B2 for girls, menarche
  marker) and flags whether peak height velocity aligns with them. Passive warnings:
  precocious / delayed puberty, menarche-before-thelarche asynchrony, and low
  stretched penile length (Feldman −2.5 SD).
- **Adult-height prediction (Bayley–Pinneau, EXPERIMENTAL)**: predicts adult height
  from current height + skeletal (bone) age, auto-selecting the skeletal-maturity
  category, and compares it to the parental target. Clearly badged *not for clinical
  decisions* — the tables are hand-transcribed and unvalidated (see Data & validation).
- **Down syndrome** (Zemel 2015) and **Turner syndrome** (Isojima 2010, height-only,
  girls) reference charts, toggled against the standard WHO/CDC set.
- **Prematurity**: corrected age from gestational age, applied to ≤24 months — for
  both ad-hoc entries and saved longitudinal records.
- **Installable PWA** — works fully offline; can be added to an Android home screen,
  with PNG + maskable icons for the launcher and splash screen.
- 100% offline: all reference data is bundled into the app.

### Deferred / not yet built

- **Bayley–Pinneau validation** — the prediction feature ships as *experimental*
  because its tables were transcribed by hand (RCPCH source) and have not been
  checked against the original 1952 paper. Needs clinician verification before the
  experimental badge can be removed.
- **Fenton / INTERGROWTH-21st** preterm *chart* plotting (corrected-age on WHO is done).

## Tech

- React 19 + TypeScript + Vite (web-first). Ships as an offline **PWA**
  (vite-plugin-pwa) and an Android **APK via Capacitor** (built in CI). Same
  codebase can become a desktop app later.
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
npm run build      # typecheck + production build (also generates the PWA)
npm run preview    # serve the production build locally
npm run data       # regenerate the bundled dataset from data-src/ (with self-validation)
npm run validate   # run independent engine checks
```

## Getting it on your phone

**Option A — install the PWA (free GitHub Pages hosting):**
1. Push this repo to GitHub, then in the repo **Settings → Pages** set
   **Source = "GitHub Actions"**. The included
   [deploy-pages workflow](.github/workflows/deploy-pages.yml) then builds and
   publishes the app automatically on every push to `main`.
2. Open the published URL (`https://<user>.github.io/<repo>/`) in Android Chrome →
   menu → **Add to Home screen / Install app**. It launches full-screen and works
   offline. (All asset paths are relative, so it also works from any subpath or via
   `npm run preview` locally.)

**Option B — build a Play Store APK (Capacitor, in the cloud):**
No local Android SDK is needed. Push this repo to GitHub, then run the
**Build Android APK** workflow (Actions tab → Run workflow, or push a `v*` tag).
It builds `dist`, wraps it with Capacitor, and uploads an installable
`app-debug.apk` artifact. See [.github/workflows/android.yml](.github/workflows/android.yml).

To build locally instead (requires JDK 21 + Android SDK):
```
npm run build
npx cap add android      # first time only
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Data & validation

The bundled dataset is regenerated from `data-src/` by `npm run data`. During
generation, every CDC row's LMS parameters are used to recompute the 3rd/50th/97th
percentile measurements and compared against CDC's own published percentile
columns — the build **fails** if they disagree beyond 5e-4 relative error
(current max ≈ 1e-9). `npm run validate` adds independent anchors, including
WHO's published +2 SD birth values.

The **experimental Bayley–Pinneau** tables are built separately by
`npm run data:bp` (`scripts/build-bayley-pinneau.mjs`), which derives the
percentage-of-mature-height from the table body (median per skeletal-age column, so
single hand-transcription typos are outvoted) and prints a transcription-quality
report. The numbers are **not yet validated against the original paper**, so the
feature is badged *experimental / not for clinical decisions* in-app.

See [data-src/SOURCES.md](data-src/SOURCES.md) for exact sources and licensing.
