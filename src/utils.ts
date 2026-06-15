import { CLPublicKey } from 'casper-js-sdk';

/**
 * Casper tagged public key patterns.
 *
 * Casper public keys are 33 bytes total:
 *   - 1 byte algorithm tag (01 = secp256k1, 02 = ed25519, 03 = ed25519 variant)
 *   - 32 bytes of key material
 * In hex that's 66 characters. Some tools generate a 68-character form
 * (1 tag + 33 bytes of material); the casper-js-sdk accepts both.
 */
const TAGGED_PUBLIC_KEY_PATTERN = /0[1-3][0-9a-fA-F]{64,68}/;

/** Canonical length: 66 hex chars (1 byte tag + 32 bytes key). */
const TAGGED_KEY_LENGTH = 66;

/**
 * Extract a tagged Casper public key from arbitrary text.
 * Returns the longest run of hex starting with 0[1-3] (up to 68 chars).
 */
export function extractPublicKey(text: string): string | null {
  const match = text.match(TAGGED_PUBLIC_KEY_PATTERN);
  return match ? match[0] : null;
}

export function parseCasperPublicKey(publicKey: string): CLPublicKey {
  const trimmed = publicKey.trim();

  if (trimmed.startsWith('account-hash-')) {
    throw new Error(
      'Account hash balance lookup is not supported yet. Please provide a public key (starts with 01, 02, or 03).'
    );
  }

  // Tag-prefixed key (66 hex chars = 1 tag + 32 bytes).
  if (/^0[1-3][0-9a-fA-F]{64}$/.test(trimmed)) {
    return CLPublicKey.fromHex(trimmed);
  }

  // 68-char extended form (1 tag + 33 bytes) accepted by the SDK.
  if (/^0[1-3][0-9a-fA-F]{66}$/.test(trimmed)) {
    return CLPublicKey.fromHex(trimmed);
  }

  // 64-char raw key with no tag → assume Ed25519 (tag 02).
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return CLPublicKey.fromHex(`02${trimmed}`);
  }

  // Try to extract a tagged public key from the surrounding text.
  // Pass the candidate as-is: the SDK accepts both 66-char (canonical) and
  // 68-char (extended) variants, and CLPublicKey.fromHex will surface a clear
  // "Invalid public key" error if the input is genuinely malformed.
  const match = trimmed.match(TAGGED_PUBLIC_KEY_PATTERN);
  if (match) {
    return CLPublicKey.fromHex(match[0]);
  }

  throw new Error(
    `Invalid public key format: "${trimmed}". Expected a 66-character hex string starting with 01, 02, or 03 (e.g., 02abc123...).`
  );
}

export function safeJsonStringify(value: unknown, space?: number): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, currentValue) => {
      if (typeof currentValue === 'bigint') {
        return currentValue.toString();
      }
      if (typeof currentValue === 'object' && currentValue !== null) {
        if (seen.has(currentValue)) {
          return '[Circular]';
        }
        seen.add(currentValue);
      }
      return currentValue;
    },
    space
  );
}

export function toSerializable<T>(value: T): T {
  return JSON.parse(safeJsonStringify(value)) as T;
}
