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

// Minimal shape of the bits of the plugin we use, so this file type-checks even
// if the native package is not installed in a given environment.
interface NativeBiometricPlugin {
  isAvailable(): Promise<{ isAvailable: boolean }>;
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

let cached: NativeBiometricPlugin | null | undefined;

async function plugin(): Promise<NativeBiometricPlugin | null> {
  if (cached !== undefined) return cached;
  cached = null;
  if (!Capacitor.isNativePlatform()) return cached;
  try {
    const mod = (await import('@capgo/capacitor-native-biometric')) as {
      NativeBiometric?: NativeBiometricPlugin;
    };
    cached = mod.NativeBiometric ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

/** True only when running natively with an enrolled biometric available. */
export async function biometricAvailable(): Promise<boolean> {
  const p = await plugin();
  if (!p) return false;
  try {
    const r = await p.isAvailable();
    return !!r.isAvailable;
  } catch {
    return false;
  }
}

/** Persist a secret (the base64 DEK) behind the Android Keystore + biometric gate. */
export async function storeSecret(secret: string): Promise<void> {
  const p = await plugin();
  if (!p) throw new Error('Biometric unlock is not available on this device.');
  await p.setCredentials({ username: ACCOUNT, password: secret, server: SERVER });
}

/** Prompt for biometric, then return the stored secret. Rejects on cancel/failure. */
export async function fetchSecret(): Promise<string> {
  const p = await plugin();
  if (!p) throw new Error('Biometric unlock is not available on this device.');
  await p.verifyIdentity({ title: 'Unlock AMBGro', reason: 'Unlock your patient records' });
  const c = await p.getCredentials({ server: SERVER });
  return c.password;
}

/** Remove the stored secret (best-effort). */
export async function clearSecret(): Promise<void> {
  const p = await plugin();
  if (!p) return;
  try {
    await p.deleteCredentials({ server: SERVER });
  } catch {
    // nothing enrolled / already gone
  }
}
