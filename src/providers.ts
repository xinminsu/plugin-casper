import { IAgentRuntime, Memory, Provider, State } from '@elizaos/core';
import { CasperClient } from './client';

/**
 * Casper 网络信息 Provider
 */
export const casperNetworkProvider: Provider = {
  get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    try {
      const nodeUrl = runtime.getSetting('CASPER_NODE_URL') || 'https://node.testnet.cspr.cloud:443';
      const client = new CasperClient({ nodeUrl });
      
      const latestBlock = await client.getLatestBlock();
      
      return `🌐 Casper Network Status:
Node URL: ${nodeUrl}
State Root Hash: ${latestBlock.stateRootHash}
Timestamp: ${latestBlock.timestamp}`;
    } catch (error) {
      return `Error fetching network status: ${(error as Error).message}`;
    }
  }
};

/**
 * Casper 钱包信息 Provider
 */
export const casperWalletProvider: Provider = {
  get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    try {
      const publicKey = runtime.getSetting('CASPER_PUBLIC_KEY');
      if (!publicKey) {
        return 'No Casper wallet configured. Set CASPER_PUBLIC_KEY to view wallet info.';
      }
      
      const nodeUrl = runtime.getSetting('CASPER_NODE_URL') || 'https://node.testnet.cspr.cloud:443';
      const client = new CasperClient({ nodeUrl });
      
      const balance = await client.getBalance(publicKey);
      const balanceInCSPR = parseInt(balance) / 1000000000;
      
      return `💼 Your Casper Wallet:
Address: ${publicKey}
Balance: ${balanceInCSPR.toFixed(9)} CSPR`;
    } catch (error) {
      return `Error fetching wallet info: ${(error as Error).message}`;
    }
  }
};

/**
 * Casper Gas 费用 Provider
 */
export const casperGasProvider: Provider = {
  get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    // Casper uses fixed gas prices, but we can provide guidance
    return `⛽ Casper Gas Fees Guide:

Standard Transfer: ~2.5 CSPR (2,500,000,000 motes)
Contract Deployment: ~10 CSPR (10,000,000,000 motes)
Contract Call: ~2.5 CSPR (2,500,000,000 motes)

Note: Gas fees are relatively stable on Casper network.`;
  }
};
