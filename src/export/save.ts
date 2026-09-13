// Cross-platform "save a file the user generated" helper.
//
// In a browser / PWA an `<a download>` click hands the blob to the browser's own
// download manager. Inside the Capacitor Android WebView there is no download
// manager wired up, so that click silently does nothing — which is why PDF / PNG /
// CSV / backup exports worked on the hosted site but not in the installed APK.
//
// Natively we instead write the bytes to the app cache with @capacitor/filesystem
// and hand the resulting file URI to @capacitor/share, so the doctor gets the
// system sheet to save it to Files/Downloads, print it, or send it on.
//
// The Capacitor plugins are imported statically (not `await import(...)`): a runtime
// dynamic import in the WebView can stall behind the service worker and never
// settle. On web these plugins register lazy web implementations that we never
// invoke because every native branch is gated on `Capacitor.isNativePlatform()`.

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { suspendAutoLock, resumeAutoLock } from '../store/vault';

/** Base64 (no data: prefix) for a blob, via FileReader. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result;
      if (typeof res !== 'string') {
        reject(new Error('could not read blob'));
        return;
      }
      // res is "data:<mime>;base64,<payload>" — keep only the payload
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(reader.error ?? new Error('could not read blob'));
    reader.readAsDataURL(blob);
  });
}

/** Browser path: hand the blob to the browser download manager via an anchor. */
function anchorDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * What happened to the file. `saved` = written somewhere the user can find it
 * (Downloads, a folder they chose, or the native save/share sheet). `cancelled`
 * = the user dismissed a Save-As / share dialog and nothing was written. A real
 * write error rejects instead.
 */
export type SaveOutcome = 'saved' | 'cancelled';

// The File System Access API (`showSaveFilePicker`) is desktop-Chromium only and
// not in the TS DOM lib here; describe just the bits we use.
interface SaveFilePickerAccept { description?: string; accept: Record<string, string[]> }
type ShowSaveFilePicker = (opts: {
  suggestedName?: string;
  types?: SaveFilePickerAccept[];
}) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }>;

/** MIME → File System Access `types` entry, so the Save-As dialog labels the file sensibly. */
function pickerTypes(filename: string, mime: string): SaveFilePickerAccept[] {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot) : '';
  if (!ext) return [];
  const type = mime.split(';')[0] || 'application/octet-stream';
  const label =
    ext === '.pdf' ? 'PDF document'
    : ext === '.png' ? 'PNG image'
    : ext === '.csv' ? 'CSV spreadsheet'
    : ext === '.json' ? 'JSON file'
    : 'File';
  return [{ description: label, accept: { [type]: [ext] } }];
}

/**
 * Desktop browsers that support the File System Access API: open a real Save-As
 * dialog so the user chooses the folder and name. Returns null when the API is
 * unavailable (mobile browsers, Firefox/Safari) so the caller can fall back to a
 * plain download.
 */
async function trySaveAs(blob: Blob, filename: string): Promise<SaveOutcome | null> {
  const picker = (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
  if (typeof picker !== 'function') return null;
  try {
    const handle = await picker({ suggestedName: filename, types: pickerTypes(filename, blob.type) });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return 'saved';
  } catch (e) {
    // User dismissed the dialog — treat as a normal cancel, not an error.
    const name = e instanceof Error ? e.name : '';
    if (name === 'AbortError' || /abort/i.test(String(e))) return 'cancelled';
    throw e;
  }
}

/**
 * Save (and, natively, offer to share) a generated file. Resolves with `'saved'`
 * once the file has been written/handed off, or `'cancelled'` if the user dismissed
 * a Save-As / share dialog. Rejects only on a real write/share error.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<SaveOutcome> {
  if (!Capacitor.isNativePlatform()) {
    const viaPicker = await trySaveAs(blob, filename);
    if (viaPicker !== null) return viaPicker;
    // Mobile browsers / no picker: hand off to the download manager (Downloads).
    anchorDownload(blob, filename);
    return 'saved';
  }
  const base64 = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });
  // The share sheet backgrounds the app, which would otherwise trip the
  // lock-on-background guard and force a PIN re-entry when the user returns.
  // Suspend auto-lock across the share and re-arm once focus comes back (with a
  // safety timeout in case the focus event never fires).
  suspendAutoLock();
  const rearm = () => {
    window.removeEventListener('focus', rearm);
    window.setTimeout(resumeAutoLock, 500);
  };
  window.addEventListener('focus', rearm, { once: true });
  window.setTimeout(resumeAutoLock, 30_000);
  try {
    await Share.share({
      title: filename,
      url: written.uri,
      dialogTitle: `Save or share ${filename}`,
    });
    return 'saved';
  } catch (e) {
    // The user dismissing the share sheet surfaces as a rejection on some devices —
    // treat that as a normal cancel, not an export failure.
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg)) return 'cancelled';
    throw e;
  }
}

/** Convenience wrapper for text payloads (CSV, JSON backups). */
export async function saveText(text: string, filename: string, mime: string): Promise<SaveOutcome> {
  return saveBlob(new Blob([text], { type: mime }), filename);
}

/**
 * True when a save will land in the browser's Downloads folder with no chance to
 * pick a location — i.e. a mobile/other browser without the File System Access API
 * and not the native app. Lets the UI say "Saved to your Downloads folder" only
 * when that's actually where the file goes.
 */
export function savesToDownloads(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  return typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker !== 'function';
}
