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
import { Snapshot } from "./snapshot";
import { Transaction } from "./transaction";
import { Endorsement } from "./endorsement";

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

  private ledgerAssetsKey: string[];
  private txForKey: Map<string, Transaction[]>;
  // private txEndorsement: Map<string, Endorsement[]>;//Perguntar ao rafael //txId, txEndorsements
  private ledgerSnapShots: Map<string, Snapshot>; //Key, snapshot


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

    this.ledgerAssetsKey = [];
    this.txForKey = new Map<string, Transaction[]>();
    // this.txEndorsement = new Map<string, Endorsement[]>();
    this.ledgerSnapShots = new Map<string, Snapshot>();
    

    this.pluginRegistry = new PluginRegistry();
    this.fabricApi = options.fabricApi;


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

  public async generateLedgerSnapshot(): Promise<string> {
    this.logger.info(`Generating ledger snapshot`);
    
    const assetsKey = await this.getAllAssetsKey();
    this.ledgerAssetsKey = assetsKey.split(",");//Car1 Car2
    
    //For each key in ledgerAssetsKey
    for(const assetKey of this.ledgerAssetsKey){
      // eslint-disable-next-line prefer-const
      // let txEndorsement = new Map<string, Endorsement[]>();
      // eslint-disable-next-line prefer-const
      let assetValues: string[] = [];
      // eslint-disable-next-line prefer-const
      let txWithTimeS: Transaction[] = [];

      this.logger.info(assetKey);
      const txs = await this.getAllTxByKey(assetKey);

      this.txForKey.set(assetKey, txs); 
      
      //For each tx get receipt
      for(const tx of txs){
        const endorsements: Endorsement[] = [];
        const receipt = JSON.parse(await this.fabricGetTxReceiptByTxIDV1(tx.getId()));
        
        assetValues.push(JSON.parse(receipt.rwsetWriteData).Value.toString());
        //Save endorsements of tx
        for (const endorsement of  receipt.transactionEndorsement) {
          endorsements.push(new Endorsement(endorsement.mspid, endorsement.endorserID, endorsement.signature));
        }
        tx.defineTxEndorsements(endorsements);
        txWithTimeS.push(tx);
        // txEndorsement.set(tx.getId(), endorsements);
      }
      
      this.ledgerSnapShots.set(assetKey, new Snapshot(assetKey, assetValues, txWithTimeS));
    }
    
    
    this.logger.info(` --------------- SNAPSHOT ---------------`);
    const car1 = this.ledgerSnapShots.get("CAR1");
    const car2 = this.ledgerSnapShots.get("CAR2");
    this.logger.info(car1);
    this.logger.info(car2);
    this.logger.info(` --------------- END SNAPSHOT ---------------`);
  
    this.logger.info(` --------------- SNAPSHOT V1---------------`);
    this.logger.info(car1?.getSnapshotJson());
    this.logger.info(car2?.getSnapshotJson());
    this.logger.info(` --------------- END SNAPSHOT V1---------------`);

    this.logger.info(` --------------- SNAPSHOT V2---------------`);
    if (car1 != undefined){
      this.logger.info(JSON.parse(car1.getSnapshotJson()));
      
    }
    if (car2 != undefined){
      this.logger.info(JSON.parse(car2.getSnapshotJson()));
      
    }
    this.logger.info(` --------------- END SNAPSHOT V2---------------`);
  

  //   for (const key in this.ledgerSnapShots) {
  //     const snap = this.ledgerSnapShots[key];
  //     this.logger.info(` --------------- SNAPSHOT ---------------`);
  //     this.logger.info(snap.printSnapshot());
      
  // } 

    return "";   
  }
  
  public generateView(ti: string, tf: string, snapshots: Snapshot[]): string{
    return "";
  }

  //Connect to fabric, retrive blocks
  async getBlocks(): Promise<string> {

    // this.ledgerConnector.getTransactionReceiptByTxID();
    // this.fabricApi?.deployContractGoSourceV1
    this.logger.info(`Called getBlocks()`);
    // const fnTag = `${this.className}#lockFabricAsset()`;

    // let fabricLockAssetProof = "";
     
    // // this.logger.info(`${fnTag} ${txId}, proof of the asset lock: ${fabricLockAssetProof}`);
    // // this.logger.info(`${fnTag} ${txId}, proof of the asset lock: `);
    
    this.logger.info(`-------------------------------------BEGIN TX------------------------------------`);
    const keysString = await this.getAllAssetsKey();
    const keys = keysString.split(",");
    this.logger.info(keys.toString());
    // eslint-disable-next-line prefer-const
    let transactionsRawByKey: string[] = [];
    
    for (const key of keys) {
      const allTxByKey = await this.getAllTxByKeyString(key);
      transactionsRawByKey.push(allTxByKey);
      this.logger.info(allTxByKey);
    }

    this.logger.info(`transactionsRawByKey -> ${transactionsRawByKey}`);
    
    for (const txsByKey of transactionsRawByKey) {
      this.logger.info(`txsByKey -> ${txsByKey}`);
    
      for(const tx of JSON.parse(txsByKey)) {
        tx.timestamp;
        this.logger.info("--- Estou a passar esta transacao ---");
        this.logger.info(tx);


        this.logger.info("--- Passing to RECEIPT begin ---");
        this.logger.info(tx.value.txId);
        this.logger.info("--- Passing to RECEIPT end ---");

        //GET transaction receipt
        const receipt = await this.fabricGetTxReceiptByTxIDV1(tx.value.txId);
        
        this.logger.info("--- RECEIPT begin ---");
        // const txEndorsement = JSON.parse(receipt).transactionEndorsement;
        this.logger.info(receipt);
        this.logger.info("--- RECEIPT end ---");
        // const snapshot = new Snapshot();
        // this.snapShots.set(tx.value.txId, );
      }

    }

    
    // this.logger.info(allTx); 
    this.logger.info(`--------------------------------------END--------------------------------------`);
    // fabricLockAssetProof = await this.fabricGetTxReceiptByTxIDV1(txId);

    // this.logger.info(`${fnTag}, proof of the asset lock: ${fabricLockAssetProof}`);
    
    return "";
    // return fabricLockAssetProof;
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

    return JSON.stringify(receiptLockRes?.data);
  }
  

  async getAllAssetsKey(): Promise<string> {

    const response = await this.fabricApi?.runTransactionV1({
      signingCredential: this.fabricSigningCredential,
      channelName: this.fabricChannelName,
      contractName: this.fabricContractName,
      methodName: "GetAllAssetsKey",
      invocationType: FabricContractInvocationType.Call,
      params: [],
    } as FabricRunTransactionRequest);

    if (response != undefined){
      return response.data.functionOutput;
    }

    return "response undefined";
  }

  async getAllTxByKey(key: string): Promise<Transaction[]> {

    const response = await this.fabricApi?.runTransactionV1({
      signingCredential: this.fabricSigningCredential,
      channelName: this.fabricChannelName,
      contractName: this.fabricContractName,
      methodName: "GetAllTxByKey",
      invocationType: FabricContractInvocationType.Call,
      params: [key],
    } as FabricRunTransactionRequest);

    if (response != undefined){
      
      return Utils.txsStringToTxs(response.data.functionOutput);
    }

    return [];
  }

  async getAllTxByKeyString(key: string): Promise<string> {

    const response = await this.fabricApi?.runTransactionV1({
      signingCredential: this.fabricSigningCredential,
      channelName: this.fabricChannelName,
      contractName: this.fabricContractName,
      methodName: "GetAllTxByKey",
      invocationType: FabricContractInvocationType.Call,
      params: [key],
    } as FabricRunTransactionRequest);

    if (response != undefined){
      
      return response.data.functionOutput;
    }

    return "";
  }

  
  // public generateView(): void {
  //   this.getBlocks();
  //   this.logger.info(`Called generateView()`);
  // }
  
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
