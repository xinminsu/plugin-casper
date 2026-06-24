import { Action, ActionExample, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { configureCasperServices, createCasperClient, getCasperSetting } from './config';
import { transferCspr, isSigningKeyConfigured } from './services/casperTransactionService';
import { extractPublicKey, safeJsonStringify, toSerializable } from './utils';

/**
 * 生成钱包 Action
 */
export const generateWalletAction: Action = {
  name: 'GENERATE_CASPER_WALLET',
  similes: ['CREATE_CASPER_WALLET', 'NEW_CASPER_ACCOUNT'],
  description: 'Generate a new Casper blockchain wallet with public/private key pair',
  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
    return true;
  },
  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    try {
      const client = createCasperClient(runtime);
      
      const wallet = client.generateWallet();
      
      const response = `I've generated a new Casper wallet for you:

📍 Address: ${wallet.address}
🔑 Public Key: ${wallet.publicKey}
🔐 Private Key: ${wallet.privateKey}

⚠️ IMPORTANT: Store your private key securely! Never share it with anyone.`;

      callback!({
        text: response,
        content: {
          address: wallet.address,
          publicKey: wallet.publicKey,
          privateKey: wallet.privateKey
        }
      });
    } catch (error) {
      callback!({
        text: `Error generating wallet: ${(error as Error).message}`,
        content: { error: (error as Error).message }
      });
    }
  },
  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: 'Create a new Casper wallet' }
      },
      {
        name: '{{agent}}',
        content: { text: 'I\'ll generate a new Casper wallet for you...' }
      }
    ]
  ]
};

/**
 * 查询余额 Action
 */
export const getBalanceAction: Action = {
  name: 'GET_CASPER_BALANCE',
  similes: ['CHECK_CASPER_BALANCE', 'CASPER_BALANCE'],
  description: 'Check the CSPR token balance of a Casper account',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    return (message.content.text?.includes('balance') || 
           message.content.text?.includes('CSPR')) ?? false;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    try {
      const client = createCasperClient(runtime);
      
      // 从消息中提取公钥或地址
      const publicKey = extractPublicKey(message.content.text || '');
      
      if (!publicKey) {
        callback!({
          text: 'Please provide a Casper public key or address to check the balance.',
          content: { error: 'No public key provided' }
        });
        return;
      }
      
      const balance = await client.getBalance(publicKey);
      const balanceInCSPR = parseInt(balance) / 1000000000; // Convert motes to CSPR
      
      callback!({
        text: `💰 Balance for ${publicKey}:\n${balanceInCSPR.toFixed(9)} CSPR`,
        content: {
          publicKey,
          balance: balanceInCSPR
        }
      });
    } catch (error) {
      callback!({
        text: `Error checking balance: ${(error as Error).message}`,
        content: { error: (error as Error).message }
      });
    }
  },
  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: 'Check balance for 02a1b2c3d4e5f6...' }
      },
      {
        name: '{{agent}}',
        content: { text: 'Let me check the balance...' }
      }
    ]
  ]
};

/**
 * 转账 Action
 */
export const transferAction: Action = {
  name: 'TRANSFER_CASPER_TOKENS',
  similes: ['SEND_CASPER', 'SEND_CSPR', 'CASPER_TRANSFER'],
  description: 'Transfer CSPR tokens to another Casper account',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    return (message.content.text?.includes('send') || 
           message.content.text?.includes('transfer') ||
           message.content.text?.includes('pay')) ?? false;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    try {
      configureCasperServices(runtime);

      const privateKey = getCasperSetting(runtime, 'CASPER_PRIVATE_KEY');
      if (!isSigningKeyConfigured() && !privateKey) {
        callback!({
          text:
            'No signing key configured. Set CASPER_SIGNING_KEY_PEM, CASPER_SIGNING_KEY_HEX, or CASPER_PRIVATE_KEY in environment variables.',
          content: { error: 'No signing key configured' },
        });
        return;
      }

      // 从消息中提取接收方和金额
      const { toPublicKey, amount } = parseTransferDetails(message.content.text || '');
      
      if (!toPublicKey || !amount) {
        callback!({
          text: 'Please specify recipient public key and amount. Example: "Send 10 CSPR to 02abc..."',
          content: { error: 'Missing transfer details' }
        });
        return;
      }

      let deployHash: string;
      if (isSigningKeyConfigured()) {
        const result = await transferCspr(toPublicKey, String(amount));
        deployHash = result.deployHash;
      } else {
        const client = createCasperClient(runtime);
        deployHash = await client.transfer(privateKey!, toPublicKey, amount * 1000000000);
      }
      
      callback!({
        text: `✅ Transfer initiated!\n\nAmount: ${amount} CSPR\nTo: ${toPublicKey}\nTransaction Hash: ${deployHash}\n\nYou can check the transaction status using this hash.`,
        content: {
          deployHash,
          transactionHash: deployHash,
          amount,
          recipient: toPublicKey
        }
      });
    } catch (error) {
      callback!({
        text: `Error transferring tokens: ${(error as Error).message}`,
        content: { error: (error as Error).message }
      });
    }
  },
  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: 'Send 5 CSPR to 02a1b2c3d4e5f6...' }
      },
      {
        name: '{{agent}}',
        content: { text: 'I\'ll initiate the transfer...' }
      }
    ]
  ]
};

/**
 * 查询交易状态 Action
 */
export const getDeployStatusAction: Action = {
  name: 'GET_DEPLOY_STATUS',
  similes: ['CHECK_TRANSACTION', 'TX_STATUS'],
  description: 'Check the status of a Casper transaction by deploy hash',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    return (message.content.text?.includes('transaction') || 
           message.content.text?.includes('status') ||
           message.content.text?.includes('deploy')) ?? false;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    try {
      const client = createCasperClient(runtime);
      
      const deployHash = extractDeployHash(message.content.text || '');
      
      if (!deployHash) {
        callback!({
          text: 'Please provide a deploy hash to check the transaction status.',
          content: { error: 'No deploy hash provided' }
        });
        return;
      }
      
      const status = await client.getDeployStatus(deployHash);
      const serializedStatus = toSerializable(status);
      
      callback!({
        text: `📊 Transaction Status:\nDeploy Hash: ${deployHash}\nStatus: ${safeJsonStringify(serializedStatus, 2)}`,
        content: {
          deployHash,
          status: serializedStatus
        }
      });
    } catch (error) {
      callback!({
        text: `Error checking transaction status: ${(error as Error).message}`,
        content: { error: (error as Error).message }
      });
    }
  },
  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: 'Check status of deploy abc123...' }
      },
      {
        name: '{{agent}}',
        content: { text: 'Let me check the transaction status...' }
      }
    ]
  ]
};

function extractDeployHash(text: string): string | null {
  // Match deploy hash pattern (hex string)
  const match = text.match(/[0-9a-fA-F]{64}/);
  return match ? match[0] : null;
}

function parseTransferDetails(text: string): { toPublicKey: string | null; amount: number | null } {
  const publicKey = extractPublicKey(text);
  
  // Match amount pattern (number followed by optional CSPR)
  const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:CSPR)?/i);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : null;
  
  return { toPublicKey: publicKey, amount };
}

// Re-export ported actions
export { networkQueryAction } from './actions/networkQuery';
export { accountReadAction } from './actions/accountRead';
export { tokenReadAction } from './actions/tokenRead';
export { stakingReadAction } from './actions/stakingRead';
export { dappReadAction } from './actions/dappRead';
export { nativeWriteAction } from './actions/nativeWrite';
export { tokenWriteAction } from './actions/tokenWrite';
export { nftWriteAction } from './actions/nftWrite';
export { stakingWriteAction } from './actions/stakingWrite';
export { defiWriteAction } from './actions/defiWrite';
