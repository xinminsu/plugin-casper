import axios from 'axios';
import { ethers } from 'ethers';
import {
  Deploy,
  DeployHeader,
  ExecutableDeployItem,
  TransferDeployItem,
  StoredContractByHash,
  StoredVersionedContractByHash,
  Args,
  CLValue,
  PrivateKey,
  PublicKey,
  KeyAlgorithm,
  Timestamp,
  Duration,
  URef,
  Hash,
} from 'casper-js-sdk';
/**
 * Casper transaction service.
 *
 * Ported from casper-discord-skill. Discord/winston/dotenv dependencies were
 * removed: signing key + chain name + RPC URL are injected via
 * `configureSigner()` (called from config.ts at client construction time).
 */

// Default TTL: 30 minutes (1800000 ms)
const DEFAULT_TTL_MS = 1800000;
// Default gas price
const DEFAULT_GAS_PRICE = 1;

let rpcUrl = 'https://node.testnet.casper.network/rpc';
let apiKey: string | undefined;
let chainName = 'casper-test';

let configuredPemKey: string | undefined;
let configuredHexKey: string | undefined;
let configuredAlgorithm: string = 'ed25519';

let cachedPrivateKey: PrivateKey | null = null;
let cachedPublicKey: PublicKey | null = null;

const logger = {
  info: (msg: string) => console.log(`[casper-tx] ${msg}`),
  error: (msg: string) => console.error(`[casper-tx] ${msg}`),
};

/**
 * Inject signer + network settings from runtime settings. Called by
 * `createCasperClient` / write Action handlers.
 */
export function configureSigner(opts: {
  rpcUrl: string;
  apiKey?: string;
  chainName?: string;
  signingKeyPem?: string;
  signingKeyHex?: string;
  keyAlgorithm?: string;
}): void {
  rpcUrl = opts.rpcUrl || rpcUrl;
  apiKey = opts.apiKey;
  chainName = opts.chainName || 'casper-test';
  configuredPemKey = opts.signingKeyPem;
  configuredHexKey = opts.signingKeyHex;
  configuredAlgorithm = (opts.keyAlgorithm || 'ed25519').toLowerCase();
  // Invalidate cached key when configuration changes.
  cachedPrivateKey = null;
  cachedPublicKey = null;
}

/** Whether a signing key has been configured. */
export function isSigningKeyConfigured(): boolean {
  return !!(configuredPemKey || configuredHexKey);
}

// ============================================================
// Key Management
// ============================================================

/**
 * Load the signing private key from injected configuration.
 * Supports hex format (without 0x prefix) or PEM format.
 */
export function getSigningKey(): PrivateKey {
  if (cachedPrivateKey) return cachedPrivateKey;

  const keyAlgorithm =
    configuredAlgorithm === 'secp256k1' ? KeyAlgorithm.SECP256K1 : KeyAlgorithm.ED25519;

  if (configuredPemKey) {
    cachedPrivateKey = PrivateKey.fromPem(configuredPemKey, keyAlgorithm);
  } else if (configuredHexKey) {
    cachedPrivateKey = PrivateKey.fromHex(configuredHexKey, keyAlgorithm);
  } else {
    throw new Error(
      'No signing key configured. Set CASPER_SIGNING_KEY_HEX or CASPER_SIGNING_KEY_PEM in environment variables.\n' +
        'Generate a key pair with: npx casper-client keygen -a ed25519'
    );
  }

  cachedPublicKey = cachedPrivateKey.publicKey;
  logger.info(`Signing key loaded. Public key: ${cachedPublicKey.toHex()}`);
  return cachedPrivateKey;
}

/** Get the public key associated with the signing key. */
export function getSigningPublicKey(): PublicKey {
  if (!cachedPublicKey) {
    getSigningKey();
  }
  return cachedPublicKey!;
}

// ============================================================
// Deploy Submission
// ============================================================

/** Submit a signed deploy to the network. */
export async function submitDeploy(deploy: Deploy): Promise<string> {
  const deployJson = Deploy.toJSON(deploy);

  try {
    const response = await axios.post(
      rpcUrl,
      {
        jsonrpc: '2.0',
        method: 'account_put_deploy',
        params: { deploy: deployJson },
        id: 1,
      },
      {
        timeout: 30000,
        headers: apiKey
          ? { 'Content-Type': 'application/json', Authorization: apiKey }
          : { 'Content-Type': 'application/json' },
      }
    );

    if (response.data.error) {
      throw new Error(`RPC Error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result.deploy_hash;
  } catch (error: any) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout: Casper RPC node did not respond within 30 seconds');
    }
    throw error;
  }
}

/**
 * Wait for a deploy to be confirmed on-chain.
 * Polls info_get_deploy until the deploy has execution results.
 */
export async function waitForDeployConfirmation(deployHash: string, timeoutMs: number = 120000): Promise<any> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await axios.post(
        rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'info_get_deploy',
          params: { DeployHash: deployHash },
          id: 1,
        },
        {
          timeout: 15000,
          headers: apiKey
            ? { 'Content-Type': 'application/json', Authorization: apiKey }
            : { 'Content-Type': 'application/json' },
        }
      );

      if (response.data.error) {
        // Deploy not found yet, keep polling
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        continue;
      }

      const result = response.data.result;
      if (result.execution_results && result.execution_results.length > 0) {
        return result;
      }

      // Deploy accepted but not yet executed, keep polling
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      // Network error, keep polling
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(
    `Deploy ${deployHash} was not confirmed within ${timeoutMs / 1000} seconds. It may still be pending.`
  );
}

/**
 * Create, sign, and submit a deploy, then wait for confirmation.
 */
export async function signAndSubmitDeploy(
  session: ExecutableDeployItem,
  gasPayment: string = '10000000000'
): Promise<{ deployHash: string; result: any }> {
  const signingKey = getSigningKey();
  const publicKey = signingKey.publicKey;

  // Create deploy header
  const header = new DeployHeader(
    chainName,
    [], // no dependencies
    DEFAULT_GAS_PRICE,
    new Timestamp(new Date()),
    new Duration(DEFAULT_TTL_MS),
    publicKey
  );

  // Standard payment
  const payment = ExecutableDeployItem.standardPayment(gasPayment);

  // Create deploy
  const deploy = Deploy.makeDeploy(header, payment, session);

  // Sign deploy
  deploy.sign(signingKey);

  // Submit deploy
  const deployHash = await submitDeploy(deploy);
  logger.info(`Deploy submitted: ${deployHash}`);

  // Wait for confirmation
  const result = await waitForDeployConfirmation(deployHash);

  return { deployHash, result };
}

// ============================================================
// 1. Native CSPR Operations
// ============================================================

/** Transfer CSPR to another account. */
export async function transferCspr(
  targetPublicKey: string,
  amount: string,
  transferId?: number,
  sourcePurse?: string
): Promise<{ deployHash: string; result: any }> {
  const targetPubKey = PublicKey.fromHex(targetPublicKey);
  const amountMotes = ethers.parseUnits(amount, 9).toString();
  const id = transferId ?? Math.floor(Math.random() * 1000000);

  let sourceUref: URef | null = null;
  if (sourcePurse) {
    sourceUref = URef.fromString(sourcePurse);
  }

  const transferItem = TransferDeployItem.newTransfer(amountMotes, targetPubKey, sourceUref, id);

  const session = new ExecutableDeployItem();
  session.transfer = transferItem;

  return signAndSubmitDeploy(session);
}

/**
 * Create a new purse (via session code - requires empty module bytes).
 * Note: Creating a purse requires custom session code or calling a contract.
 */
export async function createPurse(purseName?: string): Promise<{ deployHash: string; result: any }> {
  const args = new Args(new Map());
  if (purseName) {
    args.insert('purse_name', CLValue.newCLString(purseName));
  }

  // Empty module bytes for native operation
  const session = ExecutableDeployItem.newModuleBytes(new Uint8Array(0), args);

  return signAndSubmitDeploy(session);
}

/** Add an associated key to the account. */
export async function addAssociatedKey(
  accountToAdd: string,
  weight: number
): Promise<{ deployHash: string; result: any }> {
  const pubKey = PublicKey.fromHex(accountToAdd);
  const accountHash = pubKey.accountHash();

  const args = Args.fromMap({
    key: CLValue.newCLByteArray(accountHash.toBytes()),
    weight: CLValue.newCLUint8(weight),
  });

  // This is a system operation via session code
  const session = ExecutableDeployItem.newModuleBytes(new Uint8Array(0), args);

  return signAndSubmitDeploy(session);
}

/** Remove an associated key from the account. */
export async function removeAssociatedKey(accountToRemove: string): Promise<{ deployHash: string; result: any }> {
  const pubKey = PublicKey.fromHex(accountToRemove);
  const accountHash = pubKey.accountHash();

  const args = Args.fromMap({
    key: CLValue.newCLByteArray(accountHash.toBytes()),
  });

  const session = ExecutableDeployItem.newModuleBytes(new Uint8Array(0), args);

  return signAndSubmitDeploy(session);
}

/** Set action threshold for the account. */
export async function setActionThreshold(
  actionType: string,
  threshold: number
): Promise<{ deployHash: string; result: any }> {
  // action_type: 0 = deployment, 1 = key_management
  const actionTypeByte = actionType.toLowerCase() === 'deployment' ? 0 : 1;

  const args = Args.fromMap({
    action_type: CLValue.newCLUint8(actionTypeByte),
    threshold: CLValue.newCLUint8(threshold),
  });

  const session = ExecutableDeployItem.newModuleBytes(new Uint8Array(0), args);

  return signAndSubmitDeploy(session);
}

/** Put a named key on the account. */
export async function putNamedKey(name: string, keyValue: string): Promise<{ deployHash: string; result: any }> {
  // Parse the key value - could be a URef, Account, Hash, etc.
  const key = new Hash(ethers.getBytes(keyValue));

  const args = Args.fromMap({
    name: CLValue.newCLString(name),
    key: CLValue.newCLKey(key as any),
  });

  const session = ExecutableDeployItem.newModuleBytes(new Uint8Array(0), args);

  return signAndSubmitDeploy(session);
}

// ============================================================
// 2. Contract Lifecycle Operations
// ============================================================

/** Install a new smart contract (deploy Wasm). */
export async function installContract(
  wasmBytes: Uint8Array,
  args: Map<string, CLValue>
): Promise<{ deployHash: string; result: any }> {
  const runtimeArgs = new Args(args);
  const session = ExecutableDeployItem.newModuleBytes(wasmBytes, runtimeArgs);

  // Contract installation requires more gas
  return signAndSubmitDeploy(session, '50000000000'); // 50 CSPR for contract install
}

/** Upgrade an existing contract at a given contract hash. */
export async function upgradeContract(
  contractHash: string,
  wasmBytes: Uint8Array,
  args: Map<string, CLValue>
): Promise<{ deployHash: string; result: any }> {
  const runtimeArgs = new Args(args);
  runtimeArgs.insert('contract_hash', CLValue.newCLByteArray(ethers.getBytes(contractHash)));

  const session = ExecutableDeployItem.newModuleBytes(wasmBytes, runtimeArgs);

  return signAndSubmitDeploy(session, '50000000000');
}

/** Call a stored contract by hash. */
export async function callContract(
  contractHash: string,
  entryPoint: string,
  args: Map<string, CLValue> | Args
): Promise<{ deployHash: string; result: any }> {
  const hashBytes = ethers.getBytes(contractHash);
  const contractHashObj = new Hash(hashBytes) as any;
  const runtimeArgs = args instanceof Args ? args : new Args(args);

  const storedContract = new StoredContractByHash(contractHashObj, entryPoint, runtimeArgs);

  const session = new ExecutableDeployItem();
  session.storedContractByHash = storedContract;

  return signAndSubmitDeploy(session);
}

/** Call a stored versioned contract by hash. */
export async function callVersionedContract(
  contractHash: string,
  version: number,
  entryPoint: string,
  args: Map<string, CLValue> | Args
): Promise<{ deployHash: string; result: any }> {
  const hashBytes = ethers.getBytes(contractHash);
  const contractHashObj = new Hash(hashBytes) as any;
  const runtimeArgs = args instanceof Args ? args : new Args(args);

  const storedContract = new StoredVersionedContractByHash(contractHashObj, entryPoint, runtimeArgs, version);

  const session = new ExecutableDeployItem();
  session.storedVersionedContractByHash = storedContract;

  return signAndSubmitDeploy(session);
}

// ============================================================
// 3. CEP-18 Fungible Token Operations
// ============================================================

/** Mint CEP-18 tokens. */
export async function cep18Mint(
  contractHash: string,
  owner: string,
  amount: string,
  decimals: number = 9
): Promise<{ deployHash: string; result: any }> {
  const ownerPubKey = PublicKey.fromHex(owner);
  const amountBig = ethers.parseUnits(amount, decimals).toString();

  const args = Args.fromMap({
    owner: CLValue.newCLPublicKey(ownerPubKey),
    amount: CLValue.newCLUInt256(amountBig),
  });

  return callContract(contractHash, 'mint', args);
}

/** Burn CEP-18 tokens. */
export async function cep18Burn(
  contractHash: string,
  owner: string,
  amount: string,
  decimals: number = 9
): Promise<{ deployHash: string; result: any }> {
  const ownerPubKey = PublicKey.fromHex(owner);
  const amountBig = ethers.parseUnits(amount, decimals).toString();

  const args = Args.fromMap({
    owner: CLValue.newCLPublicKey(ownerPubKey),
    amount: CLValue.newCLUInt256(amountBig),
  });

  return callContract(contractHash, 'burn', args);
}

/** Transfer CEP-18 tokens. */
export async function cep18Transfer(
  contractHash: string,
  recipient: string,
  amount: string,
  decimals: number = 9
): Promise<{ deployHash: string; result: any }> {
  const recipientPubKey = PublicKey.fromHex(recipient);
  const amountBig = ethers.parseUnits(amount, decimals).toString();

  const args = Args.fromMap({
    recipient: CLValue.newCLPublicKey(recipientPubKey),
    amount: CLValue.newCLUInt256(amountBig),
  });

  return callContract(contractHash, 'transfer', args);
}

/** Approve a spender for CEP-18 tokens. */
export async function cep18Approve(
  contractHash: string,
  spender: string,
  amount: string,
  decimals: number = 9
): Promise<{ deployHash: string; result: any }> {
  const spenderPubKey = PublicKey.fromHex(spender);
  const amountBig = ethers.parseUnits(amount, decimals).toString();

  const args = Args.fromMap({
    spender: CLValue.newCLPublicKey(spenderPubKey),
    amount: CLValue.newCLUInt256(amountBig),
  });

  return callContract(contractHash, 'approve', args);
}

/** Increase allowance for CEP-18 tokens. */
export async function cep18IncreaseAllowance(
  contractHash: string,
  spender: string,
  amount: string,
  decimals: number = 9
): Promise<{ deployHash: string; result: any }> {
  const spenderPubKey = PublicKey.fromHex(spender);
  const amountBig = ethers.parseUnits(amount, decimals).toString();

  const args = Args.fromMap({
    spender: CLValue.newCLPublicKey(spenderPubKey),
    amount: CLValue.newCLUInt256(amountBig),
  });

  return callContract(contractHash, 'increase_allowance', args);
}

/** Decrease allowance for CEP-18 tokens. */
export async function cep18DecreaseAllowance(
  contractHash: string,
  spender: string,
  amount: string,
  decimals: number = 9
): Promise<{ deployHash: string; result: any }> {
  const spenderPubKey = PublicKey.fromHex(spender);
  const amountBig = ethers.parseUnits(amount, decimals).toString();

  const args = Args.fromMap({
    spender: CLValue.newCLPublicKey(spenderPubKey),
    amount: CLValue.newCLUInt256(amountBig),
  });

  return callContract(contractHash, 'decrease_allowance', args);
}

/** Transfer from (approved spender transfers tokens on behalf of owner). */
export async function cep18TransferFrom(
  contractHash: string,
  owner: string,
  recipient: string,
  amount: string,
  decimals: number = 9
): Promise<{ deployHash: string; result: any }> {
  const ownerPubKey = PublicKey.fromHex(owner);
  const recipientPubKey = PublicKey.fromHex(recipient);
  const amountBig = ethers.parseUnits(amount, decimals).toString();

  const args = Args.fromMap({
    owner: CLValue.newCLPublicKey(ownerPubKey),
    recipient: CLValue.newCLPublicKey(recipientPubKey),
    amount: CLValue.newCLUInt256(amountBig),
  });

  return callContract(contractHash, 'transfer_from', args);
}

// ============================================================
// 4. CEP-47 / CEP-78 NFT Operations
// ============================================================

/** Mint a single NFT (CEP-47). */
export async function cep47Mint(
  contractHash: string,
  recipient: string,
  tokenId: string,
  metadata?: Record<string, string>
): Promise<{ deployHash: string; result: any }> {
  const recipientPubKey = PublicKey.fromHex(recipient);

  const args = Args.fromMap({
    recipient: CLValue.newCLPublicKey(recipientPubKey),
    token_id: CLValue.newCLString(tokenId),
  });

  if (metadata) {
    const metadataMap = CLValue.newCLMap(CLValue.newCLString('').type, CLValue.newCLString('').type);
    for (const [key, value] of Object.entries(metadata)) {
      metadataMap.map?.append(CLValue.newCLString(key), CLValue.newCLString(value));
    }
    args.insert('metadata', metadataMap);
  }

  return callContract(contractHash, 'mint', args);
}

/** Mint multiple NFT copies (CEP-47). */
export async function cep47MintCopies(
  contractHash: string,
  recipient: string,
  count: number
): Promise<{ deployHash: string; result: any }> {
  const recipientPubKey = PublicKey.fromHex(recipient);

  const args = Args.fromMap({
    recipient: CLValue.newCLPublicKey(recipientPubKey),
    count: CLValue.newCLUint64(count),
  });

  return callContract(contractHash, 'mint_copies', args);
}

/** Burn an NFT (CEP-47). */
export async function cep47Burn(
  contractHash: string,
  owner: string,
  tokenId: string
): Promise<{ deployHash: string; result: any }> {
  const ownerPubKey = PublicKey.fromHex(owner);

  const args = Args.fromMap({
    owner: CLValue.newCLPublicKey(ownerPubKey),
    token_id: CLValue.newCLString(tokenId),
  });

  return callContract(contractHash, 'burn', args);
}

/** Transfer an NFT (CEP-47). */
export async function cep47Transfer(
  contractHash: string,
  recipient: string,
  tokenId: string
): Promise<{ deployHash: string; result: any }> {
  const recipientPubKey = PublicKey.fromHex(recipient);

  const args = Args.fromMap({
    recipient: CLValue.newCLPublicKey(recipientPubKey),
    token_id: CLValue.newCLString(tokenId),
  });

  return callContract(contractHash, 'transfer', args);
}

/** Approve NFT transfer (CEP-47). */
export async function cep47Approve(
  contractHash: string,
  spender: string,
  tokenId: string
): Promise<{ deployHash: string; result: any }> {
  const spenderPubKey = PublicKey.fromHex(spender);

  const args = Args.fromMap({
    spender: CLValue.newCLPublicKey(spenderPubKey),
    token_id: CLValue.newCLString(tokenId),
  });

  return callContract(contractHash, 'approve', args);
}

/** Transfer NFT from approved spender (CEP-47). */
export async function cep47TransferFrom(
  contractHash: string,
  owner: string,
  recipient: string,
  tokenId: string
): Promise<{ deployHash: string; result: any }> {
  const ownerPubKey = PublicKey.fromHex(owner);
  const recipientPubKey = PublicKey.fromHex(recipient);

  const args = Args.fromMap({
    owner: CLValue.newCLPublicKey(ownerPubKey),
    recipient: CLValue.newCLPublicKey(recipientPubKey),
    token_id: CLValue.newCLString(tokenId),
  });

  return callContract(contractHash, 'transfer_from', args);
}

/** Set token metadata (CEP-78). */
export async function cep78SetTokenMetadata(
  contractHash: string,
  tokenId: string,
  metadata: Record<string, string>
): Promise<{ deployHash: string; result: any }> {
  const metadataMap = CLValue.newCLMap(CLValue.newCLString('').type, CLValue.newCLString('').type);

  for (const [key, value] of Object.entries(metadata)) {
    metadataMap.map?.append(CLValue.newCLString(key), CLValue.newCLString(value));
  }

  const args = Args.fromMap({
    token_id: CLValue.newCLString(tokenId),
    metadata: metadataMap,
  });

  return callContract(contractHash, 'set_token_metadata', args);
}

/** Batch transfer NFTs (CEP-78). */
export async function cep78BatchTransfer(
  contractHash: string,
  recipient: string,
  tokenIds: string[]
): Promise<{ deployHash: string; result: any }> {
  const recipientPubKey = PublicKey.fromHex(recipient);

  const tokenList = CLValue.newCLList(
    CLValue.newCLString('').type,
    tokenIds.map((id) => CLValue.newCLString(id))
  );

  const args = Args.fromMap({
    recipient: CLValue.newCLPublicKey(recipientPubKey),
    token_ids: tokenList,
  });

  return callContract(contractHash, 'batch_transfer', args);
}

/** Batch burn NFTs (CEP-78). */
export async function cep78BatchBurn(
  contractHash: string,
  owner: string,
  tokenIds: string[]
): Promise<{ deployHash: string; result: any }> {
  const ownerPubKey = PublicKey.fromHex(owner);

  const tokenList = CLValue.newCLList(
    CLValue.newCLString('').type,
    tokenIds.map((id) => CLValue.newCLString(id))
  );

  const args = Args.fromMap({
    owner: CLValue.newCLPublicKey(ownerPubKey),
    token_ids: tokenList,
  });

  return callContract(contractHash, 'batch_burn', args);
}

/** Set admin for NFT contract (CEP-78). */
export async function cep78SetAdmin(
  contractHash: string,
  admin: string
): Promise<{ deployHash: string; result: any }> {
  const adminPubKey = PublicKey.fromHex(admin);

  const args = Args.fromMap({
    admin: CLValue.newCLPublicKey(adminPubKey),
  });

  return callContract(contractHash, 'set_admin', args);
}

// ============================================================
// 5. Staking / Consensus Operations
// ============================================================

/** Bond (self-stake) to become a validator. */
export async function bond(
  amount: string,
  delegatorRate?: number
): Promise<{ deployHash: string; result: any }> {
  const amountMotes = ethers.parseUnits(amount, 9).toString();

  const argsMap = new Map<string, CLValue>();
  argsMap.set('amount', CLValue.newCLUInt512(amountMotes));

  if (delegatorRate !== undefined) {
    argsMap.set('delegator_rate', CLValue.newCLUint8(delegatorRate));
  }

  const args = new Args(argsMap);

  const session = ExecutableDeployItem.newModuleBytes(new Uint8Array(0), args);

  return signAndSubmitDeploy(session);
}

/** Delegate CSPR to a validator. */
export async function delegate(
  validator: string,
  amount: string
): Promise<{ deployHash: string; result: any }> {
  const validatorPubKey = PublicKey.fromHex(validator);
  const amountMotes = ethers.parseUnits(amount, 9).toString();

  const args = Args.fromMap({
    validator: CLValue.newCLPublicKey(validatorPubKey),
    amount: CLValue.newCLUInt512(amountMotes),
  });

  const session = ExecutableDeployItem.newModuleBytes(new Uint8Array(0), args);

  return signAndSubmitDeploy(session);
}

/** Unbond self-staked CSPR. */
export async function unbond(amount: string): Promise<{ deployHash: string; result: any }> {
  const amountMotes = ethers.parseUnits(amount, 9).toString();

  const args = Args.fromMap({
    amount: CLValue.newCLUInt512(amountMotes),
  });

  const session = ExecutableDeployItem.newModuleBytes(new Uint8Array(0), args);

  return signAndSubmitDeploy(session);
}

/** Undelegate (withdraw delegation from a validator). */
export async function undelegate(
  validator: string,
  amount: string
): Promise<{ deployHash: string; result: any }> {
  const validatorPubKey = PublicKey.fromHex(validator);
  const amountMotes = ethers.parseUnits(amount, 9).toString();

  const args = Args.fromMap({
    validator: CLValue.newCLPublicKey(validatorPubKey),
    amount: CLValue.newCLUInt512(amountMotes),
  });

  const session = ExecutableDeployItem.newModuleBytes(new Uint8Array(0), args);

  return signAndSubmitDeploy(session);
}

/** Withdraw staking rewards. */
export async function withdrawRewards(): Promise<{ deployHash: string; result: any }> {
  const args = new Args(new Map());
  const session = ExecutableDeployItem.newModuleBytes(new Uint8Array(0), args);

  return signAndSubmitDeploy(session);
}

/** Set validator commission rate. */
export async function setCommissionRate(
  commissionRate: number
): Promise<{ deployHash: string; result: any }> {
  const args = Args.fromMap({
    commission_rate: CLValue.newCLUint8(commissionRate),
  });

  const session = ExecutableDeployItem.newModuleBytes(new Uint8Array(0), args);

  return signAndSubmitDeploy(session);
}

// ============================================================
// 6. DeFi AMM / Liquidity Operations
// ============================================================

/** Swap tokens on an AMM DEX. */
export async function ammSwap(
  contractHash: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  minAmountOut: string,
  decimals: number = 9
): Promise<{ deployHash: string; result: any }> {
  const amountInBig = ethers.parseUnits(amountIn, decimals).toString();
  const minAmountOutBig = ethers.parseUnits(minAmountOut, decimals).toString();

  const args = Args.fromMap({
    token_in: CLValue.newCLByteArray(ethers.getBytes(tokenIn)),
    token_out: CLValue.newCLByteArray(ethers.getBytes(tokenOut)),
    amount_in: CLValue.newCLUInt256(amountInBig),
    min_amount_out: CLValue.newCLUInt256(minAmountOutBig),
  });

  return callContract(contractHash, 'swap', args);
}

/** Add liquidity to an AMM pool. */
export async function addLiquidity(
  contractHash: string,
  tokenA: string,
  tokenB: string,
  amountA: string,
  amountB: string,
  decimals: number = 9
): Promise<{ deployHash: string; result: any }> {
  const amountABig = ethers.parseUnits(amountA, decimals).toString();
  const amountBBig = ethers.parseUnits(amountB, decimals).toString();

  const args = Args.fromMap({
    token_a: CLValue.newCLByteArray(ethers.getBytes(tokenA)),
    token_b: CLValue.newCLByteArray(ethers.getBytes(tokenB)),
    amount_a: CLValue.newCLUInt256(amountABig),
    amount_b: CLValue.newCLUInt256(amountBBig),
  });

  return callContract(contractHash, 'add_liquidity', args);
}

/** Remove liquidity from an AMM pool. */
export async function removeLiquidity(
  contractHash: string,
  lpToken: string,
  lpAmount: string,
  minAmountA: string,
  minAmountB: string,
  decimals: number = 9
): Promise<{ deployHash: string; result: any }> {
  const lpAmountBig = ethers.parseUnits(lpAmount, decimals).toString();
  const minAmountABig = ethers.parseUnits(minAmountA, decimals).toString();
  const minAmountBBig = ethers.parseUnits(minAmountB, decimals).toString();

  const args = Args.fromMap({
    lp_token: CLValue.newCLByteArray(ethers.getBytes(lpToken)),
    lp_amount: CLValue.newCLUInt256(lpAmountBig),
    min_amount_a: CLValue.newCLUInt256(minAmountABig),
    min_amount_b: CLValue.newCLUInt256(minAmountBBig),
  });

  return callContract(contractHash, 'remove_liquidity', args);
}

/** Stake LP tokens for farming rewards. */
export async function stakeLp(
  contractHash: string,
  lpToken: string,
  amount: string,
  decimals: number = 9
): Promise<{ deployHash: string; result: any }> {
  const amountBig = ethers.parseUnits(amount, decimals).toString();

  const args = Args.fromMap({
    lp_token: CLValue.newCLByteArray(ethers.getBytes(lpToken)),
    amount: CLValue.newCLUInt256(amountBig),
  });

  return callContract(contractHash, 'stake_lp', args);
}

/** Claim farming rewards. */
export async function claimReward(contractHash: string): Promise<{ deployHash: string; result: any }> {
  const args = new Args(new Map());
  return callContract(contractHash, 'claim_reward', args);
}

/** Create a limit order on a DEX. */
export async function createOrder(
  contractHash: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  price: string,
  decimals: number = 9
): Promise<{ deployHash: string; result: any }> {
  const amountInBig = ethers.parseUnits(amountIn, decimals).toString();
  const priceBig = ethers.parseUnits(price, decimals).toString();

  const args = Args.fromMap({
    token_in: CLValue.newCLByteArray(ethers.getBytes(tokenIn)),
    token_out: CLValue.newCLByteArray(ethers.getBytes(tokenOut)),
    amount_in: CLValue.newCLUInt256(amountInBig),
    price: CLValue.newCLUInt256(priceBig),
  });

  return callContract(contractHash, 'create_order', args);
}

/** Cancel a DEX order. */
export async function cancelOrder(
  contractHash: string,
  orderId: string
): Promise<{ deployHash: string; result: any }> {
  const args = Args.fromMap({
    order_id: CLValue.newCLString(orderId),
  });

  return callContract(contractHash, 'cancel_order', args);
}

// ============================================================
// 7. General DApp Operations
// ============================================================

/** Increment a counter contract. */
export async function counterIncrement(contractHash: string): Promise<{ deployHash: string; result: any }> {
  const args = new Args(new Map());
  return callContract(contractHash, 'counter_inc', args);
}

/** Decrement a counter contract. */
export async function counterDecrement(contractHash: string): Promise<{ deployHash: string; result: any }> {
  const args = new Args(new Map());
  return callContract(contractHash, 'counter_dec', args);
}

/** Write a key-value pair to a dictionary via contract. */
export async function dictionaryPut(
  contractHash: string,
  key: string,
  value: string
): Promise<{ deployHash: string; result: any }> {
  const args = Args.fromMap({
    key: CLValue.newCLString(key),
    value: CLValue.newCLString(value),
  });

  return callContract(contractHash, 'dictionary_put', args);
}

/** Remove a key from a dictionary via contract. */
export async function dictionaryRemove(
  contractHash: string,
  key: string
): Promise<{ deployHash: string; result: any }> {
  const args = Args.fromMap({
    key: CLValue.newCLString(key),
  });

  return callContract(contractHash, 'dictionary_remove', args);
}

/** Create a governance proposal. */
export async function createProposal(
  contractHash: string,
  title: string,
  description: string,
  votingDuration: number
): Promise<{ deployHash: string; result: any }> {
  const args = Args.fromMap({
    title: CLValue.newCLString(title),
    description: CLValue.newCLString(description),
    voting_duration: CLValue.newCLUint64(votingDuration),
  });

  return callContract(contractHash, 'create_proposal', args);
}

/** Cast a vote on a governance proposal. */
export async function castVote(
  contractHash: string,
  proposalId: string,
  voteOption: string
): Promise<{ deployHash: string; result: any }> {
  const voteByte = voteOption.toLowerCase().startsWith('for') ? 1 : 0;

  const args = Args.fromMap({
    proposal_id: CLValue.newCLString(proposalId),
    vote: CLValue.newCLUint8(voteByte),
  });

  return callContract(contractHash, 'cast_vote', args);
}

/** Execute a governance proposal. */
export async function executeProposal(
  contractHash: string,
  proposalId: string
): Promise<{ deployHash: string; result: any }> {
  const args = Args.fromMap({
    proposal_id: CLValue.newCLString(proposalId),
  });

  return callContract(contractHash, 'execute_proposal', args);
}

/** Save an RWA asset record to the blockchain. */
export async function saveAssetRecord(
  contractHash: string,
  assetId: string,
  ownerHash: string,
  documentHash: string,
  metadata?: string
): Promise<{ deployHash: string; result: any }> {
  const argsMap = new Map<string, CLValue>();
  argsMap.set('asset_id', CLValue.newCLString(assetId));
  argsMap.set('owner_hash', CLValue.newCLByteArray(ethers.getBytes(ownerHash)));
  argsMap.set('document_hash', CLValue.newCLByteArray(ethers.getBytes(documentHash)));

  if (metadata) {
    argsMap.set('metadata', CLValue.newCLString(metadata));
  }

  const args = new Args(argsMap);

  return callContract(contractHash, 'save_asset_record', args);
}

// ============================================================
// Helper Utilities
// ============================================================

/** Parse execution result to extract success/failure info. */
export function parseExecutionResult(result: any): {
  success: boolean;
  cost: string;
  errorMessage?: string;
  transfers: any[];
} {
  if (!result || !result.execution_results || result.execution_results.length === 0) {
    return { success: false, cost: '0', transfers: [] };
  }

  const execResult = result.execution_results[0];
  const effect = execResult.result;

  if (effect.Success) {
    return {
      success: true,
      cost: effect.Success.cost || '0',
      transfers: effect.Success.transfers || [],
    };
  } else if (effect.Failure) {
    return {
      success: false,
      cost: effect.Failure.cost || '0',
      errorMessage: effect.Failure.error_message,
      transfers: [],
    };
  }

  return { success: false, cost: '0', transfers: [] };
}

/** Convert motes to CSPR display string. */
export function motesToCspr(motes: string | bigint): string {
  return ethers.formatUnits(BigInt(motes), 9);
}

/** Get the signing account's public key as hex string. */
export function getSigningPublicKeyHex(): string {
  return getSigningPublicKey().toHex();
}
