import { Action, ActionExample, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { configureCasperServices } from '../config';
import {
  getNodeStatus,
  getPeers,
  getBlockByHash,
  getBlockByHeight,
  getDeploy,
  getBlockTransfers,
  getEraInfo,
  getStateRootHash,
  getAuctionInfo,
  getChainspec,
  getEraSummary,
} from '../services/casperRpcService';
import { replyOk, replyError, pretty } from './common';
import { detectSubcommand, extractContractHash, extractBlockHeight } from '../helpers/paramParser';
import { truncate, formatTimestamp, motesToCspr } from '../helpers/readHelper';

/**
 * Network query action — handles all read-only Casper blockchain queries:
 * node status, peers, blocks, deploys, era info, validators, transfers,
 * state root hash, chainspec.
 */
export const networkQueryAction: Action = {
  name: 'CASPER_NETWORK_QUERY',
  similes: [
    'CASPER_NODE_STATUS',
    'CASPER_PEERS',
    'CASPER_BLOCK',
    'CASPER_DEPLOY',
    'CASPER_ERA',
    'CASPER_VALIDATORS',
    'CASPER_TRANSFERS',
    'CASPER_STATE_ROOT_HASH',
    'CASPER_CHAINSPEC',
  ],
  description:
    'Query Casper blockchain network information: node status, peers, blocks, deploys, era, validators, transfers, state root hash, chainspec',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || '').toLowerCase();
    return [
      'node status', 'peers', 'block', 'deploy', 'era', 'validator',
      'transfers', 'state root hash', 'chainspec', 'auction',
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
        nodeStatus: ['node status', 'node info'],
        peers: ['peer'],
        block: ['block'],
        deploy: ['deploy'],
        era: ['era'],
        validators: ['validator', 'auction'],
        transfers: ['transfer'],
        stateRootHash: ['state root hash', 'state-root', 'stateroot'],
        chainspec: ['chainspec', 'chain spec'],
      }, 'nodeStatus');

      switch (sub) {
        case 'nodeStatus': {
          const status = await getNodeStatus();
          const lastBlock = status.last_added_block_info;
          replyOk(callback,
            `🌐 Casper Node Status\n` +
            `Chain Name: ${status.chainspec_name || 'N/A'}\n` +
            `API Version: ${status.api_version || 'N/A'}\n` +
            `Last Block Height: ${lastBlock?.height ?? 'N/A'}\n` +
            `Last Block Timestamp: ${formatTimestamp(lastBlock?.timestamp)}\n` +
            `Last Block Hash: ${truncate(lastBlock?.hash, 40)}\n` +
            `Peers: ${status.peers?.length ?? 0}\n` +
            `Build Version: ${status.build_version || 'N/A'}`,
            { status }
          );
          break;
        }

        case 'peers': {
          const result = await getPeers();
          const peers = result.peers || [];
          const peerList = peers.slice(0, 10).map((p: any, i: number) =>
            `${i + 1}. ${p.node_id} - ${p.address}`
          ).join('\n');
          replyOk(callback,
            `🔌 Network Peers\nTotal: ${peers.length}\n\n${peerList}${peers.length > 10 ? `\n(Showing 10 of ${peers.length})` : ''}`,
            { peerCount: peers.length, peers: peers.slice(0, 10) }
          );
          break;
        }

        case 'block': {
          const height = extractBlockHeight(text);
          const hash = extractContractHash(text);
          let result;
          if (hash) {
            result = await getBlockByHash(hash);
          } else if (height !== null) {
            result = await getBlockByHeight(height);
          } else {
            result = await getBlockByHeight(0); // latest
          }
          const block = result.block;
          if (!block) {
            replyOk(callback, '❌ Block not found');
            break;
          }
          const header = block.header || {};
          const body = block.body || {};
          replyOk(callback,
            `📦 Block Information\n` +
            `Hash: ${truncate(block.hash, 40)}\n` +
            `Height: ${header.height ?? 'N/A'}\n` +
            `Era: ${header.era_id ?? 'N/A'}\n` +
            `Timestamp: ${formatTimestamp(header.timestamp)}\n` +
            `State Root Hash: ${truncate(header.state_root_hash, 30)}\n` +
            `Deploy Count: ${body.deploy_hashes?.length ?? 0}\n` +
            `Transfer Count: ${body.transfer_hashes?.length ?? 0}`,
            { block }
          );
          break;
        }

        case 'deploy': {
          const hash = extractContractHash(text);
          if (!hash) {
            replyOk(callback, 'Please provide a deploy hash to query.');
            break;
          }
          const result = await getDeploy(hash);
          const deploy = result.deploy;
          if (!deploy) {
            replyOk(callback, '❌ Deploy not found');
            break;
          }
          const header = deploy.header || {};
          const execResults = result.execution_results || [];
          const execResult = execResults[0]?.result;
          const status = execResult?.Success ? '✅ Success' : execResult?.Failure ? '❌ Failed' : 'Pending';
          replyOk(callback,
            `📝 Deploy Information\n` +
            `Hash: ${truncate(hash, 40)}\n` +
            `Account: ${truncate(header.account, 30)}\n` +
            `Timestamp: ${formatTimestamp(header.timestamp)}\n` +
            `TTL: ${header.ttl ?? 'N/A'}\n` +
            `Gas Price: ${header.gas_price ?? 'N/A'}\n` +
            `Chain: ${header.chain_name || 'N/A'}\n` +
            `Status: ${status}` +
            (execResult?.Success ? `\nGas Consumed: ${execResult.Success.cost || 'N/A'}` : '') +
            (execResult?.Failure ? `\nError: ${execResult.Failure.error_message || 'N/A'}` : ''),
            { deploy: result }
          );
          break;
        }

        case 'era': {
          const result = await getEraSummary();
          const era = result.era_summary || {};
          const rewards = era.seigniorage_allocations || [];
          const totalReward = rewards.reduce((sum: number, r: any) => sum + parseFloat(r.amount || '0'), 0);
          replyOk(callback,
            `📅 Era Summary\n` +
            `Era ID: ${era.era_id ?? 'N/A'}\n` +
            `Block Hash: ${truncate(era.block_hash, 30)}\n` +
            `State Root Hash: ${truncate(era.state_root_hash, 30)}\n` +
            `Total Rewards: ${motesToCspr(totalReward)} CSPR\n` +
            `Reward Recipients: ${rewards.length}`,
            { era }
          );
          break;
        }

        case 'validators': {
          const result = await getAuctionInfo();
          const auctionState = result.auction_state || {};
          const bids = auctionState.bids || [];
          const activeBids = bids.filter((b: any) => b.bid && !b.bid.inactive);
          const topValidators = activeBids
            .sort((a: any, b: any) => parseFloat(b.bid?.staked_amount || '0') - parseFloat(a.bid?.staked_amount || '0'))
            .slice(0, 5);
          const validatorList = topValidators.map((v: any, i: number) => {
            const stake = motesToCspr(v.bid?.staked_amount || '0');
            return `${i + 1}. ${truncate(v.public_key, 25)} — ${stake} CSPR`;
          }).join('\n');
          replyOk(callback,
            `⚖️ Validators\n` +
            `Era ID: ${auctionState.era_id ?? 'N/A'}\n` +
            `Total Bids: ${bids.length}\n` +
            `Active Bids: ${activeBids.length}\n\n` +
            `Top 5 by Stake:\n${validatorList}`,
            { auctionState }
          );
          break;
        }

        case 'transfers': {
          const hash = extractContractHash(text);
          const result = await getBlockTransfers(hash || undefined);
          const transfers = result.transfers || [];
          const transferList = transfers.slice(0, 5).map((t: any, i: number) => {
            const amount = motesToCspr(t.amount || '0');
            return `${i + 1}. From: ${truncate(t.from, 20)} → To: ${truncate(t.to, 20)} — ${amount} CSPR`;
          }).join('\n');
          replyOk(callback,
            `💸 Block Transfers\n` +
            `Block Hash: ${truncate(result.block_hash, 30)}\n` +
            `Total Transfers: ${transfers.length}\n\n${transferList || 'No transfers'}`,
            { transfers }
          );
          break;
        }

        case 'stateRootHash': {
          const srh = await getStateRootHash();
          replyOk(callback,
            `🌳 State Root Hash\n${srh}`,
            { stateRootHash: srh }
          );
          break;
        }

        case 'chainspec': {
          const result = await getChainspec();
          replyOk(callback,
            `📋 Chainspec\nAPI Version: ${result.api_version || 'N/A'}\n\n${pretty(result)}`,
            { chainspec: result }
          );
          break;
        }
      }
    } catch (error) {
      replyError(callback, 'Network query failed', error);
    }
  },
  examples: [
    [
      { name: '{{user1}}', content: { text: 'Show me Casper node status' } },
      { name: '{{agent}}', content: { text: 'Querying Casper node status...' } },
    ],
    [
      { name: '{{user1}}', content: { text: 'Get latest block on Casper' } },
      { name: '{{agent}}', content: { text: 'Fetching the latest block...' } },
    ],
  ],
};
