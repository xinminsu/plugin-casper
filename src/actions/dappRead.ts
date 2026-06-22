import { Action, ActionExample, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { configureCasperServices } from '../config';
import {
  getContractInfo,
  getDictionaryItem,
  queryGlobalState,
  getAccountInfo,
} from '../services/casperRpcService';
import { replyOk, replyError } from './common';
import { detectSubcommand, extractPublicKey, extractContractHash, extractTokenId } from '../helpers/paramParser';
import { truncate, validateContractHash, validatePublicKey, parseCLValue } from '../helpers/readHelper';

/**
 * DApp read action — handles queries for counter contracts, AMM pools,
 * governance proposals, RWA assets, and DEX orders.
 */
export const dappReadAction: Action = {
  name: 'CASPER_DAPP_READ',
  similes: [
    'CASPER_COUNTER_VALUE',
    'CASPER_AMM_RESERVES',
    'CASPER_LP_BALANCE',
    'CASPER_PROPOSAL',
    'CASPER_VOTE_RECORD',
    'CASPER_ASSET_RECORD',
    'CASPER_OPEN_ORDERS',
  ],
  description:
    'Query Casper DApp data: counter values, AMM pool reserves, LP balances, governance proposals, vote records, RWA asset records, DEX open orders',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || '').toLowerCase();
    return [
      'counter', 'amm', 'pool', 'lp balance', 'proposal', 'vote record',
      'asset record', 'open order', 'rwa', 'governance',
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
        counterValue: ['counter value', 'counter-value', 'count'],
        ammReserves: ['amm reserve', 'amm-reserve', 'pool reserve'],
        ammLpBalance: ['lp balance', 'lp-balance', 'amm balance'],
        ammStakeInfo: ['stake info', 'stake-info', 'staking info'],
        allProposals: ['all proposal', 'proposal count'],
        proposalDetail: ['proposal detail', 'proposal-detail'],
        voteRecord: ['vote record', 'vote-record'],
        assetRecord: ['asset record', 'asset-record', 'rwa'],
        openOrders: ['open order', 'open-order', 'order book'],
      }, 'counterValue');

      const contractHash = extractContractHash(text);
      if (!contractHash || !validateContractHash(contractHash)) {
        replyOk(callback, 'Please provide a valid contract hash (64 hex chars).');
        return;
      }

      async function getNamedKeyURef(hash: string, names: string[]): Promise<string | null> {
        const info = await getContractInfo(hash);
        const namedKeys = info?.contract?.named_keys || [];
        for (const name of names) {
          const found = namedKeys.find((nk: any) => nk.name === name);
          if (found) return found.key;
        }
        return null;
      }

      switch (sub) {
        case 'counterValue': {
          const uref = await getNamedKeyURef(contractHash, ['count', 'counter', 'value', 'counter_value']);
          if (!uref) { replyOk(callback, 'Could not find count URef.'); break; }
          const result = await queryGlobalState(uref);
          const value = parseCLValue(result?.stored_value?.CLValue);
          replyOk(callback,
            `🔢 Counter Value\nContract: ${truncate(contractHash, 40)}\nCurrent Value: ${value}`,
            { contractHash, count: value }
          );
          break;
        }

        case 'ammReserves': {
          const reserveA = await getNamedKeyURef(contractHash, ['reserve_a', 'token_a_reserve', 'reserve0', 'reserve_0']);
          const reserveB = await getNamedKeyURef(contractHash, ['reserve_b', 'token_b_reserve', 'reserve1', 'reserve_1']);
          const lpSupply = await getNamedKeyURef(contractHash, ['lp_token_supply', 'total_lp', 'total_supply']);
          if (!reserveA && !reserveB) { replyOk(callback, 'Could not find reserve URefs.'); break; }
          let aVal = 'N/A', bVal = 'N/A', lpVal = 'N/A';
          if (reserveA) { const r = await queryGlobalState(reserveA); aVal = parseCLValue(r?.stored_value?.CLValue); }
          if (reserveB) { const r = await queryGlobalState(reserveB); bVal = parseCLValue(r?.stored_value?.CLValue); }
          if (lpSupply) { const r = await queryGlobalState(lpSupply); lpVal = parseCLValue(r?.stored_value?.CLValue); }
          replyOk(callback,
            `📈 AMM Pool Reserves\nContract: ${truncate(contractHash, 40)}\nReserve A: ${aVal}\nReserve B: ${bVal}\nLP Total Supply: ${lpVal}`,
            { contractHash, reserveA: aVal, reserveB: bVal, lpSupply: lpVal }
          );
          break;
        }

        case 'ammLpBalance': {
          const user = extractPublicKey(text);
          if (!user || !validatePublicKey(user)) { replyOk(callback, 'Please provide a user public key.'); break; }
          const balancesURef = await getNamedKeyURef(contractHash, ['lp_balances', 'balances', 'lp_token_balances']);
          if (!balancesURef) { replyOk(callback, 'Could not find LP balances URef.'); break; }
          const accountInfo = await getAccountInfo(user);
          const dictKey = (accountInfo?.account?.account_hash || '').replace(/^account-hash-/, '');
          const result = await getDictionaryItem(balancesURef, dictKey);
          const balance = parseCLValue(result?.stored_value?.CLValue || result?.stored_value?.cl_value);
          replyOk(callback,
            `📈 LP Token Balance\nContract: ${truncate(contractHash, 40)}\nUser: ${truncate(user, 40)}\nLP Balance: ${balance}`,
            { contractHash, user, lpBalance: balance }
          );
          break;
        }

        case 'ammStakeInfo': {
          const user = extractPublicKey(text);
          if (!user || !validatePublicKey(user)) { replyOk(callback, 'Please provide a user public key.'); break; }
          const stakeURef = await getNamedKeyURef(contractHash, ['stake_info', 'staking_info', 'user_stakes', 'stakes']);
          if (!stakeURef) { replyOk(callback, 'Could not find stake info URef.'); break; }
          const accountInfo = await getAccountInfo(user);
          const dictKey = (accountInfo?.account?.account_hash || '').replace(/^account-hash-/, '');
          const result = await getDictionaryItem(stakeURef, dictKey);
          const stakeInfo = parseCLValue(result?.stored_value?.CLValue || result?.stored_value?.cl_value);
          replyOk(callback,
            `📈 Staking Info\nContract: ${truncate(contractHash, 40)}\nUser: ${truncate(user, 40)}\nStake Info: ${truncate(stakeInfo, 200)}`,
            { contractHash, user, stakeInfo }
          );
          break;
        }

        case 'allProposals': {
          const proposalsURef = await getNamedKeyURef(contractHash, ['proposals', 'all_proposals', 'proposal_list']);
          const countURef = await getNamedKeyURef(contractHash, ['proposal_count', 'total_proposals', 'next_proposal_id']);
          let count = 'N/A';
          if (countURef) { const r = await queryGlobalState(countURef); count = parseCLValue(r?.stored_value?.CLValue); }
          replyOk(callback,
            `🗳️ Governance Proposals\nContract: ${truncate(contractHash, 40)}\nProposal Count: ${count}\nProposals URef: ${proposalsURef ? truncate(proposalsURef, 40) : 'Not found'}\n\nHint: Use proposal-detail to query individual proposal by ID`,
            { contractHash, proposalCount: count }
          );
          break;
        }

        case 'proposalDetail': {
          const proposalId = extractTokenId(text) || text.match(/proposal(?:[-_\s]?id)?\s*[:#]?\s*([A-Za-z0-9_-]+)/i)?.[1];
          if (!proposalId) { replyOk(callback, 'Please provide a proposal ID.'); break; }
          const proposalsURef = await getNamedKeyURef(contractHash, ['proposals', 'all_proposals', 'proposal_list']);
          if (!proposalsURef) { replyOk(callback, 'Could not find proposals URef.'); break; }
          const result = await getDictionaryItem(proposalsURef, proposalId);
          const proposal = parseCLValue(result?.stored_value?.CLValue || result?.stored_value?.cl_value);
          replyOk(callback,
            `🗳️ Proposal Details\nContract: ${truncate(contractHash, 40)}\nProposal ID: ${proposalId}\nData: ${truncate(proposal, 200)}`,
            { contractHash, proposalId, proposal }
          );
          break;
        }

        case 'voteRecord': {
          const voter = extractPublicKey(text);
          if (!voter || !validatePublicKey(voter)) { replyOk(callback, 'Please provide a voter public key.'); break; }
          const proposalId = extractTokenId(text);
          if (!proposalId) { replyOk(callback, 'Please provide a proposal ID.'); break; }
          const votesURef = await getNamedKeyURef(contractHash, ['votes', 'vote_records', 'voter_records']);
          if (!votesURef) { replyOk(callback, 'Could not find votes URef.'); break; }
          const accountInfo = await getAccountInfo(voter);
          const accountHash = (accountInfo?.account?.account_hash || '').replace(/^account-hash-/, '');
          const dictKey = `${proposalId}_${accountHash}`;
          const result = await getDictionaryItem(votesURef, dictKey);
          const vote = parseCLValue(result?.stored_value?.CLValue || result?.stored_value?.cl_value);
          replyOk(callback,
            `🗳️ Vote Record\nContract: ${truncate(contractHash, 40)}\nProposal ID: ${proposalId}\nVoter: ${truncate(voter, 40)}\nVote: ${truncate(vote, 100)}`,
            { contractHash, proposalId, voter, vote }
          );
          break;
        }

        case 'assetRecord': {
          const assetId = extractTokenId(text) || text.match(/asset(?:[-_\s]?id)?\s*[:#]?\s*([A-Za-z0-9_-]+)/i)?.[1];
          if (!assetId) { replyOk(callback, 'Please provide an asset ID.'); break; }
          const assetsURef = await getNamedKeyURef(contractHash, ['assets', 'asset_records', 'records', 'rwa_assets']);
          if (!assetsURef) { replyOk(callback, 'Could not find assets URef.'); break; }
          const result = await getDictionaryItem(assetsURef, assetId);
          const asset = parseCLValue(result?.stored_value?.CLValue || result?.stored_value?.cl_value);
          replyOk(callback,
            `📄 RWA Asset Record\nContract: ${truncate(contractHash, 40)}\nAsset ID: ${assetId}\nRecord: ${truncate(asset, 200)}`,
            { contractHash, assetId, asset }
          );
          break;
        }

        case 'openOrders': {
          const user = extractPublicKey(text);
          if (!user || !validatePublicKey(user)) { replyOk(callback, 'Please provide a user public key.'); break; }
          const ordersURef = await getNamedKeyURef(contractHash, ['user_orders', 'orders', 'open_orders', 'order_book']);
          if (!ordersURef) { replyOk(callback, 'Could not find orders URef.'); break; }
          const accountInfo = await getAccountInfo(user);
          const dictKey = (accountInfo?.account?.account_hash || '').replace(/^account-hash-/, '');
          const result = await getDictionaryItem(ordersURef, dictKey);
          const orders = parseCLValue(result?.stored_value?.CLValue || result?.stored_value?.cl_value);
          replyOk(callback,
            `📊 Open Orders\nContract: ${truncate(contractHash, 40)}\nUser: ${truncate(user, 40)}\nOrders: ${truncate(orders, 200)}`,
            { contractHash, user, orders }
          );
          break;
        }
      }
    } catch (error) {
      replyError(callback, 'DApp query failed', error);
    }
  },
  examples: [
    [
      { name: '{{user1}}', content: { text: 'Get counter value from contract abc123...' } },
      { name: '{{agent}}', content: { text: 'Reading counter value...' } },
    ],
    [
      { name: '{{user1}}', content: { text: 'Show AMM reserves for contract def456...' } },
      { name: '{{agent}}', content: { text: 'Fetching AMM pool reserves...' } },
    ],
  ],
};
