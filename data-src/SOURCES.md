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

## Note on the 2-year handoff

Under 2 years WHO measures **recumbent length**; from 2 years CDC measures
**standing height**. Length runs ~0.7–1.5 cm greater than height, so there is a
small, expected step in the "height" curve at 24 months. This is the standard,
clinically-accepted convention when switching charts at age 2.
