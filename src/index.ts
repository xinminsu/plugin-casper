import { Plugin } from '@elizaos/core';
import { generateWalletAction, getBalanceAction, transferAction, getDeployStatusAction } from './actions';
import { casperNetworkProvider, casperWalletProvider, casperGasProvider } from './providers';

/**
 * Casper Blockchain Plugin for Eliza
 * 
 * This plugin provides integration with the Casper blockchain network,
 * enabling AI agents to interact with Casper accounts, perform transactions,
 * and query blockchain data.
 */
export const casperPlugin: Plugin = {
  name: 'casper',
  description: 'Casper blockchain integration plugin',
  actions: [
    generateWalletAction,
    getBalanceAction,
    transferAction,
    getDeployStatusAction
  ],
  providers: [
    casperNetworkProvider,
    casperWalletProvider,
    casperGasProvider
  ],
  evaluators: [],
  services: []
};

export default casperPlugin;

// Export types and classes for external use
export * from './client';
