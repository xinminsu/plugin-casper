# @elizaos/plugin-casper

Casper blockchain plugin for Eliza AI agent framework. This plugin enables AI agents to interact with the Casper blockchain network, including wallet management, token transfers, smart contract deployment, and blockchain data queries.

## ✨ Features

### 📖 Read Queries (读取查询)

#### 🌐 Network & Blockchain Metadata
- Query node status, network peers, and chainspec
- Query block information by hash or height
- Query deploy/transaction details
- Query block transfers and state root hash

#### 👤 Account, Balance & Gas
- Query CSPR balance for any wallet address (Casper public key, account hash, or Ethereum-style)
- Query account info (associated keys, thresholds, named keys)
- Query purse balance by URef (with full proof details)
- Query global state by key and path

#### 📋 Contract & Dictionary
- Query contract metadata (hash, version, entry points)
- List all callable entry points with argument types
- Query dictionary items by URef, by account, or by contract
- Query stored state items by key and path
- List all named keys of a contract

#### 🪙 CEP-18 / CEP-47 / CEP-78 Tokens
- CEP-18: total supply, balance of, allowance, token metadata (name/symbol/decimals)
- CEP-47/78: total supply, owner of, tokens of owner, metadata, approved spender
- CEP-78: max supply limit, batch owner query

#### ⚖️ Staking & Validators
- Query all active validators for current era
- Query single validator detail (stake, commission rate, delegators)
- Query delegation records for a delegator
- Query full auction state and validator set changes
- Query era summary with reward allocations

#### 🔧 General DApp
- Counter: query current count value
- AMM: pool reserves, LP balance, staking info
- Governance: all proposals, proposal detail, vote record
- RWA: asset record query
- DEX: open orders query

### ✏️ Write Operations (链上写入)

#### 💸 Native CSPR
- Transfer CSPR to another account
- Create temporary purses
- Add/remove associated keys (multi-sig setup)
- Set action thresholds for account security
- Bind named keys for contract/token references

#### 🪙 CEP-18 Fungible Tokens
- Mint / Burn tokens
- Transfer tokens between accounts
- Approve / Increase / Decrease allowance
- Transfer from (approved spender transfers tokens)

#### 🖼️ CEP-47 / CEP-78 NFT
- Mint single NFT / Batch mint copies
- Burn single / Batch burn NFTs
- Transfer / Batch transfer NFTs
- Approve NFT for spender
- Update NFT metadata (CEP-78)
- Set NFT contract admin (CEP-78)

#### ⚖️ Staking / Consensus
- Bond (self-stake to become validator)
- Delegate CSPR to a validator
- Unbond self-staked CSPR
- Undelegate from a validator
- Withdraw staking rewards
- Set validator commission rate

#### 📈 DeFi AMM / Liquidity
- Swap tokens on AMM DEX
- Add / Remove liquidity to pools
- Stake LP tokens for farming rewards
- Claim farming rewards
- Create / Cancel limit orders

#### 🔧 General DApp
- Counter increment / decrement
- Dictionary key-value put / remove
- Governance: Create proposal, cast vote, execute proposal
- RWA asset record saving
- Generic contract call by hash

## Installation

```bash
npm install @elizaos/plugin-casper
```

## Configuration

Add the following environment variables to your `.env` file:

```env
# Casper Node URL (testnet or mainnet)
CASPER_ENABLED=true

CASPER_NODE_URL=https://node.testnet.casper.network/rpc
CASPER_RPC_URL=https://node.testnet.casper.network/rpc

```

### Network URLs

**Testnet Public Nodes:**
- `https://rpc.testnet.cspr.cloud:443/rpc` (Recommended)
- `https://node.testnet.casperlabs.org:7777/rpc`
- `https://testnet.cspr.cloud:443/rpc`

**Mainnet Public Nodes:**
- `https://rpc.cspr.cloud:443/rpc` (Recommended)
- `https://node.mainnet.casperlabs.org:7777/rpc`
- `https://cspr.cloud:443/rpc`

**Note:** Some nodes (such as `node.testnet.cspr.cloud`) may require an API Key. It is recommended to use the public RPC endpoints listed above.

## Usage

### Basic Setup

```typescript
import { casperPlugin } from '@elizaos/plugin-casper';

// Register the plugin with your Eliza agent
const agent = new Agent({
  plugins: [casperPlugin],
  // ... other configuration
});
```

### Available Actions

The plugin registers **14 actions** that AI agents can invoke via natural language:

#### Core Actions

1. **GENERATE_CASPER_WALLET** — Generate a new Casper wallet with public/private key pair
2. **GET_CASPER_BALANCE** — Check CSPR token balance of a Casper account
3. **TRANSFER_CASPER_TOKENS** — Transfer CSPR tokens to another account
4. **GET_DEPLOY_STATUS** — Check transaction status by deploy hash

#### Read Query Actions

5. **CASPER_NETWORK_QUERY** — Query node status, peers, blocks, deploys, era summaries, transfers, state root hash, chainspec, and validator changes
6. **CASPER_ACCOUNT_READ** — Query account info, named keys, purse balance, contract info, entry points, dictionary items, and global state
7. **CASPER_TOKEN_READ** — Query CEP-18 (total supply, balance, allowance, metadata) and CEP-47/78 NFT (owner of, tokens of, metadata, approved, max supply, batch owners)
8. **CASPER_STAKING_READ** — Query era validators, validator details, delegation info, auction state, validator changes, and era summaries
9. **CASPER_DAPP_READ** — Query counter values, AMM reserves/LP balance/stake info, governance proposals/vote records, RWA asset records, and DEX open orders

#### Write Operation Actions

10. **CASPER_NATIVE_WRITE** — Create purses, add/remove associated keys, set action thresholds, put named keys
11. **CASPER_TOKEN_WRITE** — CEP-18 mint/burn/transfer/approve/increase-decrease allowance/transfer-from
12. **CASPER_NFT_WRITE** — CEP-47 mint/burn/transfer/approve + CEP-78 set metadata/batch transfer/batch burn/set admin
13. **CASPER_STAKING_WRITE** — Bond/delegate/unbond/undelegate/withdraw rewards/set commission rate
14. **CASPER_DEFI_WRITE** — AMM swap/add-remove liquidity/stake LP/claim reward, DEX create-cancel order, counter inc/dec, dictionary put/remove, governance proposals, RWA asset records, generic contract calls

### Providers

The plugin includes several providers that automatically provide context:

- **casperNetworkProvider**: Shows current network status
- **casperWalletProvider**: Displays configured wallet information
- **casperGasProvider**: Provides gas fee guidance

## API Reference

### CasperClient

The core client class for interacting with the Casper blockchain.

```typescript
import { CasperClient } from '@elizaos/plugin-casper';

const client = new CasperClient({
  nodeUrl: 'https://node.testnet.cspr.cloud:443',
  chainName: 'casper-net-1'
});
```

#### Methods

##### `generateWallet(): WalletInfo`

Generate a new wallet with key pair.

```typescript
const wallet = client.generateWallet();
console.log(wallet.address);      // Account address
console.log(wallet.publicKey);    // Public key
console.log(wallet.privateKey);   // Private key
```

##### `getBalance(publicKey: string): Promise<string>`

Get account balance in motes (1 CSPR = 1,000,000,000 motes).

```typescript
const balance = await client.getBalance(publicKey);
const csprBalance = parseInt(balance) / 1000000000;
```

##### `transfer(fromPrivateKey, toPublicKey, amount, paymentAmount?): Promise<string>`

Transfer CSPR tokens. Amount should be in motes.

```typescript
const deployHash = await client.transfer(
  privateKey,
  recipientPublicKey,
  5 * 1000000000, // 5 CSPR in motes
  2500000000      // Gas fee in motes
);
```

##### `getDeployStatus(deployHash: string): Promise<any>`

Check transaction status.

```typescript
const status = await client.getDeployStatus(deployHash);
```

##### `getLatestBlock(): Promise<any>`

Get latest block information.

```typescript
const block = await client.getLatestBlock();
```

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run dev
```

### Clean

```bash
npm run clean
```

## Dependencies

- `casper-js-sdk`: Official Casper JavaScript SDK
- `@elizaos/core`: Eliza framework core

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never expose private keys** in client-side code or logs
2. Use environment variables for sensitive data
3. Consider using hardware wallets or secure key storage solutions
4. Always verify transaction details before signing
5. Test on testnet before using mainnet

## Gas Fees

Casper uses a fixed gas price model:

- Standard Transfer: ~2.5 CSPR
- Contract Deployment: ~10 CSPR
- Contract Call: ~2.5 CSPR

Gas fees are relatively stable compared to other networks.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Support

For issues and questions:
- GitHub Issues: [Report a bug](https://github.com/elizaos/plugin-casper/issues)
- Documentation: [Eliza Docs](https://elizaos.github.io/eliza/)
- Casper Docs: [Casper Network](https://docs.casper.network/)

## Acknowledgments

- Built with ❤️ for the Eliza community
- Powered by [Casper Network](https://casper.network/)
- Uses [casper-js-sdk](https://github.com/casper-ecosystem/casper-js-sdk)
