import {
  RpcClient,
  HttpHandler,
  Deploy,
  DeployHeader,
  ExecutableDeployItem,
  TransferDeployItem,
  StoredContractByHash,
  Args,
  CLValue,
  PrivateKey,
  PublicKey,
  KeyAlgorithm,
  Timestamp,
  Duration,
} from 'casper-js-sdk';
import { parseCasperPublicKey } from './utils';

export interface CasperConfig {
  nodeUrl: string;
  chainName?: string;
  apiKey?: string;
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
  private rpcClient: RpcClient;
  private config: CasperConfig;

  constructor(config: CasperConfig) {
    this.config = config;

    const handler = new HttpHandler(config.nodeUrl);
    if (config.apiKey) {
      handler.setCustomHeaders({ Authorization: config.apiKey });
    }
    this.rpcClient = new RpcClient(handler);
  }

  /**
   * 生成新的钱包密钥对
   */
  generateWallet(): WalletInfo {
    const privateKey = PrivateKey.generate(KeyAlgorithm.ED25519);
    const publicKey = privateKey.publicKey;
    const publicKeyHex = publicKey.toHex(false);
    const privateKeyHex = Array.from(privateKey.toBytes())
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('');
    const accountHash = publicKey.accountHash();
    const address = `account-hash-${Buffer.from(accountHash.toBytes()).toString('hex')}`;

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
    const privateKey = PrivateKey.fromHex(privateKeyHex, KeyAlgorithm.ED25519);
    const publicKey = privateKey.publicKey;

    const publicKeyHex = publicKey.toHex(false);
    const accountHash = publicKey.accountHash();
    const address = `account-hash-${Buffer.from(accountHash.toBytes()).toString('hex')}`;

    return {
      publicKey: publicKeyHex,
      privateKey: privateKeyHex,
      address
    };
  }

  /**
   * 查询账户余额
   */
  async getBalance(publicKey: string): Promise<string> {
    try {
      const clPublicKey = parseCasperPublicKey(publicKey);

      // 获取状态根哈希
      const stateRootHash = await this.getStateRootHash();

      if (!stateRootHash) {
        throw new Error('Failed to resolve Casper state root hash from latest block');
      }

      // 获取账户信息以拿到 main purse URef
      const accountInfo = await this.rpcClient.getAccountInfo(null, {
        publicKey: clPublicKey,
      } as any);

      const mainPurse = accountInfo?.account?.mainPurse;
      if (!mainPurse) {
        throw new Error('Account not found or has no main purse');
      }

      // 获取余额
      const balance = await this.rpcClient.getBalanceByStateRootHash(mainPurse.toString(), stateRootHash);

      return (balance.balanceValue as any).toString();
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
      const privateKey = PrivateKey.fromHex(fromPrivateKey, KeyAlgorithm.ED25519);
      const publicKey = privateKey.publicKey;

      // 构建目标公钥
      const targetPublicKey = parseCasperPublicKey(toPublicKey);

      // 构建转账 session
      const transferItem = TransferDeployItem.newTransfer(
        String(amount),
        targetPublicKey,
        null,
        0
      );

      const session = new ExecutableDeployItem();
      session.transfer = transferItem;

      // 构建支付
      const payment = ExecutableDeployItem.standardPayment(String(paymentAmount));

      // 创建 deploy header
      const header = new DeployHeader(
        this.config.chainName || 'casper-test',
        [],
        1,
        new Timestamp(new Date()),
        new Duration(1800000),
        publicKey
      );

      // 创建 deploy
      const deploy = Deploy.makeDeploy(header, payment, session);

      // 签名并发送
      deploy.sign(privateKey);
      const result = await this.rpcClient.putDeploy(deploy);

      return result.deployHash.toString();
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
      const signingKey = PrivateKey.fromHex(privateKey, KeyAlgorithm.ED25519);
      const publicKey = signingKey.publicKey;

      // 构建合约参数
      const argsMap = new Map<string, CLValue>();
      for (const [key, value] of Object.entries(args)) {
        argsMap.set(key, CLValue.newCLString(String(value)));
      }
      const runtimeArgs = new Args(argsMap);

      // 创建 session
      const session = ExecutableDeployItem.newModuleBytes(wasmBytes, runtimeArgs);

      const payment = ExecutableDeployItem.standardPayment(String(paymentAmount));

      const header = new DeployHeader(
        this.config.chainName || 'casper-test',
        [],
        1,
        new Timestamp(new Date()),
        new Duration(1800000),
        publicKey
      );

      const deploy = Deploy.makeDeploy(header, payment, session);
      deploy.sign(signingKey);

      const result = await this.rpcClient.putDeploy(deploy);
      return result.deployHash.toString();
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
      const signingKey = PrivateKey.fromHex(privateKey, KeyAlgorithm.ED25519);
      const publicKey = signingKey.publicKey;

      const argsMap = new Map<string, CLValue>();
      for (const [key, value] of Object.entries(args)) {
        argsMap.set(key, CLValue.newCLString(String(value)));
      }
      const runtimeArgs = new Args(argsMap);

      const contractHashBytes = Buffer.from(contractHash.replace('0x', ''), 'hex');
      const storedContract = new StoredContractByHash(
        contractHashBytes as any,
        entryPoint,
        runtimeArgs
      );

      const session = new ExecutableDeployItem();
      session.storedContractByHash = storedContract;

      const payment = ExecutableDeployItem.standardPayment(String(paymentAmount));

      const header = new DeployHeader(
        this.config.chainName || 'casper-test',
        [],
        1,
        new Timestamp(new Date()),
        new Duration(1800000),
        publicKey
      );

      const deploy = Deploy.makeDeploy(header, payment, session);
      deploy.sign(signingKey);

      const result = await this.rpcClient.putDeploy(deploy);
      return result.deployHash.toString();
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
      const deployInfo = await this.rpcClient.getDeploy(deployHash);
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
      const blockInfo = await this.rpcClient.getLatestBlock();
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
    const result = await this.rpcClient.getStateRootHashLatest();
    return result.stateRootHash?.toString() || '';
  }
}
