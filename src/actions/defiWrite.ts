import { Action, ActionExample, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { configureCasperServices } from '../config';
import {
  ammSwap,
  addLiquidity,
  removeLiquidity,
  stakeLp,
  claimReward,
  createOrder,
  cancelOrder,
  counterIncrement,
  counterDecrement,
  dictionaryPut,
  dictionaryRemove,
  createProposal,
  castVote,
  executeProposal,
  saveAssetRecord,
  callContract,
  isSigningKeyConfigured,
} from '../services/casperTransactionService';
import { CLValue } from 'casper-js-sdk';
import { replyOk, replyError, formatDeployResult } from './common';
import { detectSubcommand, extractPublicKey, extractContractHash, extractAmount, extractInteger, extractOrderId, extractQuoted } from '../helpers/paramParser';

function truncate(s: string, len = 20): string {
  return s.length > len ? s.substring(0, len) + '...' : s;
}

/**
 * DeFi write action — handles AMM/DEX, governance, RWA, and general DApp operations:
 * swap, add/remove liquidity, stake LP, claim reward, create/cancel order,
 * counter inc/dec, dictionary put/remove, governance proposals, RWA assets,
 * generic contract call.
 */
export const defiWriteAction: Action = {
  name: 'CASPER_DEFI_WRITE',
  similes: [
    'CASPER_AMM_SWAP',
    'CASPER_ADD_LIQUIDITY',
    'CASPER_REMOVE_LIQUIDITY',
    'CASPER_STAKE_LP',
    'CASPER_CLAIM_REWARD',
    'CASPER_CREATE_ORDER',
    'CASPER_CANCEL_ORDER',
    'CASPER_COUNTER_INC',
    'CASPER_COUNTER_DEC',
    'CASPER_DICT_PUT',
    'CASPER_DICT_REMOVE',
    'CASPER_CREATE_PROPOSAL',
    'CASPER_CAST_VOTE',
    'CASPER_EXECUTE_PROPOSAL',
    'CASPER_SAVE_ASSET',
    'CASPER_CALL_CONTRACT',
  ],
  description:
    'Perform Casper DeFi operations: AMM swap, add/remove liquidity, stake LP, claim rewards, create/cancel orders, counter operations, dictionary operations, governance proposals, RWA asset records, generic contract calls',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || '').toLowerCase();
    return [
      'swap', 'add liquidity', 'remove liquidity', 'stake lp', 'claim reward',
      'create order', 'cancel order', 'counter increment', 'counter decrement',
      'dictionary put', 'dictionary remove', 'create proposal', 'cast vote',
      'execute proposal', 'save asset', 'call contract',
    ].some((kw) => text.includes(kw));
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    if (!callback) return;

    try {
      configureCasperServices(runtime);

      if (!isSigningKeyConfigured()) {
        replyOk(callback, '❌ No signing key configured. Set CASPER_SIGNING_KEY_HEX or CASPER_SIGNING_KEY_PEM.');
        return;
      }

      const text = message.content.text || '';

      const sub = detectSubcommand(text, {
        swap: ['swap'],
        addLiquidity: ['add liquidity', 'add_liquidity'],
        removeLiquidity: ['remove liquidity', 'remove_liquidity'],
        stakeLp: ['stake lp', 'stake_lp'],
        claimReward: ['claim reward', 'claim_reward'],
        createOrder: ['create order', 'create_order'],
        cancelOrder: ['cancel order', 'cancel_order'],
        counterIncrement: ['counter increment', 'counter_increment', 'increment counter'],
        counterDecrement: ['counter decrement', 'counter_decrement', 'decrement counter'],
        dictPut: ['dictionary put', 'dict_put', 'dict put'],
        dictRemove: ['dictionary remove', 'dict_remove', 'dict remove'],
        createProposal: ['create proposal', 'create_proposal'],
        castVote: ['cast vote', 'cast_vote'],
        executeProposal: ['execute proposal', 'execute_proposal'],
        saveAsset: ['save asset', 'save_asset', 'rwa'],
        callContract: ['call contract', 'call_contract'],
      }, 'swap');

      const contractHash = extractContractHash(text);
      if (!contractHash) {
        replyOk(callback, 'Please provide a contract hash.');
        return;
      }

      const decimals = extractInteger(text, ['decimals']) ?? 9;

      switch (sub) {
        case 'swap': {
          // Extract two token hashes
          const hashes = text.match(/[0-9a-fA-F]{64}/g) || [];
          if (hashes.length < 2) { replyOk(callback, 'Please provide token-in and token-out hashes.'); return; }
          const tokenIn = hashes[0]!;
          const tokenOut = hashes[1]!;
          const amountIn = extractAmount(text);
          const minAmountOut = text.match(/min(?:imum)?(?:[-_\s]?amount)?[-_\s]?out\s*[:=]?\s*(\d+(?:\.\d+)?)/i)?.[1] || '0';
          if (!amountIn) { replyOk(callback, 'Please provide amount-in.'); return; }
          const { deployHash, result } = await ammSwap(contractHash, tokenIn, tokenOut, amountIn, minAmountOut, decimals);
          const f = formatDeployResult('AMM Swap', deployHash, result,
            [`Token In: ${truncate(tokenIn)}`, `Token Out: ${truncate(tokenOut)}`, `Amount In: ${amountIn}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'addLiquidity': {
          const hashes = text.match(/[0-9a-fA-F]{64}/g) || [];
          if (hashes.length < 2) { replyOk(callback, 'Please provide token A and token B hashes.'); return; }
          const tokenA = hashes[0]!;
          const tokenB = hashes[1]!;
          const amounts = text.match(/(\d+(?:\.\d+)?)\s*(?:CSPR|cspr)?/g) || [];
          if (amounts.length < 2) { replyOk(callback, 'Please provide amounts for both tokens.'); return; }
          const amountA = (amounts[0]!.match(/(\d+(?:\.\d+)?)/) || [])[1] || '0';
          const amountB = (amounts[1]!.match(/(\d+(?:\.\d+)?)/) || [])[1] || '0';
          const { deployHash, result } = await addLiquidity(contractHash, tokenA, tokenB, amountA, amountB, decimals);
          const f = formatDeployResult('Add Liquidity', deployHash, result,
            [`Token A: ${truncate(tokenA)}`, `Token B: ${truncate(tokenB)}`, `Amount A: ${amountA}`, `Amount B: ${amountB}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'removeLiquidity': {
          const lpToken = text.match(/[0-9a-fA-F]{64}/g)?.[0] || '';
          const lpAmount = extractAmount(text);
          if (!lpAmount) { replyOk(callback, 'Please provide LP amount.'); return; }
          const minA = '0';
          const minB = '0';
          const { deployHash, result } = await removeLiquidity(contractHash, lpToken, lpAmount, minA, minB, decimals);
          const f = formatDeployResult('Remove Liquidity', deployHash, result,
            [`LP Token: ${truncate(lpToken)}`, `LP Amount: ${lpAmount}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'stakeLp': {
          const lpToken = text.match(/[0-9a-fA-F]{64}/g)?.[0] || '';
          const amount = extractAmount(text);
          if (!amount) { replyOk(callback, 'Please provide an amount.'); return; }
          const { deployHash, result } = await stakeLp(contractHash, lpToken, amount, decimals);
          const f = formatDeployResult('Stake LP', deployHash, result,
            [`LP Token: ${truncate(lpToken)}`, `Amount: ${amount}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'claimReward': {
          const { deployHash, result } = await claimReward(contractHash);
          const f = formatDeployResult('Claim Reward', deployHash, result,
            [`Contract: ${truncate(contractHash)}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'createOrder': {
          const hashes = text.match(/[0-9a-fA-F]{64}/g) || [];
          if (hashes.length < 2) { replyOk(callback, 'Please provide token-in and token-out.'); return; }
          const tokenIn = hashes[0]!;
          const tokenOut = hashes[1]!;
          const amountIn = extractAmount(text);
          const price = text.match(/price\s*[:=]?\s*(\d+(?:\.\d+)?)/i)?.[1] || '0';
          if (!amountIn) { replyOk(callback, 'Please provide amount-in.'); return; }
          const { deployHash, result } = await createOrder(contractHash, tokenIn, tokenOut, amountIn, price, decimals);
          const f = formatDeployResult('Create Order', deployHash, result,
            [`Token In: ${truncate(tokenIn)}`, `Token Out: ${truncate(tokenOut)}`, `Amount In: ${amountIn}`, `Price: ${price}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'cancelOrder': {
          const orderId = extractOrderId(text);
          if (!orderId) { replyOk(callback, 'Please provide an order ID.'); return; }
          const { deployHash, result } = await cancelOrder(contractHash, orderId);
          const f = formatDeployResult('Cancel Order', deployHash, result,
            [`Order ID: ${orderId}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'counterIncrement': {
          const { deployHash, result } = await counterIncrement(contractHash);
          const f = formatDeployResult('Counter Increment', deployHash, result,
            [`Contract: ${truncate(contractHash)}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'counterDecrement': {
          const { deployHash, result } = await counterDecrement(contractHash);
          const f = formatDeployResult('Counter Decrement', deployHash, result,
            [`Contract: ${truncate(contractHash)}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'dictPut': {
          const key = extractQuoted(text, 'key') || extractQuoted(text);
          const value = extractQuoted(text, 'value');
          if (!key || !value) { replyOk(callback, 'Please provide a key and value.'); return; }
          const { deployHash, result } = await dictionaryPut(contractHash, key, value);
          const f = formatDeployResult('Dictionary Put', deployHash, result,
            [`Key: ${key}`, `Value: ${truncate(value, 50)}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'dictRemove': {
          const key = extractQuoted(text, 'key') || extractQuoted(text);
          if (!key) { replyOk(callback, 'Please provide a key to remove.'); return; }
          const { deployHash, result } = await dictionaryRemove(contractHash, key);
          const f = formatDeployResult('Dictionary Remove', deployHash, result,
            [`Removed Key: ${key}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'createProposal': {
          const title = extractQuoted(text, 'title') || extractQuoted(text);
          const description = extractQuoted(text, 'description') || extractQuoted(text);
          const votingDuration = extractInteger(text, ['duration', 'voting']) ?? 1000;
          if (!title) { replyOk(callback, 'Please provide a proposal title.'); return; }
          const { deployHash, result } = await createProposal(contractHash, title, description || '', votingDuration);
          const f = formatDeployResult('Create Proposal', deployHash, result,
            [`Title: ${title}`, `Voting Duration: ${votingDuration} blocks`, `Description: ${truncate(description || '', 100)}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'castVote': {
          const proposalId = text.match(/proposal(?:[-_\s]?id)?\s*[:#]?\s*([A-Za-z0-9_-]+)/i)?.[1] || '';
          const vote = text.match(/\b(for|against|yes|no)\b/i)?.[1] || 'for';
          if (!proposalId) { replyOk(callback, 'Please provide a proposal ID.'); return; }
          const { deployHash, result } = await castVote(contractHash, proposalId, vote);
          const f = formatDeployResult('Cast Vote', deployHash, result,
            [`Proposal ID: ${proposalId}`, `Vote: ${vote}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'executeProposal': {
          const proposalId = text.match(/proposal(?:[-_\s]?id)?\s*[:#]?\s*([A-Za-z0-9_-]+)/i)?.[1] || '';
          if (!proposalId) { replyOk(callback, 'Please provide a proposal ID.'); return; }
          const { deployHash, result } = await executeProposal(contractHash, proposalId);
          const f = formatDeployResult('Execute Proposal', deployHash, result,
            [`Proposal ID: ${proposalId}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'saveAsset': {
          const assetId = text.match(/asset(?:[-_\s]?id)?\s*[:#]?\s*([A-Za-z0-9_-]+)/i)?.[1] || '';
          const hashes = text.match(/[0-9a-fA-F]{64}/g) || [];
          if (!assetId || hashes.length < 2) { replyOk(callback, 'Please provide asset ID, owner hash, and document hash.'); return; }
          const ownerHash = hashes[0]!;
          const documentHash = hashes[1]!;
          const metadata = extractQuoted(text, 'metadata') || undefined;
          const { deployHash, result } = await saveAssetRecord(contractHash, assetId, ownerHash, documentHash, metadata);
          const f = formatDeployResult('Save RWA Asset', deployHash, result,
            [`Asset ID: ${assetId}`, `Owner Hash: ${truncate(ownerHash)}`, `Document Hash: ${truncate(documentHash)}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'callContract': {
          const entryPoint = text.match(/entry(?:[-_\s]?point)?\s*[:#]?\s*([A-Za-z_][A-Za-z0-9_]*)/i)?.[1] || '';
          if (!entryPoint) { replyOk(callback, 'Please provide an entry point name.'); return; }
          const argsJson = extractQuoted(text, 'args') || undefined;
          const argsMap = new Map<string, any>();
          if (argsJson) {
            try {
              const parsed = JSON.parse(argsJson);
              for (const [key, value] of Object.entries(parsed)) {
                argsMap.set(key, CLValue.newCLString(String(value)));
              }
            } catch {
              replyOk(callback, '❌ Invalid args JSON. Use format: {"key":"value"}');
              return;
            }
          }
          const { deployHash, result } = await callContract(contractHash, entryPoint, argsMap);
          const f = formatDeployResult('Contract Call', deployHash, result,
            [`Contract: ${truncate(contractHash)}`, `Entry Point: ${entryPoint}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }
      }
    } catch (error) {
      replyError(callback, 'DeFi operation failed', error);
    }
  },
  examples: [
    [
      { name: '{{user1}}', content: { text: 'Swap tokens on AMM contract abc123...' } },
      { name: '{{agent}}', content: { text: 'Executing AMM swap...' } },
    ],
    [
      { name: '{{user1}}', content: { text: 'Create governance proposal in contract def456...' } },
      { name: '{{agent}}', content: { text: 'Creating proposal...' } },
    ],
  ],
};
