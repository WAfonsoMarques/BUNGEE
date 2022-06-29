/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-empty-function */
import { Server } from "http";

import { Server as SecureServer } from "https";

import { v4 as uuidv4 } from "uuid";

import { PluginRegistry } from "@hyperledger/cactus-core";

import {
  Configuration,
  ICactusPluginOptions,
} from "@hyperledger/cactus-core-api";

import {
  Logger,
  LoggerProvider,
  LogLevelDesc,
} from "@hyperledger/cactus-common";

import { ICactusApiServerOptions } from "@hyperledger/cactus-cmd-api-server";

import { PluginKeychainMemory } from "@hyperledger/cactus-plugin-keychain-memory";

import {
  // PluginLedgerConnectorFabric,
  DefaultApi as FabricApi,
  RunTransactionRequest as FabricRunTransactionRequest,
  FabricSigningCredential,
  FabricContractInvocationType,
} from "@hyperledger/cactus-plugin-ledger-connector-fabric";

export interface IPluginBUNGEEOptions extends ICactusPluginOptions{
  instanceId: string;
  
  fabricPath?: string;
  fabricSigningCredential?: FabricSigningCredential;
  fabricChannelName?: string;
  fabricContractName?: string;
  // fabricPlugin?: PluginLedgerConnectorFabric;
  fabricAssetID?: string;
  fabricAssetSize?: string;

  logLevel?: LogLevelDesc;
  keychainId?: string;
  keychain?: PluginKeychainMemory;
  apiServerOptions?: ICactusApiServerOptions;
  httpApi?: Server | SecureServer;
  disableSignalHandlers?: true;
}

export class PluginBUNGEE {
  // private readonly ledgerConnector: any;
  
  public fabricApi?: FabricApi;
  public fabricSigningCredential?: FabricSigningCredential;
  public fabricChannelName?: string;
  public fabricContractName?: string;
  public fabricAssetID?: string;
  public fabricAssetSize?: string;
  
  private readonly instanceId: string;
  private readonly className: string;
  private level: LogLevelDesc;
  private logger: Logger;
  public pluginRegistry: PluginRegistry;
  // ledgerConnector: PluginLedgerConnectorFabric
  constructor(public readonly options: IPluginBUNGEEOptions) {
    // this.ledgerConnector = ledgerConnector;
    this.instanceId = uuidv4();
    this.className = "pluginBUNGEE";
    this.level = options.logLevel || "INFO";
    const label = this.getClassName();
    const level = this.level;
    this.logger = LoggerProvider.getOrCreate({ label, level });
    this.pluginRegistry = new PluginRegistry();

    if (options.fabricPath != undefined) this.defineFabricConnection(options);
  }

  public initConnector(): void {}

  public getInstanceId(): string {
    return this.instanceId;
  }

  public getPackageName(): string {
    return `@hyperledger/cactus-plugin-bungee`;
  }

  public getClassName(): string {
    return this.className;
  }

  public async onPluginInit(): Promise<unknown> {
    return;
  }
  
  //Connect to fabric, retrive blocks
  public getBlocks(): void {
    // this.ledgerConnector.getTransactionReceiptByTxID();
    // this.fabricApi?.deployContractGoSourceV1
    this.logger.warn(`Called getBlocks()`);
  }
  
  public generateView(): void {
    this.getBlocks();
    this.logger.warn(`Called generateView()`);
  }
  
  //Must be atomic
  public saveViews(): void {
    this.logger.warn(`Called saveViews()`);
  }

  private defineFabricConnection(options: IPluginBUNGEEOptions): void {
    const fnTag = `${this.className}#defineFabricConnection()`;

    const config = new Configuration({ basePath: options.fabricPath });
    const apiClient = new FabricApi(config);
    this.fabricApi = apiClient;
    const notEnoughFabricParams: boolean =
      options.fabricSigningCredential == undefined ||
      options.fabricChannelName == undefined ||
      options.fabricContractName == undefined ||
      options.fabricAssetID == undefined;
    if (notEnoughFabricParams) {
      throw new Error(
        `${fnTag}, fabric params missing should have: signing credentials, contract name, channel name, asset ID`,
      );
    }
    this.fabricSigningCredential = options.fabricSigningCredential;
    this.fabricChannelName = options.fabricChannelName;
    this.fabricContractName = options.fabricContractName;
    this.fabricAssetID = options.fabricAssetID;
    this.fabricAssetSize = options.fabricAssetSize
      ? options.fabricAssetSize
      : "1";
  }

  async lockFabricAsset(): Promise<string> {
    const fnTag = `${this.className}#lockFabricAsset()`;

    let fabricLockAssetProof = "";

    if (this.fabricApi != undefined) {
      const response = await this.fabricApi.runTransactionV1({
        signingCredential: this.fabricSigningCredential,
        channelName: this.fabricChannelName,
        contractName: this.fabricContractName,
        invocationType: FabricContractInvocationType.Send,
        methodName: "LockAsset",
        params: [this.fabricAssetID],
      } as FabricRunTransactionRequest);

      const receiptLockRes = await this.fabricApi.getTransactionReceiptByTxIDV1(
        {
          signingCredential: this.fabricSigningCredential,
          channelName: this.fabricChannelName,
          contractName: "qscc",
          invocationType: FabricContractInvocationType.Call,
          methodName: "GetBlockByTxID",
          params: [this.fabricChannelName, response.data.transactionId],
        } as FabricRunTransactionRequest,
      );

      this.logger.warn(receiptLockRes.data);
      fabricLockAssetProof = JSON.stringify(receiptLockRes.data);
    }

    this.logger.info(`${fnTag}, proof of the asset lock: ${fabricLockAssetProof}`);

    return fabricLockAssetProof;
  }
}
