# AMBGro — Google Play listing (paste-ready)

Draft copy for the Play Console **Store listing**, **Data safety** form, and the
**not-a-medical-device disclaimer**. Character limits noted per field.

---

## App name  (max 30 chars)

```
AMBGro
```

Alternative if you want the purpose in the name (24 chars):

```
AMBGro: Growth & Puberty
```

---

## Short description  (max 80 chars)

```
Growth centiles, z-scores & puberty staging for clinicians — private, offline.
```

---

## Full description  (max 4000 chars)

```
AMBGro is a growth and puberty assessment tool built for paediatricians, endocrinologists and other clinicians who monitor children's growth.

Enter a measurement once and AMBGro instantly calculates exact centiles and z-scores for height, weight and BMI, automatically choosing the correct reference for the child's age.

KEY FEATURES
• Exact LMS-based centiles and z-scores for height, weight and BMI
• Automatic WHO (0–<2 y) to CDC (2–20 y) reference switching by age
• CDC Extended BMI for severe obesity
• Saved patient records with longitudinal growth charts
• Height velocity between visits
• Mid-parental (target) height with expected range
• Bone-age marker on the height chart
• Puberty / Tanner staging and trajectory
• Specialised references: Down syndrome, Turner syndrome, and corrected age for prematurity
• Export charts and data as PNG, PDF or CSV
• Full patient-database backup and restore

PRIVACY BY DESIGN
All patient information stays on your device. Nothing is uploaded, transmitted or shared. Records are encrypted at rest and protected by a PIN with an optional biometric (fingerprint) lock. The app works completely offline.

FOR HEALTHCARE PROFESSIONALS
AMBGro is a calculation aid intended to support qualified clinicians. It is not a medical device, does not provide a diagnosis, and does not make treatment recommendations. All clinical decisions remain the responsibility of the treating clinician. Tools labelled "experimental" are provided for evaluation only and must not be used for clinical decisions until independently verified against their source.

Developed by Dr Awais Muhammad Butt.
```

---

## In-app / listing disclaimer  (reuse verbatim)

> **AMBGro is a clinical calculation aid for qualified healthcare professionals.
> It is not a medical device and does not provide diagnosis or treatment
> recommendations. All clinical decisions remain the responsibility of the
> treating clinician. Tools marked "experimental" must not be used for clinical
> decisions until independently verified.**

Put this in the full description (already included above) **and** somewhere
visible in the app (e.g. an "About"/info line) — Play's Health content policy
looks for it, and it protects you.

---

## Data safety form  (answers)

Play's definition: data is only **"collected"/"shared"** if it is **transmitted
off the device**. AMBGro stores everything locally and transmits nothing, so:

- **Does your app collect or share any of the required user data types?** → **No**
  - Rationale: patient name, DOB and health measurements are stored and processed
    **only on the device** (encrypted local storage) and are **never sent off the
    device**. Under Play's definitions that is not "collection" or "sharing".
- **Encryption in transit?** → Not applicable (no data leaves the device).
- **Is data encrypted at rest?** → **Yes** (AES-GCM envelope encryption; PIN +
  optional biometric).
- **Can users request data deletion?** → **Yes** — users delete records in-app,
  and uninstalling removes all data (nothing is held server-side).
- **Ads / analytics / third-party SDKs sending data?** → **None.**

> ⚠️ Before you submit: this "No data collected" answer is correct **only while
> the app sends nothing off the device**. If you ever add cloud sync, analytics,
> crash-reporting SDKs, or ads, you must update the Data safety form.

---

## Sign in details / App access  (reviewer instructions)

The app opens on a **"Secure this device"** PIN screen (local lock, no account, no
server). Play's review bot can't pass it, so under **App content ▸ Sign in details**
declare **"Yes, restricted"** and provide access instructions — NOT a login.

- **Is any part restricted?** → **Yes**
- **Name:** `Local PIN (self-set, no account)`
- **Username / password:** leave blank (no account exists; use `N/A` only if the
  form rejects empty fields)
- **Any other information required to access your app:**

  > AMBGro has no accounts and no server login; all data is stored and encrypted
  > only on the device. On first launch a "Secure this device" screen appears. To
  > access the app: enter any PIN of at least 6 characters (e.g. 123456), confirm
  > it, and tap "Set PIN & encrypt". A recovery code is then shown — tap Continue
  > to enter the app. Use the same PIN to unlock later. Biometric unlock is
  > optional and can be skipped. No developer credentials are required.

- **"…provide full access to all features and content"** checkbox → **ticked**
  (no paid content; the PIN grants full access).

First-run flow (from `src/lock/LockScreen.tsx`): Set PIN & encrypt → "Save your
recovery code" screen → Continue → app unlocks.

---

## Other listing fields (quick answers)

- **App category:** Medical
- **Tags:** growth chart, paediatrics, endocrinology, z-score, centile
- **Target audience / age:** adults (18+) / healthcare professionals — **not**
  designed for children, even though it is *about* paediatric patients.
- **Content rating:** complete the IARC questionnaire → will come back rated for
  everyone / medical reference (no objectionable content).
- **Privacy policy URL:** https://amb-484.github.io/ambgro-privacy
- **Contact email:** dr.awaismbutt@gmail.com

---

## Graphics still needed (you supply these)

- **App icon** 512×512 PNG — you already have the centile-fan icon.
- **Feature graphic** 1024×500 PNG (required).
- **Phone screenshots** — at least 2 (you have device screenshots already);
  ideally 4–8 showing chart, records, puberty, lock screen.
```
