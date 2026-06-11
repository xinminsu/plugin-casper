/**
 * Example usage of the Casper Plugin with Eliza Agent
 * 
 * This example demonstrates how to integrate the Casper blockchain plugin
 * into an Eliza agent configuration.
 */

import { AgentRuntime, createAgent } from '@elizaos/core';
import { casperPlugin } from './src/index';

// Example 1: Basic Setup
async function basicSetup() {
  const agent = createAgent({
    name: 'CasperBot',
    plugins: [casperPlugin],
    settings: {
      CASPER_NODE_URL: 'https://node.testnet.cspr.cloud:443',
      // Optional: Configure default wallet
      // CASPER_PUBLIC_KEY: 'your_public_key',
      // CASPER_PRIVATE_KEY: 'your_private_key'
    }
  });

  console.log('✅ CasperBot agent created successfully!');
  return agent;
}

// Example 2: Using CasperClient directly
async function directClientUsage() {
  const { CasperClient } = await import('./src/client');
  
  const client = new CasperClient({
    nodeUrl: 'https://node.testnet.cspr.cloud:443',
    chainName: 'casper-net-1'
  });

  // Generate a new wallet
  const wallet = client.generateWallet();
  console.log('📍 New Wallet Created:');
  console.log('Address:', wallet.address);
  console.log('Public Key:', wallet.publicKey);
  console.log('Private Key:', wallet.privateKey);

  // Check balance (example)
  try {
    const balance = await client.getBalance(wallet.publicKey);
    const csprBalance = parseInt(balance) / 1000000000;
    console.log(`💰 Balance: ${csprBalance} CSPR`);
  } catch (error) {
    console.log('Balance check failed (expected for new wallet)');
  }
}

// Example 3: Transfer tokens
async function transferExample() {
  const { CasperClient } = await import('./src/client');
  
  const client = new CasperClient({
    nodeUrl: 'https://node.testnet.cspr.cloud:443'
  });

  // Note: In production, use environment variables for private keys
  const privateKey = process.env.CASPER_PRIVATE_KEY;
  const recipientPublicKey = '02a1b2c3d4e5f6...'; // Replace with actual public key
  
  if (!privateKey) {
    console.error('❌ Private key not configured');
    return;
  }

  try {
    const deployHash = await client.transfer(
      privateKey,
      recipientPublicKey,
      5 * 1000000000, // 5 CSPR in motes
      2500000000      // Gas fee
    );
    
    console.log('✅ Transfer initiated!');
    console.log('Deploy Hash:', deployHash);
    
    // Check transaction status
    setTimeout(async () => {
      const status = await client.getDeployStatus(deployHash);
      console.log('Transaction Status:', status);
    }, 5000);
  } catch (error) {
    console.error('❌ Transfer failed:', error);
  }
}

// Example 4: Query network information
async function networkInfoExample() {
  const { CasperClient } = await import('./src/client');
  
  const client = new CasperClient({
    nodeUrl: 'https://node.testnet.cspr.cloud:443'
  });

  try {
    const latestBlock = await client.getLatestBlock();
    console.log('🌐 Casper Network Info:');
    console.log('State Root Hash:', latestBlock.stateRootHash);
    console.log('Timestamp:', latestBlock.timestamp);
  } catch (error) {
    console.error('❌ Failed to fetch network info:', error);
  }
}

// Run examples
async function main() {
  console.log('=== Casper Plugin Examples ===\n');
  
  console.log('1. Basic Agent Setup');
  await basicSetup();
  console.log('\n---\n');
  
  console.log('2. Direct Client Usage');
  await directClientUsage();
  console.log('\n---\n');
  
  console.log('3. Network Information');
  await networkInfoExample();
  console.log('\n---\n');
  
  console.log('4. Transfer Example (requires private key)');
  await transferExample();
}

// Uncomment to run examples
// main().catch(console.error);

export {
  basicSetup,
  directClientUsage,
  transferExample,
  networkInfoExample
};
