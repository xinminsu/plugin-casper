# Casper Eliza Plugin - Project Structure

## Overview

This is a complete Eliza plugin for interacting with the Casper blockchain network. The plugin enables AI agents to perform wallet operations, token transfers, smart contract interactions, and blockchain queries.

## Directory Structure

```
plugin-casper-qoder/
├── src/                      # Source code
│   ├── index.ts             # Plugin entry point and exports
│   ├── client.ts            # Casper blockchain client implementation
│   ├── actions.ts           # Eliza actions (wallet, transfer, etc.)
│   └── providers.ts         # Eliza providers (network info, balance)
├── examples/                 # Usage examples
│   └── usage-example.ts     # Comprehensive usage examples
├── dist/                     # Compiled JavaScript (generated after build)
├── package.json             # Project metadata and dependencies
├── tsconfig.json            # TypeScript configuration
├── .env.example             # Environment variables template
├── .gitignore               # Git ignore rules
├── README.md                # Full documentation
├── QUICKSTART.md            # Quick start guide
└── LICENSE                  # MIT License
```

## Core Components

### 1. CasperClient (`src/client.ts`)

The main class for interacting with the Casper blockchain.

**Features:**
- Wallet generation and restoration
- Balance queries
- Token transfers
- Smart contract deployment and calls
- Transaction status monitoring
- Block information queries

**Key Methods:**
```typescript
generateWallet(): WalletInfo
getBalance(publicKey: string): Promise<string>
transfer(fromPrivateKey, toPublicKey, amount): Promise<string>
deployContract(privateKey, wasmPath, entryPoint, args): Promise<string>
callContract(privateKey, contractHash, entryPoint, args): Promise<string>
getDeployStatus(deployHash): Promise<any>
getLatestBlock(): Promise<any>
```

### 2. Actions (`src/actions.ts`)

Eliza actions that enable natural language interaction with Casper.

**Available Actions:**
- `GENERATE_CASPER_WALLET` - Create new wallets
- `GET_CASPER_BALANCE` - Check account balances
- `TRANSFER_CASPER_TOKENS` - Send CSPR tokens
- `GET_DEPLOY_STATUS` - Monitor transactions

**Usage Pattern:**
```typescript
// Users can say things like:
"Create a new Casper wallet"
"Check balance for 02abc..."
"Send 5 CSPR to 02def..."
"What's the status of deploy xyz?"
```

### 3. Providers (`src/providers.ts`)

Eliza providers that supply contextual information.

**Available Providers:**
- `casperNetworkProvider` - Network status and info
- `casperWalletProvider` - Wallet balance and details
- `casperGasProvider` - Gas fee guidance

### 4. Plugin Entry (`src/index.ts`)

Exports the plugin configuration and all components.

**Exports:**
- `casperPlugin` - Main plugin object
- `CasperClient` - Client class
- All types and interfaces

## Dependencies

### Production Dependencies
- `casper-js-sdk` (^2.15.4) - Official Casper JavaScript SDK
- `@elizaos/core` (latest) - Eliza framework core (peer dependency)

### Development Dependencies
- `typescript` (^5.3.3) - TypeScript compiler
- `@types/node` (^20.10.0) - Node.js type definitions

## Configuration

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `CASPER_NODE_URL` | No | Casper node RPC URL | Testnet URL |
| `CASPER_PUBLIC_KEY` | No | Default wallet public key | - |
| `CASPER_PRIVATE_KEY` | No | Default wallet private key | - |
| `CASPER_CHAIN_NAME` | No | Chain name identifier | casper-net-1 |

### Network URLs

- **Testnet**: `https://node.testnet.cspr.cloud:443`
- **Mainnet**: `https://node.cspr.cloud:443`

## Build Process

1. **TypeScript Compilation**
   ```bash
   npm run build
   ```
   Compiles `.ts` files from `src/` to `dist/`

2. **Watch Mode**
   ```bash
   npm run dev
   ```
   Auto-rebuilds on file changes

3. **Clean**
   ```bash
   npm run clean
   ```
   Removes compiled output

## Integration Guide

### Step 1: Install
```bash
npm install @elizaos/plugin-casper
```

### Step 2: Configure
Add environment variables to your `.env` file

### Step 3: Import
```typescript
import { casperPlugin } from '@elizaos/plugin-casper';
```

### Step 4: Register
```typescript
const agent = createAgent({
  plugins: [casperPlugin],
  settings: { /* config */ }
});
```

## Security Considerations

⚠️ **Critical Security Points:**

1. **Private Key Management**
   - Never hardcode private keys
   - Use environment variables
   - Consider hardware wallets for production

2. **Transaction Verification**
   - Always verify transaction details before signing
   - Implement confirmation steps for large transfers

3. **Error Handling**
   - All methods include try-catch blocks
   - Errors are properly propagated to the agent

4. **Input Validation**
   - Public keys are validated before use
   - Amounts are checked for validity

## Testing Strategy

### Unit Tests (Recommended Addition)
- Test wallet generation
- Test balance queries
- Test transaction creation
- Test error handling

### Integration Tests (Recommended Addition)
- Test with Casper testnet
- Verify actual transactions
- Test smart contract interactions

### Example Test Cases
```typescript
// Generate wallet and verify structure
const wallet = client.generateWallet();
assert(wallet.address);
assert(wallet.publicKey);
assert(wallet.privateKey);

// Check balance format
const balance = await client.getBalance(publicKey);
assert(typeof balance === 'string');
```

## Extending the Plugin

### Adding New Actions

1. Define the action in `src/actions.ts`:
```typescript
export const myNewAction: Action = {
  name: 'MY_ACTION',
  description: '...',
  handler: async (runtime, message, state, options, callback) => {
    // Implementation
  },
  examples: [...]
};
```

2. Register in `src/index.ts`:
```typescript
actions: [...existingActions, myNewAction]
```

### Adding New Providers

1. Define the provider in `src/providers.ts`:
```typescript
export const myProvider: Provider = {
  get: async (runtime, message, state) => {
    // Return contextual information
  }
};
```

2. Register in `src/index.ts`:
```typescript
providers: [...existingProviders, myProvider]
```

## Performance Considerations

- **Async Operations**: All blockchain calls are asynchronous
- **Error Recovery**: Graceful error handling prevents crashes
- **Rate Limiting**: Consider implementing rate limits for production
- **Caching**: Cache frequently accessed data (balances, block info)

## Future Enhancements

Potential improvements:
- [ ] Add support for CEP-78 token standard
- [ ] Implement event subscription/webhooks
- [ ] Add multi-signature wallet support
- [ ] Support for NFT operations
- [ ] Batch transaction processing
- [ ] Advanced smart contract templates
- [ ] Transaction history tracking
- [ ] Price oracle integration

## Troubleshooting

### Common Issues

1. **Module Not Found**
   - Run `npm install`
   - Check peer dependencies

2. **Connection Errors**
   - Verify node URL
   - Check network connectivity
   - Try alternative nodes

3. **Transaction Failures**
   - Ensure sufficient balance for gas
   - Verify public key format
   - Check chain name matches network

## Contributing

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support & Resources

- 📚 [Casper Documentation](https://docs.casper.network/)
- 🤖 [Eliza Framework](https://elizaos.github.io/eliza/)
- 💬 Community Discord
- 🐛 GitHub Issues

---

Built with ❤️ for the Web3 AI Agent community
