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
  Secp256k1Keys,
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
import { Utils } from "./utils";
import { ISignerKeyPair } from "@hyperledger/cactus-common/dist/lib/main/typescript/secp256k1-keys";

export interface IPluginBUNGEEOptions extends ICactusPluginOptions{
  bungeeKeys: ISignerKeyPair
  instanceId: string;
  
  fabricPath?: string;
  fabricSigningCredential?: FabricSigningCredential;
  fabricChannelName?: string;
  fabricContractName?: string;
  // fabricPlugin?: PluginLedgerConnectorFabric;
  fabricAssetID?: string;
  fabricAssetSize?: string;
  fabricConfig?: Configuration;
  fabricApi?: FabricApi;

  logLevel?: LogLevelDesc;
  keychainId?: string;
  keychain?: PluginKeychainMemory;
  apiServerOptions?: ICactusApiServerOptions;
  httpApi?: Server | SecureServer;
  disableSignalHandlers?: true;
}

export class PluginBUNGEE {
  // private readonly ledgerConnector: any;
  private keyPairBungee: Secp256k1Keys;
  private privKeyBungee: string;
  private pubKeyBungee: string;

  private ledgerSnapshot: string[]

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
  constructor(public readonly options: IPluginBUNGEEOptions) {
    this.keyPairBungee = options.bungeeKeys;
    this.instanceId = uuidv4();

    this.className = "pluginBUNGEE";
    this.level = options.logLevel || "INFO";
    const label = this.getClassName();
    const level = this.level;
    this.logger = LoggerProvider.getOrCreate({ label, level });

    this.privKeyBungee = Utils.bufArray2HexStr(options.bungeeKeys.privateKey);
    this.pubKeyBungee = Utils.bufArray2HexStr(options.bungeeKeys.publicKey);

    this.pluginRegistry = new PluginRegistry();
    this.fabricApi = options.fabricApi;

    this.ledgerSnapshot = [];

    if (options.fabricPath != undefined) this.defineFabricConnection(options);
  }

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

  public generateSnapshot(): void {
    this.ledgerSnapshot = [];
    this.logger.info(this.ledgerSnapshot);
  }
  
  //Connect to fabric, retrive blocks
  async getBlocks(): Promise<string> {
    // this.ledgerConnector.getTransactionReceiptByTxID();
    // this.fabricApi?.deployContractGoSourceV1
    this.logger.info(`Called getBlocks()`);
    // const fnTag = `${this.className}#lockFabricAsset()`;

    // let fabricLockAssetProof = "";

    // const txId = await this.fabricLookAsset();
     
    // // this.logger.info(`${fnTag} ${txId}, proof of the asset lock: ${fabricLockAssetProof}`);
    // // this.logger.info(`${fnTag} ${txId}, proof of the asset lock: `);

    const allAssets = await this.getAllAssets();
    
    this.logger.info(`BLOCKS: ----- ${allAssets}`);
    
    // fabricLockAssetProof = await this.fabricGetTxReceiptByTxIDV1(txId);

    // this.logger.info(`${fnTag}, proof of the asset lock: ${fabricLockAssetProof}`);
    
    return "";
    // return fabricLockAssetProof;
  }

  async fabricLookAsset(): Promise<string> {

    const response = await this.fabricApi?.runTransactionV1({
      signingCredential: this.fabricSigningCredential,
      channelName: this.fabricChannelName,
      contractName: this.fabricContractName,
      methodName: "LockAsset",
      invocationType: FabricContractInvocationType.Send,
      params: [this.fabricAssetID],
    } as FabricRunTransactionRequest);

    if (response != undefined){
      return response.data.transactionId;
    }

    return "response undefined";
  }
  
  async fabricGetTxReceiptByTxIDV1(transactionId: string): Promise<string> {
    const receiptLockRes = await this.fabricApi?.getTransactionReceiptByTxIDV1(
      {
        signingCredential: this.fabricSigningCredential,
        channelName: this.fabricChannelName,
        contractName: "qscc",
        invocationType: FabricContractInvocationType.Call,
        methodName: "GetBlockByTxID",
        // params: [this.fabricChannelName, this.fabricAssetID],
        params: [this.fabricChannelName, transactionId],
      } as FabricRunTransactionRequest,
    );
    const headerPlusData = JSON.stringify(receiptLockRes?.headers) +"\nHeader---------data\n" + JSON.stringify(receiptLockRes?.data); 
    return JSON.stringify(headerPlusData);
    // return JSON.stringify(receiptLockRes?.data);
  }

  async getAllAssets(): Promise<string> {

    const response = await this.fabricApi?.runTransactionV1({
      signingCredential: this.fabricSigningCredential,
      channelName: this.fabricChannelName,
      contractName: this.fabricContractName,
      methodName: "GetAllAssets",
      invocationType: FabricContractInvocationType.Call,
      params: [],
    } as FabricRunTransactionRequest);

    if (response != undefined){
      return response.data.functionOutput;
    }

    return "response undefined";
  }
  
  
  public generateView(): void {
    this.getBlocks();
    this.logger.info(`Called generateView()`);
  }
  
  //Must be atomic
  public saveViews(): void {
    this.logger.info(`Called saveViews()`);
  }
  
  private defineFabricConnection(options: IPluginBUNGEEOptions): void {
    
    this.logger.info(`OPTIONS:: ${options}`);
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

  // async lockFabricAsset(): Promise<string> {
  //   const fnTag = `${this.className}#lockFabricAsset()`;

  //   let fabricLockAssetProof = "";

  //   if (this.fabricApi != undefined) {
  //     const response = await this.fabricApi.runTransactionV1({
  //       signingCredential: this.fabricSigningCredential,
  //       channelName: this.fabricChannelName,
  //       contractName: this.fabricContractName,
  //       invocationType: FabricContractInvocationType.Send,
  //       methodName: "LockAsset",
  //       params: [this.fabricAssetID],
  //     } as FabricRunTransactionRequest);

  //     const receiptLockRes = await this.fabricApi.getTransactionReceiptByTxIDV1(
  //       {
  //         signingCredential: this.fabricSigningCredential,
  //         channelName: this.fabricChannelName,
  //         contractName: "qscc",
  //         invocationType: FabricContractInvocationType.Call,
  //         methodName: "GetBlockByTxID",
  //         params: [this.fabricChannelName, response.data.transactionId],
  //       } as FabricRunTransactionRequest,
  //     );

  //     this.logger.warn(receiptLockRes.data);
  //     fabricLockAssetProof = JSON.stringify(receiptLockRes.data);
  //   }

  //   this.logger.info(`${fnTag}, proof of the asset lock: ${fabricLockAssetProof}`);

  //   return fabricLockAssetProof;
  // }
}
