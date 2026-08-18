// Thin, feature-detected wrapper over `capacitor-native-biometric`.
//
// On the Android build this stores the raw DEK as a "credential" that the plugin
// persists under an Android Keystore key and releases only after a successful
// biometric prompt — that is how the JS-side key gets Keystore-wrapped (a Web
// Crypto key cannot itself live in the hardware Keystore).
//
// On the web / PWA there is no Keystore and no plugin, so every call degrades to
// "unavailable" and the app stays PIN-only. The plugin is imported dynamically so
// the web bundle never hard-depends on native code.
//
// NOTE: the biometric path can only be exercised on a real device / APK build.
// It is implemented feature-detected and must be verified on-device.

import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

// Minimal shape of the bits of the plugin we use, so this file type-checks even
// if the native package is not installed in a given environment.
interface NativeBiometricPlugin {
  isAvailable(): Promise<{ isAvailable: boolean; errorCode?: number; biometryType?: number }>;
  verifyIdentity(opts: {
    reason?: string;
    title?: string;
    subtitle?: string;
    description?: string;
  }): Promise<void>;
  setCredentials(opts: { username: string; password: string; server: string }): Promise<void>;
  getCredentials(opts: { server: string }): Promise<{ username: string; password: string }>;
  deleteCredentials(opts: { server: string }): Promise<void>;
}

// Namespace the Keystore entry to this app.
const SERVER = 'com.drawais.ambgro';
const ACCOUNT = 'ambgro-dek';

// Statically imported (not `await import(...)`): a runtime dynamic import in the
// Capacitor WebView can stall behind the service worker and never settle, which
// left the availability check pending forever (blank reason on-screen). Importing
// the plugin at module load has no such fetch. On web, `registerPlugin` still
// lazy-loads its web impl only when a method is invoked, and we gate on
// `isNativePlatform()` below, so the web build stays PIN-only.
function plugin(): NativeBiometricPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  return NativeBiometric as unknown as NativeBiometricPlugin;
}

/** Availability plus a human reason, so the UI can explain *why* it is off. */
export interface BiometricStatus {
  available: boolean;
  reason: string;
}

// Best-effort labels for the plugin's error codes; the raw code/type are always
// appended so an unmapped value is still diagnosable on-device.
function describeUnavailable(errorCode?: number, biometryType?: number): string {
  const labels: Record<number, string> = {
    0: 'not reported as available',
    1: 'prompt was cancelled',
    4: 'no biometric hardware available',
    5: 'no fingerprint/face enrolled — add one in Settings',
    7: 'no device screen lock is set',
    10: 'biometrics temporarily locked out',
  };
  const label = errorCode != null && labels[errorCode] ? labels[errorCode] : 'unavailable on this device';
  return `${label} (code ${errorCode ?? '—'}, type ${biometryType ?? '—'})`;
}

/** Availability with a reason. Never throws. */
export async function biometricStatus(): Promise<BiometricStatus> {
  if (!Capacitor.isNativePlatform()) {
    return { available: false, reason: 'only available in the installed Android app' };
  }
  const p = plugin();
  if (!p) {
    return {
      available: false,
      reason: 'biometric plugin not loaded — reinstall the app after syncing native code',
    };
  }
  try {
    // Guard against a native call that never calls back, so the reason is never blank.
    const r = await Promise.race([
      p.isAvailable(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('availability check timed out after 5s')), 5000),
      ),
    ]);
    if (r.isAvailable) return { available: true, reason: 'ok' };
    return { available: false, reason: describeUnavailable(r.errorCode, r.biometryType) };
  } catch (e) {
    return { available: false, reason: 'biometric check failed: ' + (e instanceof Error ? e.message : String(e)) };
  }
}

/** True only when running natively with an enrolled biometric available. */
export async function biometricAvailable(): Promise<boolean> {
  return (await biometricStatus()).available;
}

/** Persist a secret (the base64 DEK) behind the Android Keystore + biometric gate. */
export async function storeSecret(secret: string): Promise<void> {
  const p = plugin();
  if (!p) throw new Error('Biometric unlock is not available on this device.');
  await p.setCredentials({ username: ACCOUNT, password: secret, server: SERVER });
}

/** Prompt for biometric, then return the stored secret. Rejects on cancel/failure. */
export async function fetchSecret(): Promise<string> {
  const p = plugin();
  if (!p) throw new Error('Biometric unlock is not available on this device.');
  await p.verifyIdentity({ title: 'Unlock AMBGro', reason: 'Unlock your patient records' });
  const c = await p.getCredentials({ server: SERVER });
  return c.password;
}

/** Remove the stored secret (best-effort). */
export async function clearSecret(): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.deleteCredentials({ server: SERVER });
  } catch {
    // nothing enrolled / already gone
  }
}
