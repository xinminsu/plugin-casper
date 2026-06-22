import { Action, ActionExample, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { configureCasperServices } from '../config';
import {
  cep18Mint,
  cep18Burn,
  cep18Transfer,
  cep18Approve,
  cep18IncreaseAllowance,
  cep18DecreaseAllowance,
  cep18TransferFrom,
  isSigningKeyConfigured,
} from '../services/casperTransactionService';
import { replyOk, replyError, formatDeployResult } from './common';
import { detectSubcommand, extractPublicKey, extractContractHash, extractAmount, extractInteger } from '../helpers/paramParser';
import { validatePublicKey } from '../helpers/readHelper';

/**
 * Token write action — handles CEP-18 fungible token operations:
 * mint, burn, transfer, approve, increase/decrease allowance, transfer from.
 */
export const tokenWriteAction: Action = {
  name: 'CASPER_TOKEN_WRITE',
  similes: [
    'CASPER_CEP18_MINT',
    'CASPER_CEP18_BURN',
    'CASPER_CEP18_TRANSFER',
    'CASPER_CEP18_APPROVE',
    'CASPER_CEP18_ALLOWANCE',
    'CASPER_CEP18_TRANSFER_FROM',
  ],
  description:
    'Perform Casper CEP-18 fungible token operations: mint, burn, transfer, approve, increase/decrease allowance, transfer from',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || '').toLowerCase();
    return [
      'mint token', 'burn token', 'transfer token', 'approve token',
      'increase allowance', 'decrease allowance', 'transfer from',
      'cep-18 mint', 'cep-18 burn', 'cep18 mint', 'cep18 burn',
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
        mint: ['mint'],
        burn: ['burn'],
        transfer: ['transfer token', 'cep-18 transfer', 'cep18 transfer', 'send token'],
        approve: ['approve'],
        increaseAllowance: ['increase allowance', 'increase_allowance'],
        decreaseAllowance: ['decrease allowance', 'decrease_allowance'],
        transferFrom: ['transfer from', 'transfer_from'],
      }, 'mint');

      const contractHash = extractContractHash(text);
      if (!contractHash) {
        replyOk(callback, 'Please provide a contract hash.');
        return;
      }

      const amount = extractAmount(text);
      const decimals = extractInteger(text, ['decimals']) ?? 9;

      switch (sub) {
        case 'mint': {
          const owner = extractPublicKey(text);
          if (!owner || !validatePublicKey(owner)) { replyOk(callback, 'Please provide a valid owner public key.'); return; }
          if (!amount) { replyOk(callback, 'Please provide an amount to mint.'); return; }
          const { deployHash, result } = await cep18Mint(contractHash, owner, amount, decimals);
          const f = formatDeployResult('CEP-18 Mint', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Owner: ${owner.substring(0, 20)}...`, `Amount: ${amount}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'burn': {
          const owner = extractPublicKey(text);
          if (!owner || !validatePublicKey(owner)) { replyOk(callback, 'Please provide a valid owner public key.'); return; }
          if (!amount) { replyOk(callback, 'Please provide an amount to burn.'); return; }
          const { deployHash, result } = await cep18Burn(contractHash, owner, amount, decimals);
          const f = formatDeployResult('CEP-18 Burn', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Owner: ${owner.substring(0, 20)}...`, `Amount: ${amount}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'transfer': {
          const recipient = extractPublicKey(text);
          if (!recipient || !validatePublicKey(recipient)) { replyOk(callback, 'Please provide a valid recipient public key.'); return; }
          if (!amount) { replyOk(callback, 'Please provide an amount to transfer.'); return; }
          const { deployHash, result } = await cep18Transfer(contractHash, recipient, amount, decimals);
          const f = formatDeployResult('CEP-18 Transfer', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Recipient: ${recipient.substring(0, 20)}...`, `Amount: ${amount}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'approve': {
          const spender = extractPublicKey(text);
          if (!spender || !validatePublicKey(spender)) { replyOk(callback, 'Please provide a valid spender public key.'); return; }
          if (!amount) { replyOk(callback, 'Please provide an amount to approve.'); return; }
          const { deployHash, result } = await cep18Approve(contractHash, spender, amount, decimals);
          const f = formatDeployResult('CEP-18 Approve', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Spender: ${spender.substring(0, 20)}...`, `Amount: ${amount}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'increaseAllowance': {
          const spender = extractPublicKey(text);
          if (!spender || !validatePublicKey(spender)) { replyOk(callback, 'Please provide a valid spender public key.'); return; }
          if (!amount) { replyOk(callback, 'Please provide an amount.'); return; }
          const { deployHash, result } = await cep18IncreaseAllowance(contractHash, spender, amount, decimals);
          const f = formatDeployResult('CEP-18 Increase Allowance', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Spender: ${spender.substring(0, 20)}...`, `Amount: ${amount}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'decreaseAllowance': {
          const spender = extractPublicKey(text);
          if (!spender || !validatePublicKey(spender)) { replyOk(callback, 'Please provide a valid spender public key.'); return; }
          if (!amount) { replyOk(callback, 'Please provide an amount.'); return; }
          const { deployHash, result } = await cep18DecreaseAllowance(contractHash, spender, amount, decimals);
          const f = formatDeployResult('CEP-18 Decrease Allowance', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Spender: ${spender.substring(0, 20)}...`, `Amount: ${amount}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'transferFrom': {
          const keys = text.match(/0[1-3][0-9a-fA-F]{64,68}/g) || [];
          if (keys.length < 2) { replyOk(callback, 'Please provide both owner and recipient public keys.'); return; }
          const owner = keys[0]!;
          const recipient = keys[1]!;
          if (!amount) { replyOk(callback, 'Please provide an amount.'); return; }
          const { deployHash, result } = await cep18TransferFrom(contractHash, owner, recipient, amount, decimals);
          const f = formatDeployResult('CEP-18 Transfer From', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Owner: ${owner.substring(0, 20)}...`, `Recipient: ${recipient.substring(0, 20)}...`, `Amount: ${amount}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }
      }
    } catch (error) {
      replyError(callback, 'Token operation failed', error);
    }
  },
  examples: [
    [
      { name: '{{user1}}', content: { text: 'Mint 100 tokens for owner 02abc... in contract def123...' } },
      { name: '{{agent}}', content: { text: 'Minting CEP-18 tokens...' } },
    ],
  ],
};
