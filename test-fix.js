// Use the SDK's own key generation to make a real valid key
const path = require('path');
const { Keys, CLPublicKey } = require(path.join(__dirname, 'node_modules/casper-js-sdk'));

// Generate a fresh ed25519 key pair
const kp = Keys.Ed25519.new();
const validHex = kp.publicKey.toHex(false);  // canonical 66-char form
console.log('Generated key (hex):', validHex);
console.log('Length:', validHex.length);

function parseCasperPublicKey(publicKey) {
  const trimmed = publicKey.trim();
  if (trimmed.startsWith('account-hash-')) {
    throw new Error('Account hash lookup not supported');
  }
  const TAGGED_PUBLIC_KEY_PATTERN = /0[1-3][0-9a-fA-F]{64,68}/;
  if (/^0[1-3][0-9a-fA-F]{64}$/.test(trimmed)) {
    return CLPublicKey.fromHex(trimmed);
  }
  if (/^0[1-3][0-9a-fA-F]{66}$/.test(trimmed)) {
    return CLPublicKey.fromHex(trimmed);
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return CLPublicKey.fromHex(`02${trimmed}`);
  }
  const match = trimmed.match(TAGGED_PUBLIC_KEY_PATTERN);
  if (match) return CLPublicKey.fromHex(match[0]);
  throw new Error('Invalid format');
}

// Test parsing a freshly-generated key (canonical 66 chars)
console.log('\n--- 66-char canonical key from SDK ---');
try {
  const pk = parseCasperPublicKey(validHex);
  console.log('PASS:', pk.toHex());
} catch (e) {
  console.log('FAIL:', e.message);
}

// Test raw 64-char hex
const raw = validHex.substring(2);
console.log('\n--- 64-char raw (no tag) ---');
console.log('Raw:', raw);
console.log('Length:', raw.length);
try {
  const pk = parseCasperPublicKey(raw);
  console.log('PASS:', pk.toHex());
} catch (e) {
  console.log('FAIL:', e.message);
}