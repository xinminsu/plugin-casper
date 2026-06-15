import { CLPublicKey } from 'casper-js-sdk';

/** Casper tagged public key: algorithm tag (01/02/03) + 32-byte hex. */
const TAGGED_PUBLIC_KEY_PATTERN = /0[1-3][0-9a-fA-F]{64}/;

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

  // Handle different public key formats
  let hexKey = trimmed;
  
  // If it's already a tagged hex (starts with 01, 02, or 03), use as-is
  if (/^0[1-3][0-9a-fA-F]{64}$/.test(hexKey)) {
    return CLPublicKey.fromHex(hexKey);
  }
  
  // If it's a 64-character hex without tag, assume Ed25519 (tag 02)
  if (/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    return CLPublicKey.fromHex(`02${hexKey}`);
  }
  
  // Try to extract tagged public key from the string
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
