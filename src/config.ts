import { IAgentRuntime } from '@elizaos/core';
import { CasperClient, CasperConfig } from './client';
import { configureRpc, getRpcUrl as getRpcUrlFromService, DEFAULT_RPC_URL } from './services/casperRpcService';
import { configureSigner } from './services/casperTransactionService';

/** Official Casper Association public testnet RPC (no API key required). */
export const DEFAULT_CASPER_NODE_URL = DEFAULT_RPC_URL;

export function getCasperConfigFromRuntime(runtime: IAgentRuntime): CasperConfig {
  const nodeUrl =
    (runtime.getSetting('CASPER_NODE_URL') as string | undefined) ||
    (runtime.getSetting('CASPER_RPC_URL') as string | undefined) ||
    DEFAULT_CASPER_NODE_URL;
  const apiKey =
    (runtime.getSetting('CASPER_API_KEY') as string | undefined) || undefined;
  const chainName =
    (runtime.getSetting('CASPER_CHAIN_NAME') as string | undefined) || undefined;

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
    (runtime.getSetting('CASPER_NODE_URL') as string | undefined) ||
    (runtime.getSetting('CASPER_RPC_URL') as string | undefined) ||
    DEFAULT_CASPER_NODE_URL;
  const apiKey =
    (runtime.getSetting('CASPER_API_KEY') as string | undefined) || undefined;
  const chainName =
    (runtime.getSetting('CASPER_CHAIN_NAME') as string | undefined) || undefined;

  // Inject into the read-side RPC service.
  configureRpc(nodeUrl, apiKey);

  // Inject into the write-side transaction service.
  configureSigner({
    rpcUrl: nodeUrl,
    apiKey,
    chainName,
    signingKeyPem: runtime.getSetting('CASPER_SIGNING_KEY_PEM') as string | undefined,
    signingKeyHex:
      (runtime.getSetting('CASPER_SIGNING_KEY_HEX') as string | undefined) ||
      // Back-compat: the original plugin-casper used CASPER_PRIVATE_KEY for the
      // transfer action. Accept it as the signing key too.
      (runtime.getSetting('CASPER_PRIVATE_KEY') as string | undefined),
    keyAlgorithm: runtime.getSetting('CASPER_KEY_ALGORITHM') as string | undefined,
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
