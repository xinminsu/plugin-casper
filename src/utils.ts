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

  return CLPublicKey.fromHex(trimmed);
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
