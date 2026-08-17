// Low-level Web Crypto primitives for the encrypted vault. No app-specific
// knowledge lives here — just PBKDF2 key derivation, AES-GCM encrypt/decrypt,
// DEK wrap/unwrap, and encoding helpers. Kept pure so it is easy to reason about
// and unit-test. All secrets are handled as CryptoKey objects or transient bytes;
// nothing here writes to storage.

const subtle: SubtleCrypto = globalThis.crypto.subtle;
const utf8 = new TextEncoder();
const utf8dec = new TextDecoder();

/** PBKDF2 iteration count. Stored per-vault so it can be raised later without
 *  breaking existing vaults. A short PIN has little entropy, so this (plus the
 *  attempt throttle in the vault) is the real brute-force cost. */
export const PBKDF2_ITERATIONS = 210_000;

/** Public, non-secret parameters describing how a key was stretched. Safe to store. */
export interface KdfParams {
  algo: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  salt: string; // base64
}

/** An AES-GCM ciphertext with its (random, non-secret) IV. */
export interface CipherBlob {
  iv: string; // base64, 12 bytes
  ct: string; // base64
}

// ---- encoding helpers ----

export function toB64(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function newKdfParams(iterations = PBKDF2_ITERATIONS): KdfParams {
  return { algo: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(randomBytes(16)) };
}

// ---- key derivation ----

/** Stretch a low-entropy secret (PIN, recovery code, backup passphrase) into a
 *  256-bit AES-GCM key. The derived key is non-extractable and used only to
 *  encrypt/decrypt (we wrap the DEK by encrypting its raw bytes). */
export async function deriveKey(secret: string, params: KdfParams): Promise<CryptoKey> {
  const baseKey = await subtle.importKey('raw', utf8.encode(secret), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: params.hash, salt: fromB64(params.salt), iterations: params.iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---- data encryption key (DEK) ----

/** Generate a fresh random data-encryption key. Extractable so it can be wrapped
 *  under multiple secrets and handed (raw) to the biometric Keystore plugin. */
export function generateDek(): Promise<CryptoKey> {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportDekRaw(dek: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle.exportKey('raw', dek));
}

export function importDek(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

// ---- AES-GCM primitives ----

async function encryptBytes(key: CryptoKey, data: Uint8Array<ArrayBuffer>): Promise<CipherBlob> {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv: toB64(iv), ct: toB64(ct) };
}

async function decryptBytes(key: CryptoKey, blob: CipherBlob): Promise<Uint8Array<ArrayBuffer>> {
  // Throws (OperationError) if the key is wrong or the ciphertext was tampered
  // with — GCM authenticates. Callers rely on this to detect a wrong PIN.
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ct));
  return new Uint8Array(pt);
}

/** Wrap the DEK by AES-GCM-encrypting its raw bytes under a derived key (KEK). */
export async function wrapKey(kek: CryptoKey, dek: CryptoKey): Promise<CipherBlob> {
  return encryptBytes(kek, await exportDekRaw(dek));
}

/** Unwrap the DEK. Throws if the KEK is wrong (i.e. wrong PIN / recovery code). */
export async function unwrapKey(kek: CryptoKey, blob: CipherBlob): Promise<CryptoKey> {
  return importDek(await decryptBytes(kek, blob));
}

export async function encryptJson(dek: CryptoKey, value: unknown): Promise<CipherBlob> {
  return encryptBytes(dek, utf8.encode(JSON.stringify(value)));
}

export async function decryptJson<T>(dek: CryptoKey, blob: CipherBlob): Promise<T> {
  return JSON.parse(utf8dec.decode(await decryptBytes(dek, blob))) as T;
}

// ---- recovery code ----

// Crockford base32 alphabet (no I, L, O, U to avoid transcription errors).
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A ~100-bit one-time recovery code, formatted XXXX-XXXX-XXXX-XXXX-XXXX.
 *  This is the only way back into the vault if the PIN is forgotten. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(20); // 20 chars x 5 bits = 100 bits; 256 % 32 === 0 → unbiased
  let out = '';
  for (let i = 0; i < 20; i++) out += CROCKFORD[bytes[i] & 31];
  return out.replace(/(.{4})(?=.)/g, '$1-');
}

/** Canonicalise user-typed recovery input: upper-case, strip separators, and
 *  fold visually ambiguous characters onto the Crockford set so a hand-copied
 *  code still matches what we derived from. */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
}
