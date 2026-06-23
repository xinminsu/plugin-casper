# @suxinmin/plugin-casper Testing Guide

This document explains how to verify that the Casper plugin works correctly at the **SDK layer** and the **Eliza Agent integration layer**. Testing on **Casper Testnet** is recommended. Write operations require a dedicated test account and a small amount of CSPR.

---

## 1. Test Environment

### 1.1 Requirements

| Item | Recommended Version |
|------|---------------------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| Network | Must reach `https://node.testnet.casper.network/rpc` |

### 1.2 Environment Variables

Copy `.env.example` to `.env`:

```env
CASPER_NODE_URL=https://node.testnet.casper.network/rpc
CASPER_RPC_URL=https://node.testnet.casper.network/rpc

# Optional: default wallet for Agent (used by Providers)
# CASPER_PUBLIC_KEY=01xxxxxxxx...

# Required for write ops (transfers / contract calls) — set one of:
# CASPER_PRIVATE_KEY=your_private_key_hex
# CASPER_SIGNING_KEY_HEX=your_private_key_hex
# CASPER_SIGNING_KEY_PEM=-----BEGIN PRIVATE KEY-----...

# Optional
# CASPER_CHAIN_NAME=casper-test
# CASPER_API_KEY=your_cspr_cloud_api_key
```

> **Note:** Do not use `rpc.testnet.cspr.cloud` as the default node unless `CASPER_API_KEY` is configured. The recommended public node is `node.testnet.casper.network`.

### 1.3 Build the Plugin

```bash
cd plugin-casper
npm install
npm run build
```

---

## 2. Test Data (Testnet)

The following can be used for **read-only tests** (no private key required):

| Purpose | Value |
|---------|-------|
| Sample public key (with balance) | `01824bf98ef9bba316a50b54e840846bb4129f4ef1066fe9228b9282a591d952b8` |
| Expected balance (approx.) | ~4994 CSPR (verify on-chain) |
| Block explorer | https://testnet.cspr.live |

Public key format notes:

- **Standard format:** 66 hex characters starting with `01` / `02` / `03` (algorithm tag + 32-byte key)
- **Untagged format:** 64 hex characters; the plugin auto-prepends `02`
- **Not supported (currently):** balance lookup by `account-hash-...` only (returns a clear error)

---

## 3. SDK / Client Smoke Tests

No Eliza server required — validates RPC connectivity and `CasperClient` directly.

### 3.1 RPC Connectivity

```bash
curl -X POST https://node.testnet.casper.network/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"chain_get_state_root_hash","params":[],"id":1}'
```

**Expected:** HTTP 200, response contains a `"result"` field.

### 3.2 Latest Block Query

```bash
node -e "
const { CasperClient } = require('./dist/client');
const client = new CasperClient({
  nodeUrl: 'https://node.testnet.casper.network/rpc'
});
client.getLatestBlock()
  .then(b => console.log(JSON.stringify(b, null, 2)))
  .catch(e => console.error('FAIL:', e.message));
"
```

**Expected:**

```json
{
  "stateRootHash": "<64-char hex>",
  "timestamp": "<ISO8601>",
  "height": <positive integer>
}
```

All three fields must be non-empty.

### 3.3 CSPR Balance Query

```bash
node -e "
const { CasperClient } = require('./dist/client');
const client = new CasperClient({
  nodeUrl: 'https://node.testnet.casper.network/rpc'
});
const pk = '01824bf98ef9bba316a50b54e840846bb4129f4ef1066fe9228b9282a591d952b8';
client.getBalance(pk)
  .then(motes => console.log('motes:', motes, 'CSPR:', Number(motes) / 1e9))
  .catch(e => console.error('FAIL:', e.message));
"
```

**Expected:** Returns a motes string; CSPR > 0.

**Common failures:**

| Error | Cause | Fix |
|-------|-------|-----|
| `ConnectionRefused` | RPC node unreachable | Switch to `node.testnet.casper.network` |
| `authorization is not provided` | Node requires an API key | Set `CASPER_API_KEY` or use a public node |
| `Invalid params (-32602)` | Invalid URef / parameter format | Ensure plugin version ≥ 2.0.0 and rebuild |
| `Wrong length of ED25519 key` | Invalid public key format | Use a 66-char tagged public key |

### 3.4 Wallet Generation

```bash
node -e "
const { CasperClient } = require('./dist/client');
const client = new CasperClient({ nodeUrl: 'https://node.testnet.casper.network/rpc' });
const w = client.generateWallet();
console.log({ address: w.address, publicKey: w.publicKey, hasPrivateKey: !!w.privateKey });
"
```

**Expected:** Returns an `account-hash-...` address, 66-char public key, and private key hex.

### 3.5 Public Key Parsing (utils)

```bash
node test-fix.js
```

**Expected:** Both 66-char and 64-char keys print `PASS`.

---

## 4. Eliza Agent Integration Tests

### 4.1 Install the Plugin

In your `casper-agent` project:

```bash
npm install @suxinmin/plugin-casper@latest
# Or for local development:
# npm install /path/to/plugin-casper
```

Register `casperPlugin` in the Agent configuration (see README).

### 4.2 Pre-Launch Checklist

- [ ] `CASPER_NODE_URL` in `.env` points to a reachable Testnet RPC
- [ ] Plugin has been built with `npm run build` (local development)
- [ ] Agent logs show no RPC connection errors

### 4.3 Provider Context

After starting the Agent, context injection depends on Eliza configuration. Providers should supply:

| Provider | Verification |
|----------|--------------|
| `casperNetworkProvider` | Node URL, State Root Hash, Timestamp |
| `casperWalletProvider` | Balance after setting `CASPER_PUBLIC_KEY` |
| `casperGasProvider` | Gas fee reference |

---

## 5. Action Test Cases

Trigger actions via natural language in Agent chat. **Start a new session for each major test run** to avoid the Agent choosing `IGNORE` due to prior failures.

### 5.1 Core Actions (4)

| # | Action | Sample Input | Expected Result |
|---|--------|--------------|-----------------|
| 1 | `GENERATE_CASPER_WALLET` | `Create a new Casper wallet` | Returns address, publicKey, privateKey |
| 2 | `GET_CASPER_BALANCE` | `Check balance for 01824bf98ef9bba316a50b54e840846bb4129f4ef1066fe9228b9282a591d952b8` | Returns CSPR balance |
| 3 | `TRANSFER_CASPER_TOKENS` | `Send 0.1 CSPR to 01abc...` | Requires private key; returns deploy hash |
| 4 | `GET_DEPLOY_STATUS` | `Check deploy status abc123...` (64-char hash) | Returns transaction status JSON |

**Balance query edge cases:**

| Input | Expected |
|-------|----------|
| `Check CSPR balance` (no public key) | Prompt to provide a public key |
| 64-char untagged hex | Auto-tag and query succeeds |
| Invalid hex | Clear format error message |

### 5.2 Network Query — `CASPER_NETWORK_QUERY`

| Subcommand Keywords | Sample Input | Expected |
|---------------------|--------------|----------|
| node status | `Show Casper node status` | Chain name, API version, latest block height |
| peers | `List Casper peers` | Peer list |
| block | `Get block at height 8150000` | Block hash, timestamp, etc. |
| deploy | `Get deploy <deploy_hash>` | Deploy details |
| state root hash | `Get state root hash` | 64-char hex |
| chainspec | `Show chainspec` | Chain specification |
| validators / auction | `Show validators auction info` | Validator / auction info |

### 5.3 Account Read — `CASPER_ACCOUNT_READ`

| Subcommand | Sample Input | Expected |
|------------|--------------|----------|
| account info | `Get account info for 01824bf98e...` | Account hash, main purse |
| named keys | `List named keys for 01824bf98e...` | Named keys list |
| purse | `Get purse balance for 01824bf98e...` | Purse URef and balance |
| contract info | `Get contract info hash-<contract_hash>` | Contract metadata |
| entry points | `List entry points for contract hash-...` | Callable entry points |
| dictionary | `Get dictionary item ...` | Dictionary CLValue |
| global state | `Query global state ...` | Global state query result |

### 5.4 Token Read — `CASPER_TOKEN_READ`

Requires known CEP-18 / CEP-47 / CEP-78 contract hashes deployed on Testnet.

| Subcommand | Sample Input | Expected |
|------------|--------------|----------|
| total supply | `Get CEP-18 total supply for contract hash-...` | Total token supply |
| token balance | `Get token balance of 01... for contract hash-...` | Account token balance |
| allowance | `Get allowance owner 01... spender 01... contract hash-...` | Allowance amount |
| metadata | `Get token metadata for contract hash-...` | name / symbol / decimals |
| NFT owner | `Get NFT owner of token id 1 contract hash-...` | Owner public key |

### 5.5 Staking Read — `CASPER_STAKING_READ`

| Sample Input | Expected |
|--------------|----------|
| `Show era validators` | Current era validator list |
| `Get validator info for 01...` | Stake amount, commission rate, etc. |
| `Get delegations for 01...` | Delegation records |
| `Show auction state` | Auction state |
| `Get era summary` | Era reward summary |

### 5.6 DApp Read — `CASPER_DAPP_READ`

Requires corresponding DApp contracts deployed on Testnet.

| Sample Input | Expected |
|--------------|----------|
| `Get counter value contract hash-...` | Current counter value |
| `Get AMM pool reserves contract hash-...` | Pool reserves |
| `List governance proposals contract hash-...` | Proposal list |
| `Get DEX open orders contract hash-...` | Open orders |

### 5.7 Write Actions (5)

> ⚠️ **Consumes real CSPR for gas.** Use a dedicated test account and fund it on Testnet first.

**Prerequisites:**

```env
CASPER_PRIVATE_KEY=<test account private key hex>
# or
CASPER_SIGNING_KEY_HEX=<test account private key hex>
```

| Action | Sample Input | Expected |
|--------|--------------|----------|
| `CASPER_NATIVE_WRITE` | `Create a new purse` | New purse URef + deploy hash |
| `CASPER_TOKEN_WRITE` | `Mint 100 tokens to 01... contract hash-...` | CEP-18 mint deploy |
| `CASPER_NFT_WRITE` | `Mint NFT token id 1 to 01... contract hash-...` | NFT mint deploy |
| `CASPER_STAKING_WRITE` | `Delegate 10 CSPR to validator 01...` | Delegation deploy |
| `CASPER_DEFI_WRITE` | `Swap 1 CSPR on AMM contract hash-...` | Swap deploy |

Write operation verification steps:

1. Action returns a deploy hash
2. Query via `GET_DEPLOY_STATUS` or explorer: https://testnet.cspr.live/deploy/{deploy_hash}
3. Confirm `execution_results` is success

---

## 6. Regression Test Checklist

Complete at least the following before each release:

### 6.1 Read-Only (Required)

- [ ] RPC connectivity curl passes
- [ ] `getLatestBlock()` — all three fields non-empty
- [ ] `getBalance(01...)` returns correct CSPR
- [ ] Agent chat: `GET_CASPER_BALANCE` succeeds
- [ ] Agent chat: `CASPER_NETWORK_QUERY` node status succeeds
- [ ] No `JSON.stringify cannot serialize cyclic structures` errors

### 6.2 Write (Optional, Testnet)

- [ ] `GENERATE_CASPER_WALLET` produces a valid key pair
- [ ] `TRANSFER_CASPER_TOKENS` small transfer succeeds
- [ ] `GET_DEPLOY_STATUS` finds the previous deploy

### 6.3 Compatibility

- [ ] Public keys with `01` / `02` / `03` prefixes all parse correctly
- [ ] 64-char untagged public keys parse correctly
- [ ] Both `CASPER_NODE_URL` and `CASPER_RPC_URL` work

---

## 7. Troubleshooting

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| `No settings state found for server` | Eliza startup info log | Safe to ignore; ensure `.env` is configured |
| Agent responds with IGNORE | Repeated prior failures | Start a new chat session |
| `Invalid params (-32602)` | RPC params incompatible with Casper 2.0 | Upgrade plugin and rebuild |
| `ConnectionRefused` | RPC host unreachable | Use `node.testnet.casper.network` |
| `authorization is not provided` | CSPR.cloud node without API key | Set `CASPER_API_KEY` |
| Balance is 0 but explorer shows funds | Wrong public key or no main purse | Verify 66-char public key |
| Write fails: `signing key not configured` | No private key configured | Set `CASPER_PRIVATE_KEY` |

---

## 8. Manual RPC Reference Tests

Use these to distinguish **plugin issues** from **node issues**:

```bash
# 1. State root hash
curl -s -X POST https://node.testnet.casper.network/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"chain_get_state_root_hash","params":[],"id":1}' | jq .

# 2. Latest block height
curl -s -X POST https://node.testnet.casper.network/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"chain_get_block","params":[],"id":1}' | jq '.result.block_with_signatures.block.Version2.header.height'

# 3. Node status
curl -s -X POST https://node.testnet.casper.network/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"info_get_status","params":[],"id":1}' | jq '.result.chainspec_name'
```

If curl succeeds but the plugin fails, the issue is in the plugin layer. If curl also fails, check network connectivity and the RPC URL first.

---

## 9. Version History

| Plugin Version | Testing Focus |
|----------------|---------------|
| 1.x | `CasperServiceByJsonRPC`, legacy default node |
| 2.0.0 | Migrated to `RpcClient` + 14 Actions; balance via `getLatestBalance` + `uref-` prefix |
| 2.0.0+ | `01` public key prefix support, Casper 2.0 block structure compatibility |

---

## 10. References

- [Casper Testnet Explorer](https://testnet.cspr.live)
- [Casper Official Documentation](https://docs.casper.network/)
- [casper-js-sdk](https://github.com/casper-ecosystem/casper-js-sdk)
- [Plugin README](./README.md)
