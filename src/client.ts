import { Client, DeployUtil, Keys, RuntimeArgs } from 'casper-js-sdk';

export interface CasperConfig {
  nodeUrl: string;
  chainName?: string;
}

export interface WalletInfo {
  publicKey: string;
  privateKey?: string;
  address: string;
}

export class CasperClient {
  private client: Client;
  private config: CasperConfig;

  constructor(config: CasperConfig) {
    this.config = config;
    this.client = new Client(config.nodeUrl);
  }

  /**
   * 生成新的钱包密钥对
   */
  generateWallet(): WalletInfo {
    const keyPair = Keys.Ed25519.new();
    const publicKey = keyPair.publicKey.toHex();
    const privateKey = keyPair.privateKey.toHex();
    const address = keyPair.accountAddress();

    return {
      publicKey,
      privateKey,
      address
    };
  }

  /**
   * 从私钥恢复钱包
   */
  restoreWallet(privateKeyHex: string): WalletInfo {
    const keyPair = Keys.Ed25519.parsePrivateKey(privateKeyHex);
    const publicKey = keyPair.publicKey.toHex();
    const address = keyPair.accountAddress();

    return {
      publicKey,
      privateKey: privateKeyHex,
      address
    };
  }

  /**
   * 查询账户余额
   */
  async getBalance(publicKey: string): Promise<string> {
    try {
      const accountInfo = await this.client.getAccountInfo(publicKey);
      if (accountInfo && accountInfo.data) {
        const balanceUref = accountInfo.data.main_purse;
        const balance = await this.client.getBalanceByUref(balanceUref);
        return balance.toString();
      }
      return '0';
    } catch (error) {
      console.error('Error getting balance:', error);
      throw error;
    }
  }

  /**
   * 发送 CSPR 代币转账
   */
  async transfer(
    fromPrivateKey: string,
    toPublicKey: string,
    amount: number,
    paymentAmount: number = 2500000000
  ): Promise<string> {
    try {
      const keyPair = Keys.Ed25519.parsePrivateKey(fromPrivateKey);
      
      // 构建转账 deploy
      const transferDeploy = DeployUtil.makeTransferDeploy(
        keyPair,
        toPublicKey,
        amount,
        paymentAmount,
        this.config.chainName || 'casper-net-1'
      );

      // 签名并发送
      const signedDeploy = DeployUtil.signDeploy(transferDeploy, keyPair);
      const deployHash = await this.client.putDeploy(signedDeploy);
      
      return deployHash;
    } catch (error) {
      console.error('Error transferring tokens:', error);
      throw error;
    }
  }

  /**
   * 部署智能合约
   */
  async deployContract(
    privateKey: string,
    wasmPath: string,
    entryPoint: string,
    args: Record<string, any>,
    paymentAmount: number = 10000000000
  ): Promise<string> {
    try {
      const keyPair = Keys.Ed25519.parsePrivateKey(privateKey);
      
      // 读取 WASM 字节码
      const wasmBytes = await this.loadWasm(wasmPath);
      
      // 构建合约参数
      const runtimeArgs = RuntimeArgs.fromMap(args);
      
      // 创建 deploy
      const session = DeployUtil.ExecutableDeployItem.newModuleBytes(
        wasmBytes,
        runtimeArgs
      );
      
      const payment = DeployUtil.standardPayment(paymentAmount);
      
      const deployParams = DeployUtil.defaultDeploy({
        chainName: this.config.chainName || 'casper-net-1',
        publicKey: keyPair.publicKey,
        ttl: 1800000, // 30 minutes
      });
      
      const deploy = DeployUtil.makeDeploy(deployParams, session, payment);
      const signedDeploy = DeployUtil.signDeploy(deploy, keyPair);
      
      const deployHash = await this.client.putDeploy(signedDeploy);
      return deployHash;
    } catch (error) {
      console.error('Error deploying contract:', error);
      throw error;
    }
  }

  /**
   * 调用智能合约
   */
  async callContract(
    privateKey: string,
    contractHash: string,
    entryPoint: string,
    args: Record<string, any>,
    paymentAmount: number = 2500000000
  ): Promise<string> {
    try {
      const keyPair = Keys.Ed25519.parsePrivateKey(privateKey);
      
      const runtimeArgs = RuntimeArgs.fromMap(args);
      
      const session = DeployUtil.ExecutableDeployItem.newStoredContractByHash(
        contractHash,
        entryPoint,
        runtimeArgs
      );
      
      const payment = DeployUtil.standardPayment(paymentAmount);
      
      const deployParams = DeployUtil.defaultDeploy({
        chainName: this.config.chainName || 'casper-net-1',
        publicKey: keyPair.publicKey,
        ttl: 1800000,
      });
      
      const deploy = DeployUtil.makeDeploy(deployParams, session, payment);
      const signedDeploy = DeployUtil.signDeploy(deploy, keyPair);
      
      const deployHash = await this.client.putDeploy(signedDeploy);
      return deployHash;
    } catch (error) {
      console.error('Error calling contract:', error);
      throw error;
    }
  }

  /**
   * 查询交易状态
   */
  async getDeployStatus(deployHash: string): Promise<any> {
    try {
      const deployInfo = await this.client.getDeployInfo(deployHash);
      return deployInfo;
    } catch (error) {
      console.error('Error getting deploy status:', error);
      throw error;
    }
  }

  /**
   * 获取最新区块信息
   */
  async getLatestBlock(): Promise<any> {
    try {
      const stateRootHash = await this.client.getStateRootHash();
      return {
        stateRootHash,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting latest block:', error);
      throw error;
    }
  }

  /**
   * 加载 WASM 文件
   */
  private async loadWasm(path: string): Promise<Uint8Array> {
    // 在实际应用中，这里应该从文件系统或 URL 加载
    // 这里简化处理，实际使用时需要实现具体的加载逻辑
    throw new Error('WASM loading not implemented. Please provide WASM bytes directly.');
  }
}
