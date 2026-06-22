import { Action, ActionExample, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { configureCasperServices } from '../config';
import {
  getEraValidators,
  getAuctionInfo,
  getDelegationInfo,
  getValidatorChangesInfo,
  getEraSummary,
} from '../services/casperRpcService';
import { replyOk, replyError } from './common';
import { detectSubcommand, extractPublicKey, extractContractHash } from '../helpers/paramParser';
import { truncate, motesToCspr, validatePublicKey } from '../helpers/readHelper';

/**
 * Staking read action — handles Casper staking/consensus queries:
 * era validators, validator details, delegation info, auction info,
 * validator changes, era summary.
 */
export const stakingReadAction: Action = {
  name: 'CASPER_STAKING_READ',
  similes: [
    'CASPER_ERA_VALIDATORS',
    'CASPER_VALIDATOR_DETAIL',
    'CASPER_DELEGATION',
    'CASPER_AUCTION_INFO',
    'CASPER_VALIDATOR_CHANGES',
    'CASPER_ERA_SUMMARY',
  ],
  description:
    'Query Casper staking information: era validators, validator details, delegation info, auction state, validator changes, era summary',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || '').toLowerCase();
    return [
      'era validator', 'validator detail', 'delegation', 'auction info',
      'validator change', 'era summary', 'stake', 'staked',
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
      const text = message.content.text || '';

      const sub = detectSubcommand(text, {
        eraValidators: ['era validator', 'era-validator'],
        validatorDetail: ['validator detail', 'validator-detail', 'validator info'],
        delegation: ['delegation', 'delegate'],
        auctionInfo: ['auction info', 'auction-info', 'auction state'],
        validatorChanges: ['validator change', 'validator-change'],
        eraSummary: ['era summary', 'era-summary'],
      }, 'eraValidators');

      switch (sub) {
        case 'eraValidators': {
          const result = await getEraValidators();
          const eraValidators = result?.era_validators || [];
          const topValidators = eraValidators
            .flatMap((ev: any) => (ev.validator_weights || []).map((v: any) => ({
              publicKey: v.public_key,
              weight: v.weight,
            })))
            .sort((a: any, b: any) => parseFloat(b.weight || '0') - parseFloat(a.weight || '0'))
            .slice(0, 10);
          const list = topValidators.map((v: any, i: number) =>
            `${i + 1}. ${truncate(v.publicKey, 30)} — ${motesToCspr(v.weight)} CSPR`
          ).join('\n');
          replyOk(callback,
            `⚖️ Era Validators\nEra ID: ${result?.era_id ?? 'N/A'}\nTop 10 by Stake:\n${list}`,
            { eraValidators: result }
          );
          break;
        }

        case 'validatorDetail': {
          const pubKey = extractPublicKey(text);
          if (!pubKey || !validatePublicKey(pubKey)) {
            replyOk(callback, 'Please provide a validator public key (68 hex chars).');
            break;
          }
          const result = await getAuctionInfo();
          const bids = result?.auction_state?.bids || [];
          const bid = bids.find((b: any) => b.public_key === pubKey);
          if (!bid) { replyOk(callback, 'Validator not found.'); break; }
          const b = bid.bid || {};
          const delegators = b.delegators || [];
          const totalDelegated = delegators.reduce((sum: number, d: any) => sum + parseFloat(d.staked_amount || '0'), 0);
          const topDelegators = delegators
            .sort((a: any, b: any) => parseFloat(b.staked_amount || '0') - parseFloat(a.staked_amount || '0'))
            .slice(0, 5);
          const delegatorList = topDelegators.map((d: any, i: number) =>
            `${i + 1}. ${truncate(d.public_key, 30)} — ${motesToCspr(d.staked_amount)} CSPR`
          ).join('\n');
          replyOk(callback,
            `⚖️ Validator Details\n` +
            `Public Key: ${truncate(pubKey, 45)}\n` +
            `Staked: ${motesToCspr(b.staked_amount || '0')} CSPR\n` +
            `Delegation Rate: ${b.delegation_rate ?? 'N/A'}%\n` +
            `Inactive: ${b.inactive ? 'Yes' : 'No'}\n` +
            `Delegator Count: ${delegators.length}\n` +
            `Total Delegated: ${motesToCspr(totalDelegated.toString())} CSPR\n\n` +
            `Top 5 Delegators:\n${delegatorList || 'None'}`,
            { validator: bid }
          );
          break;
        }

        case 'delegation': {
          const delegator = extractPublicKey(text);
          if (!delegator || !validatePublicKey(delegator)) {
            replyOk(callback, 'Please provide a delegator public key (68 hex chars).');
            break;
          }
          const result = await getAuctionInfo();
          const bids = result?.auction_state?.bids || [];
          const delegations: { validator: string; amount: string }[] = [];
          for (const bid of bids) {
            const delegators = bid.bid?.delegators || [];
            for (const d of delegators) {
              if (d.public_key === delegator) {
                delegations.push({ validator: bid.public_key, amount: d.staked_amount || '0' });
              }
            }
          }
          if (delegations.length === 0) { replyOk(callback, 'No delegation records found for this account.'); break; }
          const list = delegations.map((d, i) =>
            `${i + 1}. Validator: ${truncate(d.validator, 30)} — ${motesToCspr(d.amount)} CSPR`
          ).join('\n');
          const total = delegations.reduce((sum, d) => sum + parseFloat(d.amount), 0);
          replyOk(callback,
            `⚖️ Delegation Info\nDelegator: ${truncate(delegator, 45)}\nTotal Delegations: ${delegations.length}\nTotal Delegated: ${motesToCspr(total.toString())} CSPR\n\n${list}`,
            { delegator, delegations }
          );
          break;
        }

        case 'auctionInfo': {
          const result = await getAuctionInfo();
          const auctionState = result?.auction_state || {};
          const bids = auctionState.bids || [];
          const activeBids = bids.filter((b: any) => b.bid && !b.bid.inactive);
          const totalStaked = activeBids.reduce((sum: number, b: any) => sum + parseFloat(b.bid?.staked_amount || '0'), 0);
          replyOk(callback,
            `⚖️ Auction State\n` +
            `Era ID: ${auctionState.era_id ?? 'N/A'}\n` +
            `State Root Hash: ${truncate(auctionState.state_root_hash, 30)}\n` +
            `Total Bids: ${bids.length}\n` +
            `Active Bids: ${activeBids.length}\n` +
            `Total Staked: ${motesToCspr(totalStaked.toString())} CSPR\n` +
            `Block Height: ${auctionState.block_height ?? 'N/A'}`,
            { auctionState }
          );
          break;
        }

        case 'validatorChanges': {
          const result = await getValidatorChangesInfo();
          const changes = result?.changes || [];
          if (changes.length === 0) { replyOk(callback, 'No recent validator changes.'); break; }
          const list = changes.slice(0, 10).map((c: any, i: number) => {
            const type = c.change_type || {};
            const changeStr = type.Activated ? 'Activated' : type.Deactivated ? 'Deactivated' : 'Changed';
            return `${i + 1}. ${truncate(c.public_key, 35)} — ${changeStr}`;
          }).join('\n');
          replyOk(callback,
            `⚖️ Validator Changes\nTotal: ${changes.length}\n\n${list}`,
            { changes }
          );
          break;
        }

        case 'eraSummary': {
          const result = await getEraSummary();
          const era = result?.era_summary || {};
          const rewards = era.seigniorage_allocations || [];
          const totalReward = rewards.reduce((sum: number, r: any) => sum + parseFloat(r.amount || '0'), 0);
          const topRewards = rewards
            .sort((a: any, b: any) => parseFloat(b.amount || '0') - parseFloat(a.amount || '0'))
            .slice(0, 5);
          const rewardList = topRewards.map((r: any, i: number) => {
            const recipient = r.Validator ? `Validator: ${truncate(r.Validator, 25)}` : `Delegator: ${truncate(r.Delegator, 25)}`;
            return `${i + 1}. ${recipient} — ${motesToCspr(r.amount)} CSPR`;
          }).join('\n');
          replyOk(callback,
            `📅 Era Summary\n` +
            `Era ID: ${era.era_id ?? 'N/A'}\n` +
            `Block Hash: ${truncate(era.block_hash, 30)}\n` +
            `State Root Hash: ${truncate(era.state_root_hash, 30)}\n` +
            `Total Rewards: ${motesToCspr(totalReward.toString())} CSPR\n` +
            `Reward Recipients: ${rewards.length}\n\n` +
            `Top 5 Recipients:\n${rewardList || 'None'}`,
            { era }
          );
          break;
        }
      }
    } catch (error) {
      replyError(callback, 'Staking query failed', error);
    }
  },
  examples: [
    [
      { name: '{{user1}}', content: { text: 'Show me era validators on Casper' } },
      { name: '{{agent}}', content: { text: 'Querying era validators...' } },
    ],
    [
      { name: '{{user1}}', content: { text: 'Get delegation info for 02abc...' } },
      { name: '{{agent}}', content: { text: 'Looking up delegation info...' } },
    ],
  ],
};
