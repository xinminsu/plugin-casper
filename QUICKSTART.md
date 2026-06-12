# Quick Start Guide - Casper Eliza Plugin

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Access to Casper network (testnet recommended for development)

## Installation & Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` and add your configuration:

```env
CASPER_NODE_URL=https://node.testnet.cspr.cloud:443
```

### 3. Build the Plugin

```bash
npm run build
```

This will compile TypeScript files and generate JavaScript in the `dist/` directory.

## Integration with Eliza Agent

### Step 1: Import the Plugin

```typescript
import { casperPlugin } from '@suxinmin/plugin-casper';
```

### Step 2: Add to Agent Configuration

```typescript
const agent = createAgent({
  name: 'MyCasperBot',
  plugins: [casperPlugin],
  settings: {
    CASPER_NODE_URL: 'https://node.testnet.cspr.cloud:443'
  }
});
```

### Step 3: Start Using

Your agent can now understand and execute Casper-related commands like:
- "Create a new wallet"
- "Check balance for [public key]"
- "Send 5 CSPR to [address]"
- "Check transaction status"

## Testing

### Test on Casper Testnet

1. Get test tokens from the [Casper Faucet](https://testnet.cspr.live/tools/faucet)
2. Use testnet node URL: `https://node.testnet.cspr.cloud:443`
3. Generate a wallet using the plugin
4. Request test tokens to your wallet address

### Example Commands

Once your agent is running, try these commands:

```
User: Generate a new Casper wallet
User: What's my wallet balance?
User: Send 10 CSPR to 02abc...
User: Check the status of deploy hash xyz...
```

## Development Workflow

### Watch Mode (Auto-rebuild on changes)

```bash
npm run dev
```

### Clean Build

```bash
npm run clean
npm run build
```

## Common Issues

### Issue: Module not found errors

**Solution:** Make sure dependencies are installed:
```bash
npm install
```

### Issue: TypeScript compilation errors

**Solution:** These are expected before installing `@elizaos/core`. The plugin is designed to work as a peer dependency.

### Issue: Cannot connect to Casper node

**Solution:** 
- Verify the node URL is correct
- Check your internet connection
- Try alternative node URLs from [Casper Network docs](https://docs.casper.network/)

## Security Best Practices

1. **Never commit `.env` files** to version control
2. **Use environment variables** for private keys
3. **Test on testnet** before mainnet operations
4. **Verify transactions** before signing
5. **Keep dependencies updated**

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Check out [examples/usage-example.ts](./examples/usage-example.ts) for code examples
- Visit [Casper Documentation](https://docs.casper.network/) for blockchain details
- Explore [Eliza Framework](https://elizaos.github.io/eliza/) for agent development

## Support

- 📖 Documentation: See README.md
- 🐛 Bug Reports: GitHub Issues
- 💬 Questions: Eliza Community Discord

Happy building! 🚀
