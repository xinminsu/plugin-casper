import { CasperServiceByJsonRPC, DeployUtil, Keys, RuntimeArgs, CLPublicKey } from 'casper-js-sdk';

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
  private client: CasperServiceByJsonRPC;
  private config: CasperConfig;

  constructor(config: CasperConfig) {
    this.config = config;
    this.client = new CasperServiceByJsonRPC(config.nodeUrl);
  }

  /**
   * 生成新的钱包密钥对
   */
  generateWallet(): WalletInfo {
    const keyPair = Keys.Ed25519.new();
    const publicKeyHex = Buffer.from(keyPair.publicKey as any).toString('hex');
    const privateKeyHex = Buffer.from(keyPair.privateKey).toString('hex');
    const accountHash = Buffer.from(keyPair.accountHash()).toString('hex');
    const address = `account-hash-${accountHash}`;

    return {
      publicKey: `02${publicKeyHex}`,
      privateKey: privateKeyHex,
      address
    };
  }

  /**
   * 从私钥恢复钱包
   */
  restoreWallet(privateKeyHex: string): WalletInfo {
    const privateKeyBytes = Buffer.from(privateKeyHex, 'hex');
    const publicKeyBytes = Keys.Ed25519.privateToPublicKey(privateKeyBytes);
    const keyPair = Keys.Ed25519.parseKeyPair(publicKeyBytes, privateKeyBytes);
    
    const publicKey = `02${Buffer.from(keyPair.publicKey as any).toString('hex')}`;
    const accountHash = Buffer.from(keyPair.accountHash()).toString('hex');
    const address = `account-hash-${accountHash}`;

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
      // 移除公钥前缀 (02 or 03)
      const publicKeyHex = publicKey.startsWith('02') || publicKey.startsWith('03') 
        ? publicKey.slice(2) 
        : publicKey;
      
      const publicKeyBytes = Buffer.from(publicKeyHex, 'hex');
      const clPublicKey = CLPublicKey.fromEd25519(publicKeyBytes);
      
      // 获取状态根哈希
      const stateRootHash = await this.getStateRootHash();
      
      // 获取账户余额 URef
      const balanceUref = await this.client.getAccountBalanceUrefByPublicKey(
        stateRootHash,
        clPublicKey
      );
      
      // 获取余额
      const balance = await this.client.getAccountBalance(stateRootHash, balanceUref);
      
      return balance.toString();
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
      // 解析私钥
      const privateKeyBytes = Buffer.from(fromPrivateKey, 'hex');
      const publicKeyBytes = Keys.Ed25519.privateToPublicKey(privateKeyBytes);
      const keyPair = Keys.Ed25519.parseKeyPair(publicKeyBytes, privateKeyBytes);
      
      // 构建目标公钥
      const targetPublicKeyHex = toPublicKey.startsWith('02') || toPublicKey.startsWith('03')
        ? toPublicKey.slice(2)
        : toPublicKey;
      const targetPublicKeyBytes = Buffer.from(targetPublicKeyHex, 'hex');
      const targetCLPublicKey = CLPublicKey.fromEd25519(targetPublicKeyBytes);
      
      // 构建转账 session
      const session = DeployUtil.ExecutableDeployItem.newTransfer(
        amount,
        targetCLPublicKey,
        null,
        0
      );
      
      // 构建支付
      const payment = DeployUtil.standardPayment(paymentAmount);
      
      // 创建 deploy 参数
      const deployParams = new DeployUtil.DeployParams(
        keyPair.publicKey,
        this.config.chainName || 'casper-test',
        1,
        1800000
      );
      
      // 创建 deploy
      const deploy = DeployUtil.makeDeploy(deployParams, session, payment);
      
      // 签名并发送
      const signedDeploy = DeployUtil.signDeploy(deploy, keyPair);
      const result = await this.client.deploy(signedDeploy);
      
      return result.deploy_hash;
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
    wasmBytes: Uint8Array,
    entryPoint: string,
    args: Record<string, any>,
    paymentAmount: number = 10000000000
  ): Promise<string> {
    try {
      const privateKeyBytes = Buffer.from(privateKey, 'hex');
      const publicKeyBytes = Keys.Ed25519.privateToPublicKey(privateKeyBytes);
      const keyPair = Keys.Ed25519.parseKeyPair(publicKeyBytes, privateKeyBytes);
      
      // 构建合约参数
      const runtimeArgs = RuntimeArgs.fromMap(args);
      
      // 创建 session
      const session = DeployUtil.ExecutableDeployItem.newModuleBytes(
        wasmBytes,
        runtimeArgs
      );
      
      const payment = DeployUtil.standardPayment(paymentAmount);
      
      const deployParams = new DeployUtil.DeployParams(
        keyPair.publicKey,
        this.config.chainName || 'casper-test',
        1,
        1800000
      );
      
      const deploy = DeployUtil.makeDeploy(deployParams, session, payment);
      const signedDeploy = DeployUtil.signDeploy(deploy, keyPair);
      
      const result = await this.client.deploy(signedDeploy);
      return result.deploy_hash;
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
      const privateKeyBytes = Buffer.from(privateKey, 'hex');
      const publicKeyBytes = Keys.Ed25519.privateToPublicKey(privateKeyBytes);
      const keyPair = Keys.Ed25519.parseKeyPair(publicKeyBytes, privateKeyBytes);
      
      const runtimeArgs = RuntimeArgs.fromMap(args);
      
      const contractHashBytes = Buffer.from(contractHash.replace('0x', ''), 'hex');
      const session = DeployUtil.ExecutableDeployItem.newStoredContractByHash(
        contractHashBytes,
        entryPoint,
        runtimeArgs
      );
      
      const payment = DeployUtil.standardPayment(paymentAmount);
      
      const deployParams = new DeployUtil.DeployParams(
        keyPair.publicKey,
        this.config.chainName || 'casper-test',
        1,
        1800000
      );
      
      const deploy = DeployUtil.makeDeploy(deployParams, session, payment);
      const signedDeploy = DeployUtil.signDeploy(deploy, keyPair);
      
      const result = await this.client.deploy(signedDeploy);
      return result.deploy_hash;
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
      const blockInfo = await this.client.getLatestBlockInfo();
      return {
        stateRootHash: blockInfo.block?.header.state_root_hash,
        timestamp: blockInfo.block?.header.timestamp,
        height: blockInfo.block?.header.height
      };
    } catch (error) {
      console.error('Error getting latest block:', error);
      throw error;
    }
  }

  /**
   * 获取状态根哈希
   */
  private async getStateRootHash(): Promise<string> {
    const blockInfo = await this.client.getLatestBlockInfo();
    return blockInfo.block?.header.state_root_hash || '';
  }
}
