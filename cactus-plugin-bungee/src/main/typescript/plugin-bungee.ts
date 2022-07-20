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
  IJsObjectSignerOptions,
  JsObjectSigner,
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
import { State } from "./state";

export interface IPluginBUNGEEOptions extends ICactusPluginOptions{
  bungeeKeys: ISignerKeyPair
  instanceId: string;
  participant: string;

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
  private bungeeSigner: JsObjectSigner;
  // private keyPairBungee: Secp256k1Keys;
  private privKeyBungee: string;
  private pubKeyBungee: string;

  private participant;

  private ledgerAssetsKey: string[];
  // private ledgerSnapShots: Map<string, Snapshot>; //Key, snapshot
  private ledgerStates: Map<string, State>; //Key, state
  private states: State[];

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
    // this.keyPairBungee = options.bungeeKeys;
    const keyPairBungee = options.bungeeKeys? options.bungeeKeys: Secp256k1Keys.generateKeyPairsBuffer();
  
    this.pubKeyBungee = Utils.bufArray2HexStr(keyPairBungee.publicKey);
    this.privKeyBungee = Utils.bufArray2HexStr(keyPairBungee.privateKey);
    
    const bungeeSignerOptions: IJsObjectSignerOptions = {
      privateKey: this.privKeyBungee,
      logLevel: "debug",
    };
    this.bungeeSigner = new JsObjectSigner(bungeeSignerOptions);

    this.instanceId = uuidv4();
    this.participant = options.participant;

    this.className = "pluginBUNGEE";
    this.level = options.logLevel || "INFO";
    const label = this.getClassName();
    const level = this.level;
    this.logger = LoggerProvider.getOrCreate({ label, level });

    this.privKeyBungee = Utils.bufArray2HexStr(options.bungeeKeys.privateKey);
    this.pubKeyBungee = Utils.bufArray2HexStr(options.bungeeKeys.publicKey);

    this.ledgerAssetsKey = [];
    // this.txForKey = new Map<string, Transaction[]>();
    // this.txEndorsement = new Map<string, Endorsement[]>();
    // this.ledgerSnapShots = new Map<string, Snapshot>();
    this.ledgerStates = new Map<string, State>();
    this.states = [];

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

  sign(msg: string): Uint8Array {
    return this.bungeeSigner.sign(msg);
  }

  public async generateLedgerStates(): Promise<string> {
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

      // this.txForKey.set(assetKey, txs); 
      
      //For each tx get receipt
      for(const tx of txs){
        const endorsements: Endorsement[] = [];
        const receipt = JSON.parse(await this.fabricGetTxReceiptByTxIDV1(tx.getId()));
        // Checks if tx was made by participant
        if(receipt.transactionCreator.mspid != this.participant){
          continue;
        }
        
        assetValues.push(JSON.parse(receipt.rwsetWriteData).Value.toString());
        //Save endorsements of tx
        for (const endorsement of  receipt.transactionEndorsement) {
          endorsements.push(new Endorsement(endorsement.mspid, endorsement.endorserID, endorsement.signature));
        }
        tx.defineTxEndorsements(endorsements);
        txWithTimeS.push(tx);
        // txEndorsement.set(tx.getId(), endorsements);
      }
      
      // this.ledgerSnapShots.set(assetKey, new Snapshot(assetKey, assetValues, txWithTimeS));
      const state = new State(assetKey, assetValues, txWithTimeS);
      this.ledgerStates.set(assetKey, state);//Might delete
      this.states.push(state);

    }
    
    this.logger.info(` --------------- STATES ---------------`);
    this.ledgerStates.forEach((state: State, keyId: string) => {
      console.log(keyId, state);
      const assetState = this.ledgerStates.get(keyId);
      if(assetState != undefined) {
        this.logger.info(assetState);
        this.logger.info(JSON.parse(assetState.getStateJson()));
        
      }
    }); 
    this.logger.info(` --------------- END STATES ---------------`);

    return "";   
  }

  public generateSnapshot(): Snapshot {
    const snapShotId = uuidv4();
    const snapshot = new Snapshot(snapShotId, this.participant, this.states);
    this.logger.info(` --------------- SNAPSHOT ---------------`);
    this.logger.info(snapshot.getSnapShotJson());
    return snapshot;
  }
  
  // public generateView(ti: string, tf: string, snapshots: Snapshot[]): string{
  // public generateView(): string{
  //   this.logger.info(`<><><><>GENERATEVIEW()<><><><>`);
  //   const car1 = this.ledgerSnapShots.get("CAR1");
  //   const car2 = this.ledgerSnapShots.get("CAR2");
  //   const car3 = this.ledgerSnapShots.get("CAR3");

  //   if(car1 != undefined && car2 != undefined && car3 != undefined) {
  //     const tI = car2.getTimeForTxN(2); 
  //     const tF = car2.getTimeForTxN(1); 
  //     this.logger.info(`TEMPO INICIAL = ${tI}`);
  //     this.logger.info(`TEMPO FINAL = ${tF}`);
  
  //     this.logger.info(`car1 time`);
  //     this.logger.info(car1.getInitialTime());
  //     this.logger.info(car1.getTimeForTxN(1));
  //     this.logger.info(car1.getFinalTime());
  
  //     this.logger.info(`car2 time`);
  //     this.logger.info(car2.getInitialTime());
  //     this.logger.info(car2.getTimeForTxN(1));
  //     this.logger.info(car2.getFinalTime());
      
  //     this.logger.info(`car3time`);
  //     this.logger.info(car3.getInitialTime());
  //     this.logger.info(car3.getFinalTime());
  
  //     car1.pruneSnapShot(tI, tF);
  //     car2.pruneSnapShot(tI, tF);
  //     car3.pruneSnapShot(tI, tF);

  //     this.logger.info(JSON.parse(car1.getSnapshotJson()));
  //     const signature1 = Utils.bufArray2HexStr(this.sign(car1.getSnapshotJson()));
  //     this.logger.info(`SIGNATURE1: ${signature1}`);
  //     this.logger.info({Snapshot: car1.getSnapshotJson(), Signature: signature1});

  //     this.logger.info(JSON.parse(car2.getSnapshotJson()));
  //     const signature2 = Utils.bufArray2HexStr(this.sign(car2.getSnapshotJson()));
  //     this.logger.info(`SIGNATURE2: ${signature2}`);
  //     this.logger.info({Snapshot: car2.getSnapshotJson(), Signature: signature2});

  //     this.logger.info(JSON.parse(car3.getSnapshotJson()));
  //     const signature3 = Utils.bufArray2HexStr(this.sign(car3.getSnapshotJson()));
  //     this.logger.info(`SIGNATURE3: ${signature3}`);
  //     this.logger.info(signature3);

  //     this.logger.info({Snapshot: car3.getSnapshotJson(), Signature: signature3});
      
  //   }

  //   return "";
  // }


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
