# Reference data sources

All datasets here are public and free to use for this purpose. They are the raw
inputs to `scripts/build-references.mjs`, which produces the bundled dataset in
`src/engine/data/`.

## CDC — `cdc/*.csv`

CDC 2000 Growth Charts, percentile data files (LMS parameters + published
percentiles). Sex column: 1 = male, 2 = female. Age in months (`Agemos`).

- `statage.csv`   — stature-for-age, 24–240 months (USED, "height" ≥ 2y)
- `wtage.csv`     — weight-for-age, 24–240 months (USED)
- `bmiagerev.csv` — BMI-for-age, 24–240 months (USED)
- `lenageinf.csv`, `wtageinf.csv`, `wtleninf.csv`, `hcageinf.csv` — CDC infant
  charts (downloaded for reference/fallback; not used because we use WHO 0–2y)
- `bmi-age-2022.csv` — **CDC Extended BMI-for-age (2022)**: adds `sigma` and `P95`
  columns (USED for BMI ≥ 95th percentile / severe obesity). Above P95 the
  percentile is `90 + 10·Φ((BMI − P95)/sigma)` (half-normal tail; Wei et al. 2020),
  which avoids the compression of standard LMS near the 99th percentile.
  Source: https://www.cdc.gov/growthcharts/extended-bmi-data-files.htm
  (file: https://www.cdc.gov/growthcharts/data/extended-bmi/bmi-age-2022.csv)

Source: CDC National Center for Health Statistics —
https://www.cdc.gov/growthcharts/percentile_data_files.htm
(data files under https://www.cdc.gov/growthcharts/data/zscore/). US Government
work, public domain.

## WHO — `who/*anthro.txt`

WHO Child Growth Standards, LMS reference tables (tab-separated:
`sex age l m s [loh]`; sex 1 = male, 2 = female; **age in days**). We use rows
for 0 to <24 months.

- `lenanthro.txt` — length-for-age (USED as "height" < 2y, recumbent length)
- `weianthro.txt` — weight-for-age (USED)
- `bmianthro.txt` — BMI-for-age (USED)

These are the WHO `igrowup` standard reference files. Mirror used for download:
https://github.com/aless80/iGrow (files are verbatim WHO Child Growth Standards
data). Canonical source: WHO Child Growth Standards —
https://www.who.int/tools/child-growth-standards/standards
WHO permits use of these standards for such applications.

## Down syndrome — `down/zemel_2015.csv`

Zemel et al. 2015 Down syndrome growth charts (US), LMS. Extracted (zemel_2015_*
rows only) from the open **peditools** dataset
(https://github.com/jhchou/peditools, `data-raw/charts_long.csv`), which reproduces
the published Zemel 2015 LMS values. Columns: `chart, age, age_units, gender,
measure, measure_units, L, M, S`. Covers height/weight 0–20y and BMI 2–20y, both
sexes. Selected in-app via the "Down syndrome" reference toggle. Zemel B, et al.
Pediatrics 2015;136(5):e1204-11 (PMC5451269).

## Prematurity / corrected age

Corrected (adjusted) age is computed in-app as chronological age −
(40 − gestational weeks), applied up to 24 months, then plotted on the WHO
standards. (Neonatal Fenton/INTERGROWTH-21st preterm *chart* plotting is a future
addition; `fenton_2003`/`olsen` LMS are present in the peditools dataset if needed.)

## Turner syndrome — `turner/turner_isojima_height.csv`

Height-for-age for girls with Turner syndrome, **Isojima et al. 2010** (Japanese
reference; largest sample, LMS method, recommended for growth monitoring >2y). The
mean + SD by age were taken from the Isojima column of Table 3 in Bertapelli et al.
2014 (BioMed Research International, PMC4052048), a systematic review reproducing
each source study's values. Turner height-SDS is conventionally `(height − mean)/SD`,
i.e. LMS with **L = 1, M = mean, S = SD/mean**. Girls only, height only, ages 1–18 y.
Final height ≈139.5 cm at 18y (matches known Turner adult height). Selected via the
"Turner syndrome" reference toggle.

## Note on the 2-year handoff

Under 2 years WHO measures **recumbent length**; from 2 years CDC measures
**standing height**. Length runs ~0.7–1.5 cm greater than height, so there is a
small, expected step in the "height" curve at 24 months. This is the standard,
clinically-accepted convention when switching charts at age 2.
