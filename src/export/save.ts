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
 * Save (and, natively, offer to share) a generated file. Resolves once the file has
 * been handed off; on native a cancelled share sheet resolves normally (the file is
 * already written to cache). Rejects only on a real write/share error.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    anchorDownload(blob, filename);
    return;
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
  } catch (e) {
    // The user dismissing the share sheet surfaces as a rejection on some devices —
    // treat that as a normal cancel, not an export failure.
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg)) return;
    throw e;
  }
}

/** Convenience wrapper for text payloads (CSV, JSON backups). */
export async function saveText(text: string, filename: string, mime: string): Promise<void> {
  await saveBlob(new Blob([text], { type: mime }), filename);
}
