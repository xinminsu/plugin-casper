# @elizaos/plugin-casper

Casper blockchain plugin for Eliza AI agent framework. This plugin enables AI agents to interact with the Casper blockchain network, including wallet management, token transfers, smart contract deployment, and blockchain data queries.

## Features

- 💰 **Balance Queries**: Check CSPR token balances for any account
- 💸 **Token Transfers**: Send CSPR tokens between accounts
- 📊 **Transaction Status**: Monitor transaction status by deploy hash
- 🔗 **Smart Contracts**: Deploy and call smart contracts (WASM)
- 🌐 **Network Info**: Query latest block and network status

## Installation

```bash
npm install @elizaos/plugin-casper
```

## Configuration

Add the following environment variables to your `.env` file:

```env
# Casper Node URL (testnet or mainnet)
# Use public nodes (no API Key required)
CASPER_NODE_URL=https://rpc.testnet.cspr.cloud:443/rpc
# Or use other public nodes
# CASPER_NODE_URL=https://node.testnet.casperlabs.org:7777/rpc

# Optional: Default wallet configuration
CASPER_PUBLIC_KEY=your_public_key_here
CASPER_PRIVATE_KEY=your_private_key_here
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


```

#### 2. Check Balance

Query the CSPR balance of a Casper account.

**Example:**
```
User: Check balance for 02a1b2c3d4e5f6...
Agent: Let me check the balance...

💰 Balance for 02a1b2c3d4e5f6...:
100.500000000 CSPR
```

#### 3. Transfer Tokens

Send CSPR tokens to another account.

**Example:**
```
User: Send 5 CSPR to 02a1b2c3d4e5f6...
Agent: I'll initiate the transfer...

✅ Transfer initiated!

Amount: 5 CSPR
To: 02a1b2c3d4e5f6...
Deploy Hash: abc123def456...

You can check the transaction status using the deploy hash.
```

#### 4. Check Transaction Status

Monitor the status of a transaction by its deploy hash.

**Example:**
```
User: Check status of deploy abc123def456...
Agent: Let me check the transaction status...

📊 Transaction Status:
Deploy Hash: abc123def456...
Status: { ... }
```

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
