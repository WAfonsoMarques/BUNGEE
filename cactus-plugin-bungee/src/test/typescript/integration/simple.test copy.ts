import { AddressInfo } from "net";
import http from "http";
import fs from "fs-extra";
import path from "path";

import test, { Test } from "tape-promise/tape";
// import "jest-extended";

import { v4 as uuidv4 } from "uuid";

import express from "express";
import bodyParser from "body-parser";

import {
  Containers,
  FabricTestLedgerV1,
  pruneDockerAllIfGithubAction,
} from "@hyperledger/cactus-test-tooling";

import {
  Checks,
  IListenOptions,
  LogLevelDesc,
  Servers,
} from "@hyperledger/cactus-common";
import { PluginRegistry } from "@hyperledger/cactus-core";

import {
  ChainCodeProgrammingLanguage,
  DefaultEventHandlerStrategy,
  FabricContractInvocationType,
  FileBase64,
} from "../../../main/typescript/public-api";

import { DefaultApi as FabricApi } from "../../../main/typescript/public-api";

import {
  IPluginLedgerConnectorFabricOptions,
  PluginLedgerConnectorFabric,
} from "@hyperledger/cactus-plugin-ledger-connector-fabric";
// import { IPluginLedgerConnectorFabricOptions } from "../../../main/typescript/plugin-ledger-connector-fabric";

import { DiscoveryOptions } from "fabric-network";
import { PluginKeychainMemory } from "@hyperledger/cactus-plugin-keychain-memory";
import { Configuration } from "@hyperledger/cactus-core-api";


test(testCase, async (t: Test) => {

  const getRes = await apiClient.runTransactionV1({
    contractName,
    channelName,
    params: [assetId],
    methodName: "ReadAsset",
    invocationType: FabricContractInvocationType.Call,
    signingCredential: {
      keychainId,
      keychainRef: keychainEntryKey,
    },
  });
  t.ok(getRes, "getRes truthy OK");
  t.ok(getRes.data, "getRes.data truthy OK");
  t.ok(getRes.data.functionOutput, "getRes.data.functionOutput truthy OK");
  t.true(getRes.status > 199 && createRes.status < 300, "getRes status 2xx OK");
  t.comment(`HelloWorld.get() ResponseBody: ${JSON.stringify(getRes.data)}`);

  const asset = JSON.parse(getRes.data.functionOutput);

  t.ok(asset, "JSON.parse(getRes.data.functionOutput) truthy OK");

  t.ok(asset.ID, "asset.ID truthy OK");
  t.equal(asset.ID, assetId, "asset.ID === assetId truthy OK");

  // Note: the capital spelling on "Owner" is not a bug. The fabric-samples
  // repo has the spelling different from the golang chaincode as well.
  t.ok(asset.Owner, "asset.Owner truthy OK");
  t.equal(asset.Owner, assetOwner, "asset.owner === assetOwner OK");

  t.end();
});
