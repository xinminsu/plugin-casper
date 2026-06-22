import { Action, ActionExample, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { configureCasperServices } from '../config';
import {
  getAccountInfo,
  getAccountInfoByHash,
  getBalance,
  getCsprBalance,
  getAccountNamedKeys,
  getPurseBalanceDetails,
  queryGlobalState,
  getContractInfo,
  getContractEntryPoints,
  getDictionaryItem,
  getDictionaryItemByAccount,
  getDictionaryItemByContract,
  getStateItem,
} from '../services/casperRpcService';
import { replyOk, replyError, pretty } from './common';
import { extractPublicKey, extractContractHash, extractURef, detectSubcommand, extractQuoted } from '../helpers/paramParser';
import {
  truncate,
  motesToCspr,
  validatePublicKey,
  validateAccountHash,
  validateContractHash,
  parseCLValue,
} from '../helpers/readHelper';

/**
 * Account & contract read action — handles queries for:
 * account info, named keys, purse balance, global state,
 * contract info, entry points, dictionary items, state items.
 */
export const accountReadAction: Action = {
  name: 'CASPER_ACCOUNT_READ',
  similes: [
    'CASPER_ACCOUNT_INFO',
    'CASPER_NAMED_KEYS',
    'CASPER_PURSE_BALANCE',
    'CASPER_CONTRACT_INFO',
    'CASPER_ENTRY_POINTS',
    'CASPER_DICT_ITEM',
    'CASPER_GLOBAL_STATE',
    'CASPER_STATE_ITEM',
  ],
  description:
    'Query Casper account info, named keys, purse balances, contract info, entry points, dictionary items, and global state',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || '').toLowerCase();
    return [
      'account info', 'named key', 'purse', 'contract info',
      'entry point', 'dictionary', 'dict', 'global state', 'state item',
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
        accountInfo: ['account info', 'account-info'],
        namedKeys: ['named key', 'named-key'],
        purseBalance: ['purse'],
        contractInfo: ['contract info', 'contract-info'],
        entryPoints: ['entry point', 'entry-point', 'entrypoint'],
        dictItem: ['dict item', 'dict-item', 'dictionary'],
        dictByAccount: ['dict by account', 'dict-by-account'],
        dictByContract: ['dict by contract', 'dict-by-contract'],
        globalState: ['global state', 'global-state'],
        stateItem: ['state item', 'state-item'],
      }, 'accountInfo');

      switch (sub) {
        case 'accountInfo': {
          const address = extractPublicKey(text) || extractContractHash(text);
          if (!address) {
            replyOk(callback, 'Please provide a public key or account hash to query account info.');
            return;
          }
          let accountInfo;
          if (validatePublicKey(address)) {
            accountInfo = await getAccountInfo(address);
          } else if (validateAccountHash(address)) {
            accountInfo = await getAccountInfoByHash(address);
          } else {
            replyOk(callback, 'Invalid address format. Provide a 68-hex public key or 64-hex account hash.');
            return;
          }
          const account = accountInfo?.account;
          if (!account) {
            replyOk(callback, 'Account not found on the network.');
            return;
          }
          const balanceMotes = await getBalance(account.main_purse);
          const assocKeys = (account.associated_keys || [])
            .map((k: any) => `${truncate(k.account_hash, 30)} (weight: ${k.weight})`)
            .join('\n') || 'None';
          replyOk(callback,
            `👤 Account Info\n` +
            `Account Hash: ${truncate(account.account_hash, 40)}\n` +
            `Main Purse: ${truncate(account.main_purse, 40)}\n` +
            `Balance: ${motesToCspr(balanceMotes)} CSPR\n` +
            `Deployment Threshold: ${account.action_thresholds?.deployment ?? 'N/A'}\n` +
            `Key Mgmt Threshold: ${account.action_thresholds?.key_management ?? 'N/A'}\n\n` +
            `Associated Keys:\n${assocKeys}`,
            { account: accountInfo }
          );
          break;
        }

        case 'namedKeys': {
          const pubKey = extractPublicKey(text);
          if (!pubKey || !validatePublicKey(pubKey)) {
            replyOk(callback, 'Please provide a valid public key (68 hex chars) to query named keys.');
            return;
          }
          const namedKeys = await getAccountNamedKeys(pubKey);
          const list = namedKeys.slice(0, 20).map((nk: any, i: number) =>
            `${i + 1}. ${nk.name}: ${truncate(nk.key, 40)}`
          ).join('\n');
          replyOk(callback,
            `🔑 Named Keys for ${truncate(pubKey, 40)}\n` +
            `Total: ${namedKeys.length}\n\n${list || 'No named keys found'}`,
            { namedKeys }
          );
          break;
        }

        case 'purseBalance': {
          const uref = extractURef(text);
          if (!uref) {
            replyOk(callback, 'Please provide a purse URef (format: uref-xxx-yyy).');
            return;
          }
          const balanceMotes = await getBalance(uref);
          replyOk(callback,
            `💰 Purse Balance\nURef: ${truncate(uref, 45)}\nBalance: ${motesToCspr(balanceMotes)} CSPR\nMotes: ${balanceMotes}`,
            { purseUref: uref, balanceMotes }
          );
          break;
        }

        case 'contractInfo': {
          const contractHash = extractContractHash(text);
          if (!contractHash || !validateContractHash(contractHash)) {
            replyOk(callback, 'Please provide a valid contract hash (64 hex chars).');
            return;
          }
          const result = await getContractInfo(contractHash);
          const contract = result?.contract;
          if (!contract) {
            replyOk(callback, 'Contract not found.');
            return;
          }
          const entryPoints = contract.entry_points || [];
          const epList = entryPoints.slice(0, 15).map((ep: any, i: number) =>
            `${i + 1}. ${ep.name} (${ep.entry_point_type || 'contract'})`
          ).join('\n');
          replyOk(callback,
            `📋 Contract Info\n` +
            `Hash: ${truncate(contract.contract_hash, 40)}\n` +
            `Package Hash: ${truncate(contract.contract_package_hash, 40)}\n` +
            `Version: ${contract.contract_version ?? 'N/A'}\n` +
            `Entry Points: ${entryPoints.length}\n\n${epList || 'None'}`,
            { contract }
          );
          break;
        }

        case 'entryPoints': {
          const contractHash = extractContractHash(text);
          if (!contractHash || !validateContractHash(contractHash)) {
            replyOk(callback, 'Please provide a valid contract hash.');
            return;
          }
          const entryPoints = await getContractEntryPoints(contractHash);
          const list = entryPoints.map((ep: any, i: number) => {
            const args = (ep.args || []).map((a: any) => `${a.name}:${a.cl_type}`).join(', ');
            return `${i + 1}. ${ep.name} (${ep.entry_point_type || 'contract'})\n   Args: ${args || 'none'}`;
          }).join('\n\n');
          replyOk(callback,
            `🔧 Entry Points for ${truncate(contractHash, 40)}\nTotal: ${entryPoints.length}\n\n${list}`,
            { entryPoints }
          );
          break;
        }

        case 'dictItem': {
          const uref = extractURef(text);
          const dictKey = extractQuoted(text) || text.match(/dict(?:[-_\s]?key)?\s*[:=]?\s*([A-Za-z0-9_-]+)/i)?.[1];
          if (!uref || !dictKey) {
            replyOk(callback, 'Please provide a URef and dictionary key.');
            return;
          }
          const result = await getDictionaryItem(uref, dictKey);
          const clValue = result?.stored_value?.CLValue || result?.stored_value?.cl_value;
          replyOk(callback,
            `📖 Dictionary Item\nURef: ${truncate(uref, 40)}\nKey: ${dictKey}\nValue: ${truncate(parseCLValue(clValue), 200)}`,
            { result }
          );
          break;
        }

        case 'dictByAccount': {
          const pubKey = extractPublicKey(text);
          const namedKey = extractQuoted(text, 'named') || extractQuoted(text, 'name');
          const dictKey = extractQuoted(text, 'dict') || extractQuoted(text, 'key');
          if (!pubKey || !namedKey || !dictKey) {
            replyOk(callback, 'Please provide a public key, named key name, and dictionary key.');
            return;
          }
          const result = await getDictionaryItemByAccount(pubKey, namedKey, dictKey);
          const clValue = result?.stored_value?.CLValue || result?.stored_value?.cl_value;
          replyOk(callback,
            `📖 Dict Item (via Account)\nAccount: ${truncate(pubKey, 40)}\nNamed Key: ${namedKey}\nDict Key: ${dictKey}\nValue: ${truncate(parseCLValue(clValue), 200)}`,
            { result }
          );
          break;
        }

        case 'dictByContract': {
          const contractHash = extractContractHash(text);
          const namedKey = extractQuoted(text, 'named') || extractQuoted(text, 'name');
          const dictKey = extractQuoted(text, 'dict') || extractQuoted(text, 'key');
          if (!contractHash || !namedKey || !dictKey) {
            replyOk(callback, 'Please provide a contract hash, named key name, and dictionary key.');
            return;
          }
          const result = await getDictionaryItemByContract(contractHash, namedKey, dictKey);
          const clValue = result?.stored_value?.CLValue || result?.stored_value?.cl_value;
          replyOk(callback,
            `📖 Dict Item (via Contract)\nContract: ${truncate(contractHash, 40)}\nNamed Key: ${namedKey}\nDict Key: ${dictKey}\nValue: ${truncate(parseCLValue(clValue), 200)}`,
            { result }
          );
          break;
        }

        case 'globalState': {
          const key = extractURef(text) || extractContractHash(text);
          if (!key) {
            replyOk(callback, 'Please provide a key (URef or hash) to query global state.');
            return;
          }
          const result = await queryGlobalState(key);
          const sv = result.stored_value || {};
          let valueStr = 'N/A';
          if (sv.Account) {
            valueStr = `Account: ${truncate(sv.Account.account_hash, 30)}`;
          } else if (sv.Contract) {
            valueStr = `Contract: ${truncate(sv.Contract.contract_hash, 30)}`;
          } else if (sv.CLValue) {
            valueStr = parseCLValue(sv.CLValue);
          } else {
            valueStr = truncate(pretty(sv), 200);
          }
          replyOk(callback,
            `🔍 Global State\nKey: ${truncate(key, 45)}\nBlock Hash: ${truncate(result.block_hash, 30)}\nValue: ${truncate(valueStr, 200)}`,
            { result }
          );
          break;
        }

        case 'stateItem': {
          const key = extractURef(text) || extractContractHash(text);
          if (!key) {
            replyOk(callback, 'Please provide a key to query state item.');
            return;
          }
          const result = await getStateItem(key);
          const sv = result?.stored_value || {};
          let valueStr = 'N/A';
          if (sv.Account) {
            valueStr = `Account: ${truncate(sv.Account.account_hash, 30)}`;
          } else if (sv.Contract) {
            valueStr = `Contract: ${truncate(sv.Contract.contract_hash, 30)}`;
          } else if (sv.CLValue) {
            valueStr = parseCLValue(sv.CLValue);
          } else {
            valueStr = truncate(pretty(sv), 200);
          }
          replyOk(callback,
            `📦 State Item\nKey: ${truncate(key, 45)}\nBlock Hash: ${truncate(result.block_hash, 30)}\nValue: ${truncate(valueStr, 200)}`,
            { result }
          );
          break;
        }
      }
    } catch (error) {
      replyError(callback, 'Account/contract query failed', error);
    }
  },
  examples: [
    [
      { name: '{{user1}}', content: { text: 'Get account info for 02a1b2c3d4e5f6...' } },
      { name: '{{agent}}', content: { text: 'Querying account info...' } },
    ],
    [
      { name: '{{user1}}', content: { text: 'Show contract info for hash abc123...' } },
      { name: '{{agent}}', content: { text: 'Fetching contract details...' } },
    ],
  ],
};
