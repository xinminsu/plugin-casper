import { CasperServiceByJsonRPC, DeployUtil, Keys, RuntimeArgs, CLPublicKey } from 'casper-js-sdk';
import { HTTPTransport } from '@open-rpc/client-js';

export interface CasperConfig {
  nodeUrl: string;
  chainName?: string;
  apiKey?: string;
}

class AuthenticatedCasperRpcClient extends CasperServiceByJsonRPC {
  constructor(url: string, headers: Record<string, string>) {
    super(url);
    const transport = new HTTPTransport(url, { headers });
    this.client.requestManager.transports = [transport];
  }
}

export interface WalletInfo {
  publicKey: string;
  privateKey?: string;
  address: string;
}

interface BlockHeader {
  state_root_hash?: string;
  timestamp?: string;
  height?: number;
}

function extractBlockHeader(blockInfo: any): BlockHeader | null {
  if (blockInfo?.block?.header) {
    return blockInfo.block.header;
  }

  const version2Header = blockInfo?.block_with_signatures?.block?.Version2?.header;
  if (version2Header) {
    return version2Header;
  }

  return null;
}

export class CasperClient {
  private client: CasperServiceByJsonRPC;
  private config: CasperConfig;

  constructor(config: CasperConfig) {
    this.config = config;

    if (config.apiKey) {
      this.client = new AuthenticatedCasperRpcClient(config.nodeUrl, {
        Authorization: config.apiKey,
      });
    } else {
      this.client = new CasperServiceByJsonRPC(config.nodeUrl);
    }
  }

  /**
   * 生成新的钱包密钥对
   */
  generateWallet(): WalletInfo {
    const keyPair = Keys.Ed25519.new();
    // publicKey 是 CLPublicKey 类型，使用 toHex() 方法
    const publicKeyHex = keyPair.publicKey.toHex(false); // false 表示不使用校验和
    // privateKey 是 Uint8Array，转换为 hex 字符串
    const privateKeyHex = Array.from(keyPair.privateKey)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const accountHash = keyPair.accountHex(false);
    const address = `account-hash-${accountHash}`;

    return {
      publicKey: publicKeyHex,
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
    
    const publicKey = keyPair.publicKey.toHex(false);
    const accountHash = keyPair.accountHex(false);
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
      const header = extractBlockHeader(blockInfo);
      return {
        stateRootHash: header?.state_root_hash,
        timestamp: header?.timestamp,
        height: header?.height,
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
    return extractBlockHeader(blockInfo)?.state_root_hash || '';
  }
}
