import axios from 'axios';
import { ethers } from 'ethers';

/**
 * Casper JSON-RPC service.
 *
 * Ported from casper-discord-skill. Discord/winston/dotenv dependencies were
 * removed: RPC URL + optional API key are injected via `configureRpc()`
 * (called from config.ts at client construction time), and a lightweight
 * console logger replaces winston.
 */

/** Default testnet RPC endpoint (no API key required). */
export const DEFAULT_RPC_URL = 'https://node.testnet.casper.network/rpc';

let rpcUrl = DEFAULT_RPC_URL;
let apiKey: string | undefined;

/**
 * Inject the RPC endpoint (and optional bearer API key). Called by
 * `createCasperClient` / action handlers from runtime settings.
 */
export function configureRpc(url: string, key?: string): void {
  rpcUrl = url || DEFAULT_RPC_URL;
  apiKey = key;
}

/** Current configured RPC URL. */
export function getRpcUrl(): string {
  return rpcUrl;
}

const logger = {
  info: (msg: string) => console.log(`[casper-rpc] ${msg}`),
  error: (msg: string) => console.error(`[casper-rpc] ${msg}`),
};

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers.Authorization = apiKey;
  }
  return headers;
}

/**
 * Generic Casper JSON-RPC call
 */
async function casperRpcCall(method: string, params: any = {}, id: number = 1): Promise<any> {
  try {
    const response = await axios.post(
      rpcUrl,
      {
        jsonrpc: '2.0',
        method,
        params,
        id,
      },
      {
        timeout: 20000,
        headers: authHeaders(),
      }
    );

    if (response.data.error) {
      throw new Error(`RPC Error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  } catch (error: any) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout: Casper RPC node did not respond within 20 seconds');
    }
    if (error.code === 'ENOTFOUND') {
      throw new Error(`DNS error: Cannot resolve RPC URL - ${rpcUrl}`);
    }
    if (error.code === 'ECONNREFUSED') {
      throw new Error(`Connection refused: Cannot connect to RPC node - ${rpcUrl}`);
    }
    if (error.response?.status === 429) {
      throw new Error('Rate limited: Too many requests to RPC endpoint');
    }
    throw error;
  }
}

// ============================================================
// Info API - Node Information
// ============================================================

/** info_get_status - Get node status information */
export async function getNodeStatus(): Promise<any> {
  logger.info('Querying node status...');
  return casperRpcCall('info_get_status');
}

/** info_get_peers - Get network peer list */
export async function getPeers(): Promise<any> {
  logger.info('Querying network peers...');
  return casperRpcCall('info_get_peers');
}

/** info_get_deploy - Get deploy information by hash */
export async function getDeploy(deployHash: string): Promise<any> {
  logger.info(`Querying deploy: ${deployHash}`);
  return casperRpcCall('info_get_deploy', { DeployHash: deployHash });
}

/** info_get_validator_changes - Get validator changes */
export async function getValidatorChanges(): Promise<any> {
  logger.info('Querying validator changes...');
  return casperRpcCall('info_get_validator_changes');
}

/** info_get_chainspec - Get chainspec information */
export async function getChainspec(): Promise<any> {
  logger.info('Querying chainspec...');
  return casperRpcCall('info_get_chainspec');
}

// ============================================================
// Chain API - Block and Era Information
// ============================================================

/** chain_get_block - Get block by hash */
export async function getBlockByHash(blockHash: string): Promise<any> {
  logger.info(`Querying block by hash: ${blockHash}`);
  return casperRpcCall('chain_get_block', { block_identifier: { Hash: blockHash } });
}

/** chain_get_block - Get block by height */
export async function getBlockByHeight(height: number): Promise<any> {
  logger.info(`Querying block by height: ${height}`);
  return casperRpcCall('chain_get_block', { block_identifier: { Height: height } });
}

/** chain_get_block_transfers - Get transfers in a block */
export async function getBlockTransfers(blockHash?: string): Promise<any> {
  logger.info(`Querying block transfers for: ${blockHash || 'latest'}`);
  const params = blockHash ? { block_identifier: { Hash: blockHash } } : {};
  return casperRpcCall('chain_get_block_transfers', params);
}

/** chain_get_state_root_hash - Get latest state root hash */
export async function getStateRootHash(): Promise<string> {
  logger.info('Querying state root hash...');
  const result = await casperRpcCall('chain_get_state_root_hash', {});
  return result.state_root_hash;
}

/** chain_get_state_root_hash - Get state root hash by block height */
export async function getStateRootHashByHeight(height: number): Promise<string> {
  logger.info(`Querying state root hash at height: ${height}`);
  const result = await casperRpcCall('chain_get_state_root_hash', { block_identifier: { Height: height } });
  return result.state_root_hash;
}

/** chain_get_era_info - Get era information by switch block */
export async function getEraInfo(blockHash?: string): Promise<any> {
  logger.info(`Querying era info for: ${blockHash || 'latest'}`);
  const params = blockHash ? { block_identifier: { Hash: blockHash } } : {};
  return casperRpcCall('chain_get_era_info', params);
}

// ============================================================
// State API - Account and State Information
// ============================================================

/** state_get_account_info - Get account info by public key */
export async function getAccountInfo(publicKey: string): Promise<any> {
  logger.info(`Querying account info for public key: ${publicKey}`);
  return casperRpcCall('state_get_account_info', { public_key: publicKey });
}

/** state_get_account_info - Get account info by account hash */
export async function getAccountInfoByHash(accountHash: string): Promise<any> {
  logger.info(`Querying account info for account hash: ${accountHash}`);
  const cleanHash = accountHash.toLowerCase().replace(/^account-hash-/, '');
  return casperRpcCall('state_get_account_info', {
    account_identifier: { AccountHash: cleanHash },
  });
}

/** state_get_balance - Get purse balance */
export async function getBalance(purseUref: string, stateRootHash?: string): Promise<string> {
  logger.info(`Querying balance for purse: ${purseUref}`);

  let stateRoot = stateRootHash;
  if (!stateRoot) {
    stateRoot = await getStateRootHash();
    logger.info(`Using latest state root hash: ${stateRoot}`);
  }

  const result = await casperRpcCall('state_get_balance', {
    state_root_hash: stateRoot,
    purse_uref: purseUref,
  });

  return result.balance_value.toString();
}

/** state_get_item - Get stored value by key */
export async function getStateItem(key: string, stateRootHash?: string, path: string[] = []): Promise<any> {
  logger.info(`Querying state item: ${key}`);

  let stateRoot = stateRootHash;
  if (!stateRoot) {
    stateRoot = await getStateRootHash();
  }

  return casperRpcCall('state_get_item', {
    state_root_hash: stateRoot,
    key,
    path,
  });
}

/** state_get_dictionary_item - Get dictionary item */
export async function getDictionaryItem(
  uref: string,
  dictionaryKey: string,
  stateRootHash?: string
): Promise<any> {
  logger.info(`Querying dictionary item: ${dictionaryKey}`);

  let stateRoot = stateRootHash;
  if (!stateRoot) {
    stateRoot = await getStateRootHash();
  }

  return casperRpcCall('state_get_dictionary_item', {
    state_root_hash: stateRoot,
    dictionary_identifier: {
      URef: { uref, dictionary_key: dictionaryKey },
    },
  });
}

/** state_get_auction_info - Get auction info (validators, bids) */
export async function getAuctionInfo(blockHash?: string): Promise<any> {
  logger.info('Querying auction info...');

  const params = blockHash ? { block_identifier: { Hash: blockHash } } : {};

  return casperRpcCall('state_get_auction_info', params);
}

// ============================================================
// Query Global State - Unified state query interface
// ============================================================

/**
 * query_global_state - Query any global state item by key
 * Supports state_root_hash or block_height as state identifier
 */
export async function queryGlobalState(
  key: string,
  path: string[] = [],
  stateRootHash?: string
): Promise<any> {
  logger.info(`Querying global state: key=${key}, path=${path.join('/')}`);

  let stateRoot = stateRootHash;
  if (!stateRoot) {
    stateRoot = await getStateRootHash();
  }

  return casperRpcCall('query_global_state', {
    state_identifier: { StateRootHash: stateRoot },
    key,
    path,
  });
}

/** query_global_state - Query by block height */
export async function queryGlobalStateByHeight(
  key: string,
  blockHeight: number,
  path: string[] = []
): Promise<any> {
  logger.info(`Querying global state by height: ${blockHeight}, key=${key}`);
  return casperRpcCall('query_global_state', {
    state_identifier: { BlockHeight: blockHeight },
    key,
    path,
  });
}

// ============================================================
// State API - Contract & Dictionary queries
// ============================================================

/** state_get_contract - Get contract info by contract hash (hash without 'hash-' prefix) */
export async function getContractInfo(contractHash: string, stateRootHash?: string): Promise<any> {
  logger.info(`Querying contract: ${contractHash}`);

  let stateRoot = stateRootHash;
  if (!stateRoot) {
    stateRoot = await getStateRootHash();
  }

  // Normalize hash format
  const cleanHash = contractHash.replace(/^hash-/, '').replace(/^0x/, '');

  return casperRpcCall('state_get_contract', {
    state_root_hash: stateRoot,
    contract_hash: `hash-${cleanHash}`,
  });
}

/** state_get_dictionary_item - Query dictionary by seed URef + dictionary key */
export async function getDictionaryItemByURef(
  uref: string,
  dictionaryKey: string,
  stateRootHash?: string
): Promise<any> {
  return getDictionaryItem(uref, dictionaryKey, stateRootHash);
}

/** state_get_dictionary_item - Query dictionary by account's named key + dictionary key */
export async function getDictionaryItemByAccount(
  accountPublicKey: string,
  namedKey: string,
  dictionaryKey: string,
  stateRootHash?: string
): Promise<any> {
  logger.info(`Querying dictionary: account=${accountPublicKey}, namedKey=${namedKey}, dictKey=${dictionaryKey}`);

  // First get account info to find the URef for the named key
  const accountInfo = await getAccountInfo(accountPublicKey);
  const namedKeys = accountInfo?.account?.named_keys || [];
  const namedKeyEntry = namedKeys.find((nk: any) => nk.name === namedKey);

  if (!namedKeyEntry) {
    throw new Error(`Named key "${namedKey}" not found in account`);
  }

  return getDictionaryItem(namedKeyEntry.key, dictionaryKey, stateRootHash);
}

/** state_get_dictionary_item - Query dictionary by contract's named key + dictionary key */
export async function getDictionaryItemByContract(
  contractHash: string,
  namedKey: string,
  dictionaryKey: string,
  stateRootHash?: string
): Promise<any> {
  logger.info(`Querying dictionary: contract=${contractHash}, namedKey=${namedKey}, dictKey=${dictionaryKey}`);

  const contractInfo = await getContractInfo(contractHash, stateRootHash);
  const namedKeys = contractInfo?.contract?.named_keys || [];
  const namedKeyEntry = namedKeys.find((nk: any) => nk.name === namedKey);

  if (!namedKeyEntry) {
    throw new Error(`Named key "${namedKey}" not found in contract`);
  }

  return getDictionaryItem(namedKeyEntry.key, dictionaryKey, stateRootHash);
}

// ============================================================
// Era Info - Additional era queries
// ============================================================

/** chain_get_era_info - Get era info by switch block height */
export async function getEraInfoByHeight(height: number): Promise<any> {
  logger.info(`Querying era info at height: ${height}`);
  return casperRpcCall('chain_get_era_info', {
    block_identifier: { Height: height },
  });
}

/** chain_get_era_summary - Get era summary (all era info from switch block) */
export async function getEraSummary(blockHash?: string): Promise<any> {
  logger.info(`Querying era summary for: ${blockHash || 'latest'}`);
  const params = blockHash ? { block_identifier: { Hash: blockHash } } : {};
  return casperRpcCall('chain_get_era_summary', params);
}

// ============================================================
// Auction/Validator queries
// ============================================================

/** get_era_validators - Get active validators for an era */
export async function getEraValidators(blockHash?: string): Promise<any> {
  logger.info('Querying era validators...');
  const params = blockHash ? { block_identifier: { Hash: blockHash } } : {};
  return casperRpcCall('chain_get_era_validators', params);
}

/** state_get_auction_info - Get delegation info for a delegator */
export async function getDelegationInfo(
  delegatorPublicKey: string,
  blockHash?: string
): Promise<any> {
  logger.info(`Querying delegation info for: ${delegatorPublicKey}`);
  const params: any = {
    delegator_public_key: delegatorPublicKey,
  };
  if (blockHash) params.block_identifier = { Hash: blockHash };
  return casperRpcCall('state_get_auction_info', params);
}

/** state_get_balance - Get balance by purse URef with full response (including proof) */
export async function getPurseBalanceDetails(
  purseUref: string,
  stateRootHash?: string
): Promise<any> {
  logger.info(`Querying purse balance details: ${purseUref}`);
  let stateRoot = stateRootHash;
  if (!stateRoot) {
    stateRoot = await getStateRootHash();
  }
  return casperRpcCall('state_get_balance', {
    state_root_hash: stateRoot,
    purse_uref: purseUref,
  });
}

/** info_get_validator_changes - Get all validator changes */
export async function getValidatorChangesInfo(): Promise<any> {
  logger.info('Querying validator changes...');
  return casperRpcCall('info_get_validator_changes');
}

/** Get account's main purse URef from public key */
export async function getMainPurseURef(publicKey: string): Promise<string> {
  const accountInfo = await getAccountInfo(publicKey);
  if (!accountInfo?.account?.main_purse) {
    throw new Error('Account not found or has no main purse');
  }
  return accountInfo.account.main_purse;
}

/** Get account's named keys from public key */
export async function getAccountNamedKeys(publicKey: string): Promise<any[]> {
  const accountInfo = await getAccountInfo(publicKey);
  return accountInfo?.account?.named_keys || [];
}

/** Get contract entry points (from contract info) */
export async function getContractEntryPoints(contractHash: string): Promise<any[]> {
  const contractInfo = await getContractInfo(contractHash);
  return contractInfo?.contract?.entry_points || [];
}

/** Estimate transaction cost */
export async function estimateTransactionCost(
  deployCostInMotes: string,
  isModuleBytes: boolean = false
): Promise<any> {
  logger.info(`Estimating transaction cost: ${deployCostInMotes} motes`);
  return casperRpcCall('chain_estimate_transaction_cost', {
    deployment_cost: deployCostInMotes,
    is_module_bytes: isModuleBytes,
  });
}

// ============================================================
// Query Balance - High-level helper
// ============================================================

/** Get CSPR balance for a Casper public key or account hash */
export async function getCsprBalance(address: string): Promise<string> {
  const isPublicKey = /^[0-9a-fA-F]{68}$/.test(address);
  const isAccountHash = /^[0-9a-fA-F]{64}$/.test(address);

  if (!isPublicKey && !isAccountHash) {
    throw new Error(
      'Invalid address format.\n\n' +
        'Supported formats:\n' +
        '1. Casper Public Key: 68 hex chars (starts with 02 or 03)\n' +
        '2. Casper Account Hash: 64 hex chars'
    );
  }

  let accountInfo;
  if (isPublicKey) {
    accountInfo = await getAccountInfo(address);
  } else {
    accountInfo = await getAccountInfoByHash(address);
  }

  if (!accountInfo || !accountInfo.account) {
    throw new Error(
      'Account not found on Casper network.\n\n' +
        `Current RPC: ${rpcUrl}\n` +
        'Check your address at: https://testnet.cspr.live/'
    );
  }

  const mainPurse = accountInfo.account.main_purse;
  const balanceMotes = await getBalance(mainPurse);

  // Convert motes to CSPR (1 CSPR = 10^9 motes)
  return ethers.formatUnits(BigInt(balanceMotes), 9);
}

/** Get account details including balance for a public key or account hash */
export async function getAccountDetails(address: string): Promise<{
  accountHash: string;
  mainPurse: string;
  balance: string;
  namedKeys: any[];
  associatedKeys: any[];
  actionThresholds: any;
}> {
  const isPublicKey = /^[0-9a-fA-F]{68}$/.test(address);
  const isAccountHash = /^[0-9a-fA-F]{64}$/.test(address);

  if (!isPublicKey && !isAccountHash) {
    throw new Error(
      'Invalid address format.\n\n' +
        'Supported formats:\n' +
        '1. Casper Public Key: 68 hex chars (starts with 02 or 03)\n' +
        '2. Casper Account Hash: 64 hex chars'
    );
  }

  let accountInfo;
  if (isPublicKey) {
    accountInfo = await getAccountInfo(address);
  } else {
    accountInfo = await getAccountInfoByHash(address);
  }

  if (!accountInfo || !accountInfo.account) {
    throw new Error('Account not found');
  }

  const account = accountInfo.account;
  const balanceMotes = await getBalance(account.main_purse);

  return {
    accountHash: account.account_hash || 'N/A',
    mainPurse: account.main_purse,
    balance: ethers.formatUnits(BigInt(balanceMotes), 9),
    namedKeys: account.named_keys || [],
    associatedKeys: account.associated_keys || [],
    actionThresholds: account.action_thresholds || {},
  };
}
