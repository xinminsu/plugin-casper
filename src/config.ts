import { IAgentRuntime } from '@elizaos/core';
import { CasperClient, CasperConfig } from './client';

/** Official Casper Association public testnet RPC (no API key required). */
export const DEFAULT_CASPER_NODE_URL = 'https://node.testnet.casper.network/rpc';

export function getCasperConfigFromRuntime(runtime: IAgentRuntime): CasperConfig {
  const nodeUrl =
    (runtime.getSetting('CASPER_NODE_URL') as string | undefined) || DEFAULT_CASPER_NODE_URL;
  const apiKey = runtime.getSetting('CASPER_API_KEY') as string | undefined;
  const chainName = runtime.getSetting('CASPER_CHAIN_NAME') as string | undefined;

  return {
    nodeUrl,
    ...(apiKey ? { apiKey } : {}),
    ...(chainName ? { chainName } : {}),
  };
}

export function createCasperClient(runtime: IAgentRuntime): CasperClient {
  return new CasperClient(getCasperConfigFromRuntime(runtime));
}
