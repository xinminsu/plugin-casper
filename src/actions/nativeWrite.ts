import { Action, ActionExample, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { configureCasperServices } from '../config';
import {
  transferCspr,
  createPurse,
  addAssociatedKey,
  removeAssociatedKey,
  setActionThreshold,
  putNamedKey,
  getSigningPublicKeyHex,
  isSigningKeyConfigured,
} from '../services/casperTransactionService';
import { replyOk, replyError, formatDeployResult } from './common';
import { detectSubcommand, extractPublicKey, extractAmount, extractInteger, extractQuoted } from '../helpers/paramParser';
import { validatePublicKey } from '../helpers/readHelper';

/**
 * Native write action — handles Casper native operations:
 * transfer CSPR, create purse, add/remove associated key, set action threshold, put named key.
 */
export const nativeWriteAction: Action = {
  name: 'CASPER_NATIVE_WRITE',
  similes: [
    'CASPER_CREATE_PURSE',
    'CASPER_ADD_KEY',
    'CASPER_REMOVE_KEY',
    'CASPER_SET_THRESHOLD',
    'CASPER_PUT_NAMED_KEY',
    'CASPER_TRANSFER_NATIVE',
  ],
  description:
    'Perform Casper native operations: create purse, manage associated keys, set action thresholds, put named keys',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || '').toLowerCase();
    return [
      'create purse', 'add key', 'add associated', 'remove key', 'remove associated',
      'set threshold', 'put named key', 'put-named-key',
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
        replyOk(callback, '❌ No signing key configured. Set CASPER_SIGNING_KEY_HEX or CASPER_SIGNING_KEY_PEM in environment variables.');
        return;
      }

      const text = message.content.text || '';

      const sub = detectSubcommand(text, {
        createPurse: ['create purse', 'create-purse', 'new purse'],
        addKey: ['add key', 'add associated', 'add-associated'],
        removeKey: ['remove key', 'remove associated', 'remove-associated'],
        setThreshold: ['set threshold', 'set-threshold'],
        putNamedKey: ['put named key', 'put-named-key', 'named key'],
      }, 'createPurse');

      switch (sub) {
        case 'createPurse': {
          const name = extractQuoted(text, 'name') || undefined;
          const { deployHash, result } = await createPurse(name);
          const formatted = formatDeployResult('Create Purse', deployHash, result,
            name ? [`Purse Name: ${name}`] : []
          );
          replyOk(callback, formatted.text, formatted.content);
          break;
        }

        case 'addKey': {
          const pubKey = extractPublicKey(text);
          const weight = extractInteger(text, ['weight']);
          if (!pubKey || !validatePublicKey(pubKey)) {
            replyOk(callback, 'Please provide a valid public key (68 hex chars) to add.');
            return;
          }
          if (weight === null) {
            replyOk(callback, 'Please provide a weight for the key (e.g., weight: 1).');
            return;
          }
          const { deployHash, result } = await addAssociatedKey(pubKey, weight);
          const formatted = formatDeployResult('Add Associated Key', deployHash, result,
            [`Key: ${pubKey.substring(0, 30)}...`, `Weight: ${weight}`]
          );
          replyOk(callback, formatted.text, formatted.content);
          break;
        }

        case 'removeKey': {
          const pubKey = extractPublicKey(text);
          if (!pubKey || !validatePublicKey(pubKey)) {
            replyOk(callback, 'Please provide a valid public key (68 hex chars) to remove.');
            return;
          }
          const { deployHash, result } = await removeAssociatedKey(pubKey);
          const formatted = formatDeployResult('Remove Associated Key', deployHash, result,
            [`Removed Key: ${pubKey.substring(0, 30)}...`]
          );
          replyOk(callback, formatted.text, formatted.content);
          break;
        }

        case 'setThreshold': {
          const actionType = text.match(/(?:deployment|key[\s_-]?management)/i)?.[0] || 'deployment';
          const threshold = extractInteger(text, ['threshold']);
          if (threshold === null) {
            replyOk(callback, 'Please provide a threshold value.');
            return;
          }
          const { deployHash, result } = await setActionThreshold(actionType, threshold);
          const formatted = formatDeployResult('Set Action Threshold', deployHash, result,
            [`Action Type: ${actionType}`, `New Threshold: ${threshold}`]
          );
          replyOk(callback, formatted.text, formatted.content);
          break;
        }

        case 'putNamedKey': {
          const name = extractQuoted(text, 'name') || extractQuoted(text);
          const keyValue = extractQuoted(text, 'key') || extractQuoted(text, 'value');
          if (!name || !keyValue) {
            replyOk(callback, 'Please provide a key name and key value.');
            return;
          }
          const { deployHash, result } = await putNamedKey(name, keyValue);
          const formatted = formatDeployResult('Put Named Key', deployHash, result,
            [`Key Name: ${name}`, `Key Value: ${keyValue.substring(0, 30)}...`]
          );
          replyOk(callback, formatted.text, formatted.content);
          break;
        }
      }
    } catch (error) {
      replyError(callback, 'Native operation failed', error);
    }
  },
  examples: [
    [
      { name: '{{user1}}', content: { text: 'Create a new purse on Casper' } },
      { name: '{{agent}}', content: { text: 'Creating a new purse...' } },
    ],
    [
      { name: '{{user1}}', content: { text: 'Add associated key 02abc... with weight 1' } },
      { name: '{{agent}}', content: { text: 'Adding associated key...' } },
    ],
  ],
};
