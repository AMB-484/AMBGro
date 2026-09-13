import { useEffect } from 'react';
import './manual.css';

// Bump this whenever the manual is revised so the footer shows how current it is.
// Keep the manual edited in the SAME change as any feature it describes.
const MANUAL_UPDATED = '2026-09-13';

interface Props {
  appName: string;
  developer: string;
  onClose: () => void;
}

/**
 * In-app user manual: a scrollable guide to every feature, opened from the Options
 * menu. It ships inside the app bundle, so it always matches the installed build —
 * update its content alongside any feature change and bump MANUAL_UPDATED.
 */
export default function UserManual({ appName, developer, onClose }: Props) {
  // Esc closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="manual-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${appName} user manual`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="manual-card">
        <div className="manual-head">
          <h1>{appName} — User manual</h1>
          <button className="manual-close" aria-label="Close manual" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="manual-body">
          <p className="manual-intro">
            {appName} plots a child's measurements on WHO (0–2 y) and CDC (2–20 y) growth
            references — with Down- and Turner-syndrome charts, puberty staging, height velocity,
            and adult-height prediction. All data stays encrypted on this device; nothing is sent
            to any server.
          </p>

          <section>
            <h2>1. Security &amp; unlocking</h2>
            <ul>
              <li>
                <strong>PIN &amp; recovery code.</strong> On first run you set a PIN and are shown a
                one-time recovery code — write it down. It's the only way back in if you forget the
                PIN.
              </li>
              <li>
                <strong>Biometric unlock.</strong> If your device supports it, enable it from{' '}
                <em>Options → Enable biometric unlock</em> to unlock with fingerprint/face.
              </li>
              <li>
                <strong>Auto-lock.</strong> The app stays open while you use it and through brief
                switches to other apps (e.g. opening an exported PDF). It re-locks only after it has
                been in the background for a few minutes, or when the phone is restarted or the app
                is updated. Use <em>Options → Security settings → Lock now</em> to lock immediately.
              </li>
              <li>
                <strong>Pause app lock (for a clinic).</strong>{' '}
                <em>Options → Security settings → Pause app lock</em> keeps the app unlocked for a
                chosen window — 30 minutes up to 4 hours, or until you turn it back on — even when the
                screen turns off, so you aren't re-entering the PIN throughout an OPD session. While
                paused, anyone who can open the phone can see records, and a restart still re-locks.
                Turn it off early with <em>Turn on PIN lock</em>.
              </li>
              <li>
                <strong>Delete all data.</strong> <em>Options → Delete all data</em> permanently
                wipes every record and the PIN from this device (type DELETE to confirm). There is no
                cloud copy — back up first.
              </li>
            </ul>
          </section>

          <section>
            <h2>2. Choosing a reference chart</h2>
            <p>
              Use the <strong>Reference chart</strong> selector at the top of Measurement:
            </p>
            <ul>
              <li><strong>Standard (WHO / CDC)</strong> — the default for most children.</li>
              <li><strong>Down syndrome (Zemel 2015)</strong> — condition-specific charts.</li>
              <li><strong>Turner syndrome (Isojima, girls)</strong> — for girls with Turner syndrome.</li>
            </ul>
          </section>

          <section>
            <h2>3. Entering a measurement</h2>
            <ul>
              <li>
                <strong>Age by date of birth</strong> — enter DOB and the visit date; {appName}{' '}
                computes exact age. <strong>Age directly</strong> — type the age when DOB is unknown.
              </li>
              <li>
                <strong>Prematurity.</strong> Enter gestation in weeks so early results are age-
                corrected where appropriate.
              </li>
              <li>
                Enter <strong>height/length</strong> and <strong>weight</strong>; BMI, z-scores and
                centiles are calculated automatically.
              </li>
              <li>
                <strong>Parent heights</strong> give a mid-parental target height (MPH) band on the
                height chart.
              </li>
            </ul>
          </section>

          <section>
            <h2>4. Ad-hoc vs saved patients</h2>
            <ul>
              <li>
                <strong>Ad-hoc</strong> — just type a measurement to see the result without saving a
                record. Nothing is stored.
              </li>
              <li>
                <strong>Saved patient</strong> — create a patient (name, sex, DOB…) to keep a
                trajectory. Add a <strong>visit</strong> with <em>Save visit</em>; each visit is a
                dated point. Edit (✎) or delete (✕) visits from the visit table.
              </li>
            </ul>
          </section>

          <section>
            <h2>5. Puberty staging</h2>
            <p>
              Record Tanner stages (and testicular volume for boys) on the puberty pad. Values are
              stored per visit and appear in the PDF report.
            </p>
          </section>

          <section>
            <h2>6. Reading the charts &amp; velocity</h2>
            <ul>
              <li>Switch between <strong>Height</strong>, <strong>Weight</strong> and <strong>BMI</strong> charts.</li>
              <li>
                <strong>Height velocity</strong> (cm/year) is computed between consecutive visits — a
                sensitive early sign of a growth problem.
              </li>
            </ul>
          </section>

          <section>
            <h2>7. Predicted adult height</h2>
            <p>
              When a bone age is entered, {appName} estimates adult height using the Bayley–Pinneau
              method, alongside the mid-parental target.
            </p>
          </section>

          <section>
            <h2>8. Exporting charts &amp; reports</h2>
            <ul>
              <li>
                <strong>PDF</strong> — a full clinical report: charts, demographics and a per-visit
                table. <strong>PNG</strong> — the chart on screen. <strong>CSV</strong> — the raw
                values and centiles.
              </li>
              <li>
                <strong>File names</strong> follow{' '}
                <code>PatientName_V{'{'}visit{'}'}_Date</code> — e.g.{' '}
                <code>Ali_V2_2026-09-13</code>. Ad-hoc exports use <code>Sex_Date</code>.
              </li>
              <li>
                <strong>Where it saves.</strong> On a phone browser the file goes to your{' '}
                <strong>Downloads</strong> folder and a confirmation appears at the top of the app.
                On a desktop browser you get a Save-As dialog to choose the folder. In the installed
                app, the system Save/Share sheet lets you pick where it goes.
              </li>
            </ul>
          </section>

          <section>
            <h2>9. Backup, restore &amp; import</h2>
            <ul>
              <li>
                <strong>Export data</strong> — a plain JSON backup of all patients (unencrypted;
                keep it safe).
              </li>
              <li>
                <strong>Export encrypted backup</strong> — a passphrase-protected backup, safe to
                store off-device.
              </li>
              <li><strong>Import data</strong> — restore from a backup file.</li>
            </ul>
          </section>

          <p className="manual-foot">
            {appName} by {developer}. Clinical decision support for qualified clinicians — not a
            substitute for clinical judgement. Manual last updated {MANUAL_UPDATED}.
          </p>
        </div>
      </div>
    </div>
  );
}
