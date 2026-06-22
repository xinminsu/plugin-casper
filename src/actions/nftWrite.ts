import { Action, ActionExample, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { configureCasperServices } from '../config';
import {
  cep47Mint,
  cep47MintCopies,
  cep47Burn,
  cep47Transfer,
  cep47Approve,
  cep47TransferFrom,
  cep78SetTokenMetadata,
  cep78BatchTransfer,
  cep78BatchBurn,
  cep78SetAdmin,
  isSigningKeyConfigured,
} from '../services/casperTransactionService';
import { replyOk, replyError, formatDeployResult } from './common';
import { detectSubcommand, extractPublicKey, extractContractHash, extractTokenId, extractTokenIds, extractInteger } from '../helpers/paramParser';
import { validatePublicKey } from '../helpers/readHelper';

/**
 * NFT write action — handles CEP-47 and CEP-78 NFT operations:
 * mint, mint copies, burn, transfer, approve, transfer from,
 * set metadata, batch transfer, batch burn, set admin.
 */
export const nftWriteAction: Action = {
  name: 'CASPER_NFT_WRITE',
  similes: [
    'CASPER_NFT_MINT',
    'CASPER_NFT_BURN',
    'CASPER_NFT_TRANSFER',
    'CASPER_NFT_APPROVE',
    'CASPER_NFT_SET_METADATA',
    'CASPER_NFT_BATCH_TRANSFER',
    'CASPER_NFT_BATCH_BURN',
    'CASPER_NFT_SET_ADMIN',
  ],
  description:
    'Perform Casper CEP-47/CEP-78 NFT operations: mint, burn, transfer, approve, set metadata, batch transfer, batch burn, set admin',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || '').toLowerCase();
    return [
      'mint nft', 'burn nft', 'transfer nft', 'approve nft',
      'nft metadata', 'batch transfer', 'batch burn', 'set admin',
      'cep-47', 'cep47', 'cep-78', 'cep78',
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
        mint: ['mint nft', 'nft mint'],
        mintCopies: ['mint cop', 'batch mint', 'mint multiple'],
        burn: ['burn nft', 'nft burn'],
        transfer: ['transfer nft', 'nft transfer'],
        approve: ['approve nft', 'nft approve'],
        transferFrom: ['transfer from', 'transfer_from'],
        setMetadata: ['set metadata', 'set_metadata', 'metadata'],
        batchTransfer: ['batch transfer', 'batch_transfer'],
        batchBurn: ['batch burn', 'batch_burn'],
        setAdmin: ['set admin', 'set_admin'],
      }, 'mint');

      const contractHash = extractContractHash(text);
      if (!contractHash) {
        replyOk(callback, 'Please provide a contract hash.');
        return;
      }

      switch (sub) {
        case 'mint': {
          const recipient = extractPublicKey(text);
          const tokenId = extractTokenId(text);
          if (!recipient || !validatePublicKey(recipient)) { replyOk(callback, 'Please provide a valid recipient public key.'); return; }
          if (!tokenId) { replyOk(callback, 'Please provide a token ID.'); return; }
          const { deployHash, result } = await cep47Mint(contractHash, recipient, tokenId);
          const f = formatDeployResult('NFT Mint (CEP-47)', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Recipient: ${recipient.substring(0, 20)}...`, `Token ID: ${tokenId}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'mintCopies': {
          const recipient = extractPublicKey(text);
          const count = extractInteger(text, ['count', 'copies']);
          if (!recipient || !validatePublicKey(recipient)) { replyOk(callback, 'Please provide a valid recipient public key.'); return; }
          if (count === null) { replyOk(callback, 'Please provide a count.'); return; }
          const { deployHash, result } = await cep47MintCopies(contractHash, recipient, count);
          const f = formatDeployResult('NFT Batch Mint (CEP-47)', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Recipient: ${recipient.substring(0, 20)}...`, `Count: ${count}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'burn': {
          const owner = extractPublicKey(text);
          const tokenId = extractTokenId(text);
          if (!owner || !validatePublicKey(owner)) { replyOk(callback, 'Please provide a valid owner public key.'); return; }
          if (!tokenId) { replyOk(callback, 'Please provide a token ID.'); return; }
          const { deployHash, result } = await cep47Burn(contractHash, owner, tokenId);
          const f = formatDeployResult('NFT Burn (CEP-47)', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Owner: ${owner.substring(0, 20)}...`, `Token ID: ${tokenId}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'transfer': {
          const recipient = extractPublicKey(text);
          const tokenId = extractTokenId(text);
          if (!recipient || !validatePublicKey(recipient)) { replyOk(callback, 'Please provide a valid recipient public key.'); return; }
          if (!tokenId) { replyOk(callback, 'Please provide a token ID.'); return; }
          const { deployHash, result } = await cep47Transfer(contractHash, recipient, tokenId);
          const f = formatDeployResult('NFT Transfer (CEP-47)', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Recipient: ${recipient.substring(0, 20)}...`, `Token ID: ${tokenId}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'approve': {
          const spender = extractPublicKey(text);
          const tokenId = extractTokenId(text);
          if (!spender || !validatePublicKey(spender)) { replyOk(callback, 'Please provide a valid spender public key.'); return; }
          if (!tokenId) { replyOk(callback, 'Please provide a token ID.'); return; }
          const { deployHash, result } = await cep47Approve(contractHash, spender, tokenId);
          const f = formatDeployResult('NFT Approve (CEP-47)', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Spender: ${spender.substring(0, 20)}...`, `Token ID: ${tokenId}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'transferFrom': {
          const keys = text.match(/0[1-3][0-9a-fA-F]{64,68}/g) || [];
          if (keys.length < 2) { replyOk(callback, 'Please provide both owner and recipient public keys.'); return; }
          const owner = keys[0]!;
          const recipient = keys[1]!;
          const tokenId = extractTokenId(text);
          if (!tokenId) { replyOk(callback, 'Please provide a token ID.'); return; }
          const { deployHash, result } = await cep47TransferFrom(contractHash, owner, recipient, tokenId);
          const f = formatDeployResult('NFT Transfer From (CEP-47)', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Owner: ${owner.substring(0, 20)}...`, `Recipient: ${recipient.substring(0, 20)}...`, `Token ID: ${tokenId}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'setMetadata': {
          const tokenId = extractTokenId(text);
          if (!tokenId) { replyOk(callback, 'Please provide a token ID.'); return; }
          // Extract metadata key-value from text (e.g., "key: value" or quoted strings)
          const metaMatch = text.match(/(?:metadata|meta)\s*[:=]?\s*["']?([^"':,]+)["']?\s*[:=,]\s*["']?([^"'\n]+)["']?/i);
          if (!metaMatch) { replyOk(callback, 'Please provide metadata key and value (e.g., metadata: key=value).'); return; }
          const metadata: Record<string, string> = { [metaMatch[1].trim()]: metaMatch[2].trim() };
          const { deployHash, result } = await cep78SetTokenMetadata(contractHash, tokenId, metadata);
          const f = formatDeployResult('NFT Set Metadata (CEP-78)', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Token ID: ${tokenId}`, `${metaMatch[1].trim()}: ${metaMatch[2].trim()}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'batchTransfer': {
          const recipient = extractPublicKey(text);
          const tokenIds = extractTokenIds(text);
          if (!recipient || !validatePublicKey(recipient)) { replyOk(callback, 'Please provide a valid recipient public key.'); return; }
          if (tokenIds.length === 0) { replyOk(callback, 'Please provide token IDs (comma-separated).'); return; }
          const { deployHash, result } = await cep78BatchTransfer(contractHash, recipient, tokenIds);
          const f = formatDeployResult('NFT Batch Transfer (CEP-78)', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Recipient: ${recipient.substring(0, 20)}...`, `Token Count: ${tokenIds.length}`, `Token IDs: ${tokenIds.join(', ')}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'batchBurn': {
          const owner = extractPublicKey(text);
          const tokenIds = extractTokenIds(text);
          if (!owner || !validatePublicKey(owner)) { replyOk(callback, 'Please provide a valid owner public key.'); return; }
          if (tokenIds.length === 0) { replyOk(callback, 'Please provide token IDs.'); return; }
          const { deployHash, result } = await cep78BatchBurn(contractHash, owner, tokenIds);
          const f = formatDeployResult('NFT Batch Burn (CEP-78)', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `Owner: ${owner.substring(0, 20)}...`, `Token Count: ${tokenIds.length}`, `Token IDs: ${tokenIds.join(', ')}`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }

        case 'setAdmin': {
          const admin = extractPublicKey(text);
          if (!admin || !validatePublicKey(admin)) { replyOk(callback, 'Please provide a valid admin public key.'); return; }
          const { deployHash, result } = await cep78SetAdmin(contractHash, admin);
          const f = formatDeployResult('NFT Set Admin (CEP-78)', deployHash, result,
            [`Contract: ${contractHash.substring(0, 20)}...`, `New Admin: ${admin.substring(0, 20)}...`]
          );
          replyOk(callback, f.text, f.content);
          break;
        }
      }
    } catch (error) {
      replyError(callback, 'NFT operation failed', error);
    }
  },
  examples: [
    [
      { name: '{{user1}}', content: { text: 'Mint NFT #1 to 02abc... in contract def123...' } },
      { name: '{{agent}}', content: { text: 'Minting NFT...' } },
    ],
  ],
};
