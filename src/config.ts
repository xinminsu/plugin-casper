import { readFileSync } from 'fs';
import { IAgentRuntime } from '@elizaos/core';
import { PublicKey } from 'casper-js-sdk';
import { CasperClient, CasperConfig } from './client';
import { configureRpc, getRpcUrl as getRpcUrlFromService, DEFAULT_RPC_URL } from './services/casperRpcService';
import {
  configureSigner,
  getSigningWalletInfo,
  isSigningKeyConfigured,
  normalizeSigningKeyPem,
  SigningWalletInfo,
} from './services/casperTransactionService';

/** Official Casper Association public testnet RPC (no API key required). */
export const DEFAULT_CASPER_NODE_URL = DEFAULT_RPC_URL;

const CASPER_SETTING_KEYS = [
  'CASPER_NODE_URL',
  'CASPER_RPC_URL',
  'CASPER_API_KEY',
  'CASPER_CHAIN_NAME',
  'CASPER_PUBLIC_KEY',
  'CASPER_PRIVATE_KEY',
  'CASPER_SIGNING_KEY_PEM',
  'CASPER_SIGNING_KEY_PEM_FILE',
  'CASPER_SIGNING_KEY_HEX',
  'CASPER_KEY_ALGORITHM',
] as const;

/** Read a Casper setting from Eliza runtime settings, then fall back to process.env. */
export function getCasperSetting(
  runtime: IAgentRuntime,
  key: (typeof CASPER_SETTING_KEYS)[number]
): string | undefined {
  const fromRuntime = runtime.getSetting(key) as string | undefined;
  if (typeof fromRuntime === 'string' && fromRuntime.trim()) {
    return fromRuntime.trim();
  }

  const fromEnv = process.env[key];
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim();
  }

  return undefined;
}

function resolveSigningKeyPem(runtime: IAgentRuntime): string | undefined {
  const inlinePem = getCasperSetting(runtime, 'CASPER_SIGNING_KEY_PEM');
  if (inlinePem) {
    return normalizeSigningKeyPem(inlinePem);
  }

  const pemFile = getCasperSetting(runtime, 'CASPER_SIGNING_KEY_PEM_FILE');
  if (pemFile) {
    try {
      return normalizeSigningKeyPem(readFileSync(pemFile, 'utf8'));
    } catch (error) {
      throw new Error(
        `Failed to read CASPER_SIGNING_KEY_PEM_FILE at "${pemFile}": ${(error as Error).message}`
      );
    }
  }

  return undefined;
}

export function getCasperConfigFromRuntime(runtime: IAgentRuntime): CasperConfig {
  const nodeUrl =
    getCasperSetting(runtime, 'CASPER_NODE_URL') ||
    getCasperSetting(runtime, 'CASPER_RPC_URL') ||
    DEFAULT_CASPER_NODE_URL;
  const apiKey = getCasperSetting(runtime, 'CASPER_API_KEY');
  const chainName = getCasperSetting(runtime, 'CASPER_CHAIN_NAME');

  return {
    nodeUrl,
    ...(apiKey ? { apiKey } : {}),
    ...(chainName ? { chainName } : {}),
  };
}

/**
 * Inject all runtime settings into the service layer (RPC endpoint + signer).
 * Called by `createCasperClient` and by write Action handlers so the
 * ported services can read node URL, API key, chain name and signing key
 * without touching `process.env` directly.
 */
export function configureCasperServices(runtime: IAgentRuntime): {
  nodeUrl: string;
  apiKey?: string;
  chainName?: string;
} {
  const nodeUrl =
    getCasperSetting(runtime, 'CASPER_NODE_URL') ||
    getCasperSetting(runtime, 'CASPER_RPC_URL') ||
    DEFAULT_CASPER_NODE_URL;
  const apiKey = getCasperSetting(runtime, 'CASPER_API_KEY');
  const chainName = getCasperSetting(runtime, 'CASPER_CHAIN_NAME');

  // Inject into the read-side RPC service.
  configureRpc(nodeUrl, apiKey);

  // Inject into the write-side transaction service.
  configureSigner({
    rpcUrl: nodeUrl,
    apiKey,
    chainName,
    signingKeyPem: resolveSigningKeyPem(runtime),
    signingKeyHex:
      getCasperSetting(runtime, 'CASPER_SIGNING_KEY_HEX') ||
      getCasperSetting(runtime, 'CASPER_PRIVATE_KEY'),
    keyAlgorithm: getCasperSetting(runtime, 'CASPER_KEY_ALGORITHM'),
  });

  return { nodeUrl, apiKey, chainName };
}

export function createCasperClient(runtime: IAgentRuntime): CasperClient {
  // Keep the legacy client wired up for the original 4 actions.
  const client = new CasperClient(getCasperConfigFromRuntime(runtime));
  // Also inject settings into the ported services so new actions work
  // out of the box when a client is created.
  configureCasperServices(runtime);
  return client;
}

/** Read the currently configured RPC URL (after configureCasperServices). */
export function getConfiguredRpcUrl(): string {
  return getRpcUrlFromService();
}

function walletInfoFromPublicKey(publicKey: PublicKey): SigningWalletInfo {
  const accountHash = publicKey.accountHash();
  return {
    publicKey: publicKey.toHex(),
    address: `account-hash-${Buffer.from(accountHash.toBytes()).toString('hex')}`,
  };
}

/**
 * Resolve the configured wallet from runtime settings.
 * Priority: CASPER_PUBLIC_KEY → signing key (PEM / HEX / PRIVATE_KEY).
 */
export function getConfiguredWalletInfo(runtime: IAgentRuntime): SigningWalletInfo | null {
  configureCasperServices(runtime);

  const explicitPublicKey = getCasperSetting(runtime, 'CASPER_PUBLIC_KEY');
  if (explicitPublicKey?.trim()) {
    try {
      return walletInfoFromPublicKey(PublicKey.fromHex(explicitPublicKey.trim()));
    } catch {
      // Fall through to signing key if CASPER_PUBLIC_KEY is malformed.
    }
  }

  if (isSigningKeyConfigured()) {
    return getSigningWalletInfo();
  }

  return null;
}
