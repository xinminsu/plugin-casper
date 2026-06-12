import { IAgentRuntime, Memory, Provider, State, ProviderResult } from '@elizaos/core';
import { createCasperClient, getCasperConfigFromRuntime } from './config';

/**
 * Casper 网络信息 Provider
 */
export const casperNetworkProvider: Provider = {
  name: 'casperNetwork',
  get: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<ProviderResult> => {
    try {
      const { nodeUrl } = getCasperConfigFromRuntime(runtime);
      const client = createCasperClient(runtime);
      
      const latestBlock = await client.getLatestBlock();
      
      return {
        text: `🌐 Casper Network Status:
Node URL: ${nodeUrl}
State Root Hash: ${latestBlock.stateRootHash}
Timestamp: ${latestBlock.timestamp}`
      };
    } catch (error) {
      return {
        text: `Error fetching network status: ${(error as Error).message}`
      };
    }
  }
};

/**
 * Casper 钱包信息 Provider
 */
export const casperWalletProvider: Provider = {
  name: 'casperWallet',
  get: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<ProviderResult> => {
    try {
      const publicKey = runtime.getSetting('CASPER_PUBLIC_KEY');
      if (!publicKey) {
        return {
          text: 'No Casper wallet configured. Set CASPER_PUBLIC_KEY to view wallet info.'
        };
      }
      
      const client = createCasperClient(runtime);
      
      const balance = await client.getBalance(publicKey as string);
      const balanceInCSPR = parseInt(balance) / 1000000000;
      
      return {
        text: `💼 Your Casper Wallet:
Address: ${publicKey}
Balance: ${balanceInCSPR.toFixed(9)} CSPR`
      };
    } catch (error) {
      return {
        text: `Error fetching wallet info: ${(error as Error).message}`
      };
    }
  }
};

/**
 * Casper Gas 费用 Provider
 */
export const casperGasProvider: Provider = {
  name: 'casperGas',
  get: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<ProviderResult> => {
    // Casper uses fixed gas prices, but we can provide guidance
    return {
      text: `⛽ Casper Gas Fees Guide:

Standard Transfer: ~2.5 CSPR (2,500,000,000 motes)
Contract Deployment: ~10 CSPR (10,000,000,000 motes)
Contract Call: ~2.5 CSPR (2,500,000,000 motes)

Note: Gas fees are relatively stable on Casper network.`
    };
  }
};
