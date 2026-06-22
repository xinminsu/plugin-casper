import { Action, ActionExample, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { configureCasperServices } from '../config';
import {
  bond,
  delegate,
  unbond,
  undelegate,
  withdrawRewards,
  setCommissionRate,
  isSigningKeyConfigured,
} from '../services/casperTransactionService';
import { replyOk, replyError, formatDeployResult } from './common';
import { detectSubcommand, extractPublicKey, extractAmount, extractInteger } from '../helpers/paramParser';
import { validatePublicKey } from '../helpers/readHelper';

/**
 * Staking write action — handles Casper staking/consensus operations:
 * bond (self-stake), delegate, unbond, undelegate, withdraw rewards, set commission rate.
 */
export const stakingWriteAction: Action = {
  name: 'CASPER_STAKING_WRITE',
  similes: [
    'CASPER_BOND',
    'CASPER_DELEGATE',
    'CASPER_UNBOND',
    'CASPER_UNDELEGATE',
    'CASPER_WITHDRAW_REWARDS',
    'CASPER_SET_COMMISSION',
  ],
  description:
    'Perform Casper staking operations: bond, delegate, unbond, undelegate, withdraw rewards, set commission rate',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || '').toLowerCase();
    return [
      'bond', 'delegate', 'undelegate', 'unbond',
      'withdraw reward', 'withdraw_reward',
      'commission rate', 'set commission',
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
        bond: ['bond', 'self-stake', 'self stake'],
        delegate: ['delegate'],
        unbond: ['unbond'],
        undelegate: ['undelegate'],
        withdrawRewards: ['withdraw reward', 'withdraw_reward', 'claim reward'],
        setCommissionRate: ['commission rate', 'set commission', 'commission_rate'],
      }, 'bond');

      const amount = extractAmount(text);

      switch (sub) {
        case 'bond': {
          if (!amount) { replyOk(callback, 'Please provide an amount to bond.'); return; }
          const delegatorRate = extractInteger(text, ['rate', 'delegator rate']);
          const { deployHash, result } = await bond(amount, delegatorRate ?? undefined);
          const extra = [`Amount: ${amount} CSPR`];
          if (delegatorRate !== null) extra.push(`Delegator Rate: ${delegatorRate}%`);
          const f = formatDeployResult('Bond (Self-Stake)', deployHash, result, extra);
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'delegate': {
          const validator = extractPublicKey(text);
          if (!validator || !validatePublicKey(validator)) { replyOk(callback, 'Please provide a valid validator public key.'); return; }
          if (!amount) { replyOk(callback, 'Please provide an amount to delegate.'); return; }
          const { deployHash, result } = await delegate(validator, amount);
          const f = formatDeployResult('Delegate', deployHash, result,
            [`Validator: ${validator.substring(0, 20)}...`, `Amount: ${amount} CSPR`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'unbond': {
          if (!amount) { replyOk(callback, 'Please provide an amount to unbond.'); return; }
          const { deployHash, result } = await unbond(amount);
          const f = formatDeployResult('Unbond', deployHash, result,
            [`Amount: ${amount} CSPR`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'undelegate': {
          const validator = extractPublicKey(text);
          if (!validator || !validatePublicKey(validator)) { replyOk(callback, 'Please provide a valid validator public key.'); return; }
          if (!amount) { replyOk(callback, 'Please provide an amount to undelegate.'); return; }
          const { deployHash, result } = await undelegate(validator, amount);
          const f = formatDeployResult('Undelegate', deployHash, result,
            [`Validator: ${validator.substring(0, 20)}...`, `Amount: ${amount} CSPR`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'withdrawRewards': {
          const { deployHash, result } = await withdrawRewards();
          const f = formatDeployResult('Withdraw Rewards', deployHash, result);
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'setCommissionRate': {
          const rate = extractInteger(text, ['rate', 'commission']);
          if (rate === null) { replyOk(callback, 'Please provide a commission rate.'); return; }
          const { deployHash, result } = await setCommissionRate(rate);
          const f = formatDeployResult('Set Commission Rate', deployHash, result,
            [`New Rate: ${rate}%`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }
      }
    } catch (error) {
      replyError(callback, 'Staking operation failed', error);
    }
  },
  examples: [
    [
      { name: '{{user1}}', content: { text: 'Bond 1000 CSPR on Casper' } },
      { name: '{{agent}}', content: { text: 'Bonding CSPR...' } },
    ],
    [
      { name: '{{user1}}', content: { text: 'Delegate 500 CSPR to validator 02abc...' } },
      { name: '{{agent}}', content: { text: 'Delegating to validator...' } },
    ],
  ],
};
