/**
 * Natural-language parameter extraction helpers for Casper actions.
 *
 * These power the category-aggregated actions: each action inspects the raw
 * user message and uses these helpers (plus keyword routing) to decide which
 * underlying service method to call.
 */

/**
 * Extract a tagged Casper public key from arbitrary text.
 * (Mirrors `extractPublicKey` from utils.ts; re-exported here for cohesion.)
 */
const TAGGED_PUBLIC_KEY_PATTERN = /0[1-3][0-9a-fA-F]{64,68}/;

export function extractPublicKey(text: string): string | null {
  const match = text.match(TAGGED_PUBLIC_KEY_PATTERN);
  return match ? match[0] : null;
}

/**
 * Extract a contract / package / deploy hash.
 *
 * Accepts:
 *   - 64-char raw hex
 *   - `hash-<64 hex>`
 *   - `0x<64 hex>`
 * Returns the raw 64-hex form (no prefix). Returns null if none found.
 */
export function extractContractHash(text: string): string | null {
  // Prefer an explicitly-prefixed hash first.
  const prefixed = text.match(/(?:^|[\s,;(])(hash-|0x)([0-9a-fA-F]{64})\b/i);
  if (prefixed) return prefixed[2].toLowerCase();

  // Otherwise grab the first standalone 64-hex run that isn't part of a
  // tagged public key (which is 66+ hex chars starting with 0[1-3]).
  const hexRun = text.match(/(?<!0[1-3])[0-9a-fA-F]{64}/);
  if (hexRun) {
    // Avoid swallowing a 68-char public key by taking exactly 64 chars.
    return hexRun[0].substring(0, 64).toLowerCase();
  }
  return null;
}

/** Match a Casper deploy hash (64-hex), same shape as a contract hash. */
export function extractDeployHash(text: string): string | null {
  const m = text.match(/[0-9a-fA-F]{64}/);
  return m ? m[0] : null;
}

/**
 * Extract a purse URef, e.g. `uref-<32hex>-<3digits>`.
 */
export function extractURef(text: string): string | null {
  const m = text.match(/uref-[0-9a-fA-F]{32}-\d{3}/i);
  return m ? m[0].toLowerCase() : null;
}

/**
 * Extract a numeric amount (supports decimals). Returns the first number that
 * is not obviously a token id / height (heuristic: numbers >= 1 with optional
 * decimal, optionally followed by `CSPR`).
 */
export function extractAmount(text: string): string | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:CSPR|cspr)?/);
  return m ? m[1] : null;
}

/**
 * Extract a token id. NFT token ids are often numeric strings; this returns
 * the first integer-looking token that follows keywords like "token", "id",
 * "nft", or a `#`.
 */
export function extractTokenId(text: string): string | null {
  // "#123" style
  const hash = text.match(/#(\d+)/);
  if (hash) return hash[1];
  // "token id 42" / "token-id: 42" / "nft 42"
  const labeled = text.match(/(?:token(?:[-_\s]?id)?|nft)\s*[:#]?\s*(\d+)/i);
  if (labeled) return labeled[1];
  return null;
}

/**
 * Extract a comma/space separated list of token ids, e.g. "1, 2, 3".
 */
export function extractTokenIds(text: string): string[] {
  const m = text.match(/(?:ids?|tokens?)\s*[:=]?\s*([0-9,\s]+)/i);
  const raw = m ? m[1] : null;
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
}

/**
 * Extract a block height (integer, optionally prefixed by "height").
 */
export function extractBlockHeight(text: string): number | null {
  const m = text.match(/(?:height|block)\s*[:#]?\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  // Bare large integer
  const bare = text.match(/(?<![#0-9a-fA-F.])(\d{4,})(?![0-9a-fA-F])/);
  return bare ? parseInt(bare[1], 10) : null;
}

/**
 * Extract an order id (alphanumeric or numeric).
 */
export function extractOrderId(text: string): string | null {
  const m = text.match(/order(?:[-_\s]?id)?\s*[:#]?\s*([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

/**
 * Extract a weight / rate / threshold (small integer).
 */
export function extractInteger(text: string, keywords: string[] = ['weight', 'rate', 'threshold', 'percent', 'decimals']): number | null {
  const kw = keywords.join('|');
  const m = text.match(new RegExp(`(?:${kw})\\s*[:#]?\\s*(\\d{1,3})`, 'i'));
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Keyword-based subcommand routing. Given the message text and a map of
 * `subcommand -> keywords`, returns the subcommand whose keywords appear in
 * the text, or `defaultSub` if none match.
 */
export function detectSubcommand(
  text: string,
  routes: Record<string, string[]>,
  defaultSub?: string
): string | undefined {
  const lower = text.toLowerCase();
  // Order matters: check more specific routes first (caller should order keys).
  for (const [sub, keywords] of Object.entries(routes)) {
    if (keywords.some((k) => lower.includes(k))) {
      return sub;
    }
  }
  return defaultSub;
}

/** Extract an arbitrary quoted value, e.g. `name="foo"` or `"foo"`. */
export function extractQuoted(text: string, key?: string): string | null {
  if (key) {
    const m = text.match(new RegExp(`${key}\\s*[:=]?\\s*["']([^"']+)["']`, 'i'));
    if (m) return m[1];
  }
  const m = text.match(/["']([^"']{1,200})["']/);
  return m ? m[1] : null;
}
