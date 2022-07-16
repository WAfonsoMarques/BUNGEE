import "jest-extended";

import {
  Containers,
  FabricTestLedgerV1,
  pruneDockerAllIfGithubAction,
} from "@hyperledger/cactus-test-tooling";

import http, { Server } from "http";
import fs from "fs-extra";
import { AddressInfo } from "net";

import {
  IListenOptions,
  LoggerProvider,
  LogLevelDesc,
  Secp256k1Keys,
  Servers,
} from "@hyperledger/cactus-common";
import { Configuration } from "@hyperledger/cactus-core-api";
import { PluginKeychainMemory } from "@hyperledger/cactus-plugin-keychain-memory";
import { PluginRegistry } from "@hyperledger/cactus-core";
import { DiscoveryOptions } from "fabric-network";

import {
  ChainCodeProgrammingLanguage,
  DefaultEventHandlerStrategy,
  FabricContractInvocationType,
  FileBase64,
  IPluginLedgerConnectorFabricOptions,
  PluginLedgerConnectorFabric,
  DefaultApi as FabricApi,
  FabricSigningCredential,
} from "@hyperledger/cactus-plugin-ledger-connector-fabric";

import express from "express";
import bodyParser from "body-parser";

import { v4 as uuidv4 } from "uuid";
import path from "path";
import {
  IPluginBUNGEEOptions,
  PluginBUNGEE,
} from "../../../main/typescript/plugin-bungee";

// import { Secp256k1Keys } from "@hyperledger/cactus-common";
// import { config } from "process";

const logLevel: LogLevelDesc = "TRACE";

const log = LoggerProvider.getOrCreate({
  level: "INFO",
  label: "pluginBUNGEE",
});

let fabricLedger: FabricTestLedgerV1;
let fabricContractName: string;
let fabricChannelName: string;
let fabricPath: string;
let fabricConnector: PluginLedgerConnectorFabric;
let fabricServer: Server;
let fabricSigningCredential: FabricSigningCredential;
const FABRIC_ASSET_ID = uuidv4();
let configFabric: Configuration;
let apiClient: FabricApi;

let pluginBungeeOptions: IPluginBUNGEEOptions;
let pluginBungee: PluginBUNGEE;
beforeAll(async () => {
  pruneDockerAllIfGithubAction({ logLevel })
    .then(() => {
      log.info("Pruning throw OK");
    })
    .catch(async () => {
      await Containers.logDiagnostics({ logLevel });
      fail("Pruning didn't throw OK");
    });
  {
    // Fabric ledger connection
    const channelId = "mychannel";
    fabricChannelName = channelId;

    fabricLedger = new FabricTestLedgerV1({
      emitContainerLogs: true,
      publishAllPorts: true,
      imageName: "ghcr.io/hyperledger/cactus-fabric2-all-in-one",
      envVars: new Map([["FABRIC_VERSION", "2.2.0"]]),
      logLevel,
    });

    await fabricLedger.start();

    const connectionProfile = await fabricLedger.getConnectionProfileOrg1();
    expect(connectionProfile).not.toBeUndefined();

    const enrollAdminOut = await fabricLedger.enrollAdmin();
    const adminWallet = enrollAdminOut[1];
    const [userIdentity] = await fabricLedger.enrollUser(adminWallet);
    const sshConfig = await fabricLedger.getSshConfig();

    const keychainInstanceId = uuidv4();
    const keychainId = uuidv4();
    const keychainEntryKey = "user2";
    const keychainEntryValue = JSON.stringify(userIdentity);

    const keychainPlugin = new PluginKeychainMemory({
      instanceId: keychainInstanceId,
      keychainId,
      logLevel,
      backend: new Map([
        [keychainEntryKey, keychainEntryValue],
        ["some-other-entry-key", "some-other-entry-value"],
      ]),
    });

    const pluginRegistry = new PluginRegistry({ plugins: [keychainPlugin] });

    const discoveryOptions: DiscoveryOptions = {
      enabled: true,
      asLocalhost: true,
    };

    // This is the directory structure of the Fabirc 2.x CLI container (fabric-tools image)
    // const orgCfgDir = "/fabric-samples/test-network/organizations/";
    const orgCfgDir =
      "/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/";

    // these below mirror how the fabric-samples sets up the configuration
    const org1Env = {
      CORE_LOGGING_LEVEL: "debug",
      FABRIC_LOGGING_SPEC: "debug",
      CORE_PEER_LOCALMSPID: "Org1MSP",

      ORDERER_CA: `${orgCfgDir}ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem`,

      FABRIC_CFG_PATH: "/etc/hyperledger/fabric",
      CORE_PEER_TLS_ENABLED: "true",
      CORE_PEER_TLS_ROOTCERT_FILE: `${orgCfgDir}peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt`,
      CORE_PEER_MSPCONFIGPATH: `${orgCfgDir}peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp`,
      CORE_PEER_ADDRESS: "peer0.org1.example.com:7051",
      ORDERER_TLS_ROOTCERT_FILE: `${orgCfgDir}ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem`,
    };

    // these below mirror how the fabric-samples sets up the configuration
    const org2Env = {
      CORE_LOGGING_LEVEL: "debug",
      FABRIC_LOGGING_SPEC: "debug",
      CORE_PEER_LOCALMSPID: "Org2MSP",

      FABRIC_CFG_PATH: "/etc/hyperledger/fabric",
      CORE_PEER_TLS_ENABLED: "true",
      ORDERER_CA: `${orgCfgDir}ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem`,

      CORE_PEER_ADDRESS: "peer0.org2.example.com:9051",
      CORE_PEER_MSPCONFIGPATH: `${orgCfgDir}peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp`,
      CORE_PEER_TLS_ROOTCERT_FILE: `${orgCfgDir}peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt`,
      ORDERER_TLS_ROOTCERT_FILE: `${orgCfgDir}ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem`,
    };

    const pluginOptions: IPluginLedgerConnectorFabricOptions = {
      instanceId: uuidv4(),
      dockerBinary: "/usr/local/bin/docker",
      peerBinary: "/fabric-samples/bin/peer",
      goBinary: "/usr/local/go/bin/go",
      pluginRegistry,
      cliContainerEnv: org1Env,
      sshConfig,
      logLevel,
      connectionProfile,
      discoveryOptions,
      eventHandlerOptions: {
        strategy: DefaultEventHandlerStrategy.NetworkScopeAllfortx,
        commitTimeout: 300,
      },
    };

    fabricConnector = new PluginLedgerConnectorFabric(pluginOptions);

    const expressApp = express();
    expressApp.use(bodyParser.json({ limit: "250mb" }));
    fabricServer = http.createServer(expressApp);
    const listenOptions: IListenOptions = {
      hostname: "localhost",
      port: 3000,
      server: fabricServer,
    };
    const addressInfo = (await Servers.listen(listenOptions)) as AddressInfo;
    const { address, port } = addressInfo;

    await fabricConnector.getOrCreateWebServices();
    await fabricConnector.registerWebServices(expressApp);

    const apiUrl = `http://${address}:${port}`;
    fabricPath = apiUrl;
    configFabric = new Configuration({ basePath: apiUrl });

    apiClient = new FabricApi(configFabric);

    fabricContractName = "basic-asset-transfer-2";
    const contractRelPath =
      "../fabric-contracts/simple-asset/chaincode-typescript";
    const contractDir = path.join(__dirname, contractRelPath);

    // ├── package.json
    // ├── src
    // │   ├── assetTransfer.ts
    // │   ├── asset.ts
    // │   └── index.ts
    // ├── tsconfig.json
    const sourceFiles: FileBase64[] = [];
    // {
    //   const filename = "./tslint.json";
    //   const relativePath = "./";
    //   const filePath = path.join(contractDir, relativePath, filename);
    //   const buffer = await fs.readFile(filePath);
    //   sourceFiles.push({
    //     body: buffer.toString("base64"),
    //     filepath: relativePath,
    //     filename,
    //   });
    // }
    {
      const filename = "./tsconfig.json";
      const relativePath = "./";
      const filePath = path.join(contractDir, relativePath, filename);
      const buffer = await fs.readFile(filePath);
      sourceFiles.push({
        body: buffer.toString("base64"),
        filepath: relativePath,
        filename,
      });
    }
    {
      const filename = "./package.json";
      const relativePath = "./";
      const filePath = path.join(contractDir, relativePath, filename);
      const buffer = await fs.readFile(filePath);
      sourceFiles.push({
        body: buffer.toString("base64"),
        filepath: relativePath,
        filename,
      });
    }
    {
      const filename = "./index.ts";
      const relativePath = "./src/";
      const filePath = path.join(contractDir, relativePath, filename);
      const buffer = await fs.readFile(filePath);
      sourceFiles.push({
        body: buffer.toString("base64"),
        filepath: relativePath,
        filename,
      });
    }
    {
      const filename = "./asset.ts";
      const relativePath = "./src/";
      const filePath = path.join(contractDir, relativePath, filename);
      const buffer = await fs.readFile(filePath);
      sourceFiles.push({
        body: buffer.toString("base64"),
        filepath: relativePath,
        filename,
      });
    }
    {
      const filename = "./assetTransfer.ts";
      const relativePath = "./src/";
      const filePath = path.join(contractDir, relativePath, filename);
      const buffer = await fs.readFile(filePath);
      sourceFiles.push({
        body: buffer.toString("base64"),
        filepath: relativePath,
        filename,
      });
    }

    const response = await apiClient.deployContractV1({
      channelId,
      ccVersion: "1.0.0",
      sourceFiles,
      ccName: fabricContractName,
      targetOrganizations: [org1Env, org2Env],
      caFile: `${orgCfgDir}ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem`,
      ccLabel: "basic-asset-transfer-2",
      ccLang: ChainCodeProgrammingLanguage.Typescript,
      ccSequence: 1,
      orderer: "orderer.example.com:7050",
      ordererTLSHostnameOverride: "orderer.example.com",
      connTimeout: 60,
    });

    const { packageIds, lifecycle, success } = response.data;
    expect(response.status).toBe(200);
    expect(success).toBe(true);
    expect(lifecycle).not.toBeUndefined();

    const {
      approveForMyOrgList,
      installList,
      queryInstalledList,
      commit,
      packaging,
      queryCommitted,
    } = lifecycle;

    expect(packageIds).toBeTruthy();
    expect(packageIds).toBeArray();

    expect(approveForMyOrgList).toBeTruthy();
    expect(approveForMyOrgList).toBeArray();

    expect(installList).toBeTruthy();
    expect(installList).toBeArray();

    expect(queryInstalledList).toBeTruthy();
    expect(queryInstalledList).toBeArray();

    expect(commit).toBeTruthy();
    expect(packaging).toBeTruthy();
    expect(queryCommitted).toBeTruthy();

    // FIXME - without this wait it randomly fails with an error claiming that
    // the endorsement was impossible to be obtained. The fabric-samples script
    // does the same thing, it just waits 10 seconds for good measure so there
    // might not be a way for us to avoid doing this, but if there is a way we
    // absolutely should not have timeouts like this, anywhere...
    await new Promise((resolve) => setTimeout(resolve, 10000));

    fabricSigningCredential = {
      keychainId,
      keychainRef: keychainEntryKey,
    };

    const createResponse = await apiClient.runTransactionV1({
      contractName: fabricContractName,
      channelName: fabricChannelName,
      params: ["CAR1", "10"],
      // params: [assetId, "Green", "19", assetOwner, "9999"],
      methodName: "CreateAsset",
      invocationType: FabricContractInvocationType.Send,
      signingCredential: fabricSigningCredential,
    });

    // const createResponse = await apiClient.runTransactionV1({
    //   contractName: fabricContractName,
    //   channelName: fabricChannelName,
    //   //params: [],
    //   params: [FABRIC_ASSET_ID, "19"],
    //   // params: [assetId, "Green", "19", assetOwner, "9999"],
    //   methodName: "CreateAsset",
    //   invocationType: FabricContractInvocationType.Send,
    //   signingCredential: fabricSigningCredential,
    // });

    expect(createResponse).not.toBeUndefined();
    expect(createResponse.status).toBeGreaterThan(199);
    expect(createResponse.status).toBeLessThan(300);

    log.info(
      `BassicAssetTransfer.Create(): ${JSON.stringify(createResponse.data)}`,
    );

    const createResponseTrans1 = await apiClient.runTransactionV1({
      contractName: fabricContractName,
      channelName: fabricChannelName,
      params: ["CAR2", "20"],
      // params: [assetId, "Green", "19", assetOwner, "9999"],
      methodName: "CreateAsset",
      invocationType: FabricContractInvocationType.Send,
      signingCredential: fabricSigningCredential,
    });

    expect(createResponseTrans1).not.toBeUndefined();
    expect(createResponseTrans1.status).toBeGreaterThan(199);
    expect(createResponseTrans1.status).toBeLessThan(300);

    // const createResponseTrans2 = await apiClient.runTransactionV1({
    //   contractName: fabricContractName,
    //   channelName: fabricChannelName,
    //   params: ["CAR1", "30"],
    //   // params: [assetId, "Green", "19", assetOwner, "9999"],
    //   methodName: "UpdateAsset",
    //   invocationType: FabricContractInvocationType.Send,
    //   signingCredential: fabricSigningCredential,
    // });

    const createResponseTrans2 = await apiClient.runTransactionV1({
      contractName: fabricContractName,
      channelName: fabricChannelName,
      params: ["CAR1", "40"],
      // params: [assetId, "Green", "19", assetOwner, "9999"],
      methodName: "CreateAsset",
      invocationType: FabricContractInvocationType.Send,
      signingCredential: fabricSigningCredential,
    });
    expect(createResponseTrans2).not.toBeUndefined();
    expect(createResponseTrans2.status).toBeGreaterThan(199);
    expect(createResponseTrans2.status).toBeLessThan(300);

    const createResponseTrans3 = await apiClient.runTransactionV1({
      contractName: fabricContractName,
      channelName: fabricChannelName,
      params: ["CAR1", "30"],
      // params: [assetId, "Green", "19", assetOwner, "9999"],
      methodName: "CreateAsset",
      invocationType: FabricContractInvocationType.Send,
      signingCredential: fabricSigningCredential,
    });
    expect(createResponseTrans3).not.toBeUndefined();
    expect(createResponseTrans3.status).toBeGreaterThan(199);
    expect(createResponseTrans3.status).toBeLessThan(300);
  }
  // BUNGEE options
  pluginBungeeOptions = {
    bungeeKeys: Secp256k1Keys.generateKeyPairsBuffer(),
    instanceId: uuidv4(),
    fabricApi: apiClient,
    fabricPath: fabricPath,
    fabricSigningCredential: fabricSigningCredential,
    fabricChannelName: fabricChannelName,
    fabricContractName: fabricContractName,
    fabricAssetID: FABRIC_ASSET_ID,
    fabricConfig: configFabric,
  };
});
test("simple test bungee", async () => {
  pluginBungee = new PluginBUNGEE(pluginBungeeOptions);
  // pluginBungee.saveViews();
  const resp = await pluginBungee.generateLedgerSnapshot();
  log.info(`pluginBungee.getBlocks(): ${resp}`);
});

afterAll(async () => {
  await fabricLedger.stop();
  await fabricLedger.destroy();

  await Servers.shutdown(fabricServer);

  await pruneDockerAllIfGithubAction({ logLevel })
    .then(() => {
      log.info("Pruning throw OK");
    })
    .catch(async () => {
      await Containers.logDiagnostics({ logLevel });
      fail("Pruning didn't throw OK");
    });
});
