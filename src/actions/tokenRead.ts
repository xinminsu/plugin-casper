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
 * Token read action — handles CEP-18 fungible token and CEP-47/78 NFT
 * read queries: total supply, balance, allowance, metadata, owner-of,
 * tokens-of, approved, max supply, batch owners.
 */
export const tokenReadAction: Action = {
  name: 'CASPER_TOKEN_READ',
  similes: [
    'CASPER_TOKEN_BALANCE',
    'CASPER_TOKEN_SUPPLY',
    'CASPER_TOKEN_ALLOWANCE',
    'CASPER_TOKEN_METADATA',
    'CASPER_NFT_OWNER',
    'CASPER_NFT_METADATA',
    'CASPER_NFT_SUPPLY',
  ],
  description:
    'Query Casper CEP-18 token and CEP-47/78 NFT information: balance, total supply, allowance, metadata, owner, tokens owned',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || '').toLowerCase();
    return [
      'token', 'nft', 'cep-18', 'cep18', 'cep-47', 'cep47', 'cep-78', 'cep78',
      'total supply', 'token balance', 'allowance', 'metadata', 'owner of',
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
        tokenTotalSupply: ['total supply', 'total_supply', 'totalsupply'],
        tokenBalance: ['token balance', 'balance of'],
        tokenAllowance: ['allowance'],
        tokenMetadata: ['token meta', 'token name', 'token symbol'],
        nftTotalSupply: ['nft total supply', 'nft supply', 'minted tokens'],
        nftOwnerOf: ['owner of', 'nft owner', 'who owns'],
        nftTokensOf: ['tokens of', 'owned tokens', 'owned by'],
        nftMetadata: ['nft meta', 'metadata for'],
        nftApproved: ['approved', 'approval'],
        nftMaxSupply: ['max supply', 'maximum supply'],
        nftBatchOwners: ['batch owner', 'batch owner'],
      }, 'tokenTotalSupply');

      const contractHash = extractContractHash(text);
      if (!contractHash || !validateContractHash(contractHash)) {
        replyOk(callback, 'Please provide a valid contract hash (64 hex chars).');
        return;
      }

      // Helper to find a named key URef in a contract
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
        case 'tokenTotalSupply': {
          const uref = await getNamedKeyURef(contractHash, ['total_supply', 'total_supply_uref', 'totalsupply']);
          if (!uref) { replyOk(callback, 'Could not find total_supply URef in contract named keys.'); break; }
          const result = await queryGlobalState(uref);
          const value = parseCLValue(result?.stored_value?.CLValue);
          replyOk(callback,
            `🪙 CEP-18 Total Supply\nContract: ${truncate(contractHash, 40)}\nTotal Supply: ${value}`,
            { contractHash, totalSupply: value }
          );
          break;
        }

        case 'tokenBalance': {
          const owner = extractPublicKey(text);
          if (!owner || !validatePublicKey(owner)) {
            replyOk(callback, 'Please provide a valid owner public key (68 hex chars).');
            break;
          }
          const balancesURef = await getNamedKeyURef(contractHash, ['balances', 'balances_uref', 'balance']);
          if (!balancesURef) { replyOk(callback, 'Could not find balances URef.'); break; }
          const accountInfo = await getAccountInfo(owner);
          const dictKey = (accountInfo?.account?.account_hash || '').replace(/^account-hash-/, '');
          const result = await getDictionaryItem(balancesURef, dictKey);
          const value = parseCLValue(result?.stored_value?.CLValue || result?.stored_value?.cl_value);
          replyOk(callback,
            `🪙 Token Balance\nContract: ${truncate(contractHash, 40)}\nOwner: ${truncate(owner, 40)}\nBalance: ${value}`,
            { contractHash, owner, balance: value }
          );
          break;
        }

        case 'tokenAllowance': {
          const owner = extractPublicKey(text);
          if (!owner) { replyOk(callback, 'Please provide owner and spender public keys.'); break; }
          // Extract second public key (spender) — find all matches
          const keys = text.match(/0[1-3][0-9a-fA-F]{64,68}/g) || [];
          if (keys.length < 2) { replyOk(callback, 'Please provide both owner and spender public keys.'); break; }
          const spender = keys[1];
          const allowancesURef = await getNamedKeyURef(contractHash, ['allowances', 'allowances_uref', 'allowance']);
          if (!allowancesURef) { replyOk(callback, 'Could not find allowances URef.'); break; }
          const ownerInfo = await getAccountInfo(owner);
          const spenderInfo = await getAccountInfo(spender);
          const ownerHash = (ownerInfo?.account?.account_hash || '').replace(/^account-hash-/, '');
          const spenderHash = (spenderInfo?.account?.account_hash || '').replace(/^account-hash-/, '');
          const result = await getDictionaryItem(allowancesURef, ownerHash + spenderHash);
          const value = parseCLValue(result?.stored_value?.CLValue || result?.stored_value?.cl_value);
          replyOk(callback,
            `🪙 Token Allowance\nContract: ${truncate(contractHash, 40)}\nOwner: ${truncate(owner, 30)}\nSpender: ${truncate(spender, 30)}\nAllowance: ${value}`,
            { contractHash, owner, spender, allowance: value }
          );
          break;
        }

        case 'tokenMetadata': {
          const contractInfo = await getContractInfo(contractHash);
          const namedKeys = contractInfo?.contract?.named_keys || [];
          const nameKey = namedKeys.find((nk: any) => ['name', 'token_name'].includes(nk.name));
          const symbolKey = namedKeys.find((nk: any) => ['symbol', 'token_symbol'].includes(nk.name));
          const decimalsKey = namedKeys.find((nk: any) => ['decimals', 'token_decimals'].includes(nk.name));
          let nameVal = 'N/A', symbolVal = 'N/A', decimalsVal = 'N/A';
          if (nameKey) { try { const r = await queryGlobalState(nameKey.key); nameVal = parseCLValue(r?.stored_value?.CLValue); } catch {} }
          if (symbolKey) { try { const r = await queryGlobalState(symbolKey.key); symbolVal = parseCLValue(r?.stored_value?.CLValue); } catch {} }
          if (decimalsKey) { try { const r = await queryGlobalState(decimalsKey.key); decimalsVal = parseCLValue(r?.stored_value?.CLValue); } catch {} }
          replyOk(callback,
            `🪙 CEP-18 Token Metadata\nContract: ${truncate(contractHash, 40)}\nName: ${nameVal}\nSymbol: ${symbolVal}\nDecimals: ${decimalsVal}`,
            { contractHash, name: nameVal, symbol: symbolVal, decimals: decimalsVal }
          );
          break;
        }

        case 'nftTotalSupply': {
          const uref = await getNamedKeyURef(contractHash, ['total_supply', 'minted_tokens', 'number_of_minted_tokens', 'count']);
          if (!uref) { replyOk(callback, 'Could not find total supply URef.'); break; }
          const result = await queryGlobalState(uref);
          const value = parseCLValue(result?.stored_value?.CLValue);
          replyOk(callback,
            `🖼️ NFT Total Supply\nContract: ${truncate(contractHash, 40)}\nTotal Supply: ${value}`,
            { contractHash, totalSupply: value }
          );
          break;
        }

        case 'nftOwnerOf': {
          const tokenId = extractTokenId(text);
          if (!tokenId) { replyOk(callback, 'Please provide a token ID.'); break; }
          const ownersURef = await getNamedKeyURef(contractHash, ['owners', 'token_owners', 'account_by_id', 'metadata_owners']);
          if (!ownersURef) { replyOk(callback, 'Could not find owners URef.'); break; }
          const result = await getDictionaryItem(ownersURef, tokenId);
          const owner = parseCLValue(result?.stored_value?.CLValue || result?.stored_value?.cl_value);
          replyOk(callback,
            `🖼️ NFT Owner\nContract: ${truncate(contractHash, 40)}\nToken ID: ${tokenId}\nOwner: ${owner}`,
            { contractHash, tokenId, owner }
          );
          break;
        }

        case 'nftTokensOf': {
          const owner = extractPublicKey(text);
          if (!owner || !validatePublicKey(owner)) { replyOk(callback, 'Please provide a valid owner public key.'); break; }
          const ownedURef = await getNamedKeyURef(contractHash, ['owned_tokens', 'account_owned_tokens', 'token_owners_reverse']);
          if (!ownedURef) { replyOk(callback, 'Could not find owned_tokens URef.'); break; }
          const accountInfo = await getAccountInfo(owner);
          const dictKey = (accountInfo?.account?.account_hash || '').replace(/^account-hash-/, '');
          const result = await getDictionaryItem(ownedURef, dictKey);
          const tokens = parseCLValue(result?.stored_value?.CLValue || result?.stored_value?.cl_value);
          replyOk(callback,
            `🖼️ NFT Tokens Owned\nContract: ${truncate(contractHash, 40)}\nOwner: ${truncate(owner, 40)}\nTokens: ${truncate(tokens, 200)}`,
            { contractHash, owner, tokens }
          );
          break;
        }

        case 'nftMetadata': {
          const tokenId = extractTokenId(text);
          if (!tokenId) { replyOk(callback, 'Please provide a token ID.'); break; }
          const metadataURef = await getNamedKeyURef(contractHash, ['metadata', 'token_metadata', 'metadata_by_id', 'cep78_metadata']);
          if (!metadataURef) { replyOk(callback, 'Could not find metadata URef.'); break; }
          const result = await getDictionaryItem(metadataURef, tokenId);
          const metadata = parseCLValue(result?.stored_value?.CLValue || result?.stored_value?.cl_value);
          replyOk(callback,
            `🖼️ NFT Metadata\nContract: ${truncate(contractHash, 40)}\nToken ID: ${tokenId}\nMetadata: ${truncate(metadata, 200)}`,
            { contractHash, tokenId, metadata }
          );
          break;
        }

        case 'nftApproved': {
          const tokenId = extractTokenId(text);
          if (!tokenId) { replyOk(callback, 'Please provide a token ID.'); break; }
          const approvalsURef = await getNamedKeyURef(contractHash, ['approvals', 'token_approvals', 'approved']);
          if (!approvalsURef) { replyOk(callback, 'Could not find approvals URef.'); break; }
          const result = await getDictionaryItem(approvalsURef, tokenId);
          const approved = parseCLValue(result?.stored_value?.CLValue || result?.stored_value?.cl_value);
          replyOk(callback,
            `🖼️ NFT Approved\nContract: ${truncate(contractHash, 40)}\nToken ID: ${tokenId}\nApproved: ${truncate(approved, 100)}`,
            { contractHash, tokenId, approved }
          );
          break;
        }

        case 'nftMaxSupply': {
          const uref = await getNamedKeyURef(contractHash, ['max_supply', 'collection_max_supply', 'max_total_supply']);
          if (!uref) { replyOk(callback, 'Could not find max_supply URef.'); break; }
          const result = await queryGlobalState(uref);
          const value = parseCLValue(result?.stored_value?.CLValue);
          replyOk(callback,
            `🖼️ NFT Max Supply (CEP-78)\nContract: ${truncate(contractHash, 40)}\nMax Supply: ${value}`,
            { contractHash, maxSupply: value }
          );
          break;
        }

        case 'nftBatchOwners': {
          const tokenIdsStr = text.match(/(?:ids?|tokens?)\s*[:=]?\s*([0-9,\s]+)/i);
          if (!tokenIdsStr) { replyOk(callback, 'Please provide comma-separated token IDs.'); break; }
          const tokenIds = tokenIdsStr[1].split(/[,\s]+/).filter((s: string) => /^\d+$/.test(s));
          if (tokenIds.length === 0) { replyOk(callback, 'No valid token IDs found.'); break; }
          const ownersURef = await getNamedKeyURef(contractHash, ['owners', 'token_owners', 'account_by_id']);
          if (!ownersURef) { replyOk(callback, 'Could not find owners URef.'); break; }
          const limitedIds = tokenIds.slice(0, 10);
          const results: { tokenId: string; owner: string }[] = [];
          for (const id of limitedIds) {
            try {
              const r = await getDictionaryItem(ownersURef, id);
              const clValue = r?.stored_value?.CLValue || r?.stored_value?.cl_value;
              results.push({ tokenId: id, owner: parseCLValue(clValue) });
            } catch {
              results.push({ tokenId: id, owner: 'Error/Not Found' });
            }
          }
          const resultsStr = results.map(r => `Token #${r.tokenId}: ${truncate(r.owner, 50)}`).join('\n');
          replyOk(callback,
            `🖼️ NFT Batch Owners (CEP-78)\nContract: ${truncate(contractHash, 40)}\nQueried: ${limitedIds.length} of ${tokenIds.length}\n\n${resultsStr}`,
            { contractHash, results }
          );
          break;
        }
      }
    } catch (error) {
      replyError(callback, 'Token read query failed', error);
    }
  },
  examples: [
    [
      { name: '{{user1}}', content: { text: 'What is the total supply of CEP-18 token at hash abc123...' } },
      { name: '{{agent}}', content: { text: 'Querying CEP-18 total supply...' } },
    ],
    [
      { name: '{{user1}}', content: { text: 'Who owns NFT #42 in contract def456...' } },
      { name: '{{agent}}', content: { text: 'Looking up NFT owner...' } },
    ],
  ],
};
