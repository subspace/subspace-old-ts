/// <reference types="node" />
import * as EventEmitter from 'events';
import Wallet from '@subspace/wallet';
import { IProfileOptions } from "@subspace/wallet";
import Storage from '@subspace/storage';
import Network from '@subspace/network';
import { Tracker } from '@subspace/tracker';
import { Ledger } from '@subspace/ledger';
import { DataBase, Record } from '@subspace/database';
import { INeighborProof, IPendingFailure } from './interfaces';
export default class Subspace extends EventEmitter {
    bootstrap: boolean;
    gatewayNodes: string[];
    gatewayCount: number;
    delegated: boolean;
    name: string;
    email: string;
    passphrase: string;
    spacePledged: number | null;
    interval: number;
    storage: Storage;
    network: Network;
    wallet: Wallet;
    tracker: Tracker;
    database: DataBase;
    ledger: Ledger;
    isGateway: boolean;
    isHosting: boolean;
    env: string;
    storageAdapter: string;
    pendingRequests: Map<string, Set<string>>;
    messages: Map<string, number>;
    neighbors: Set<string>;
    neighborProofs: Map<string, INeighborProof>;
    failedNeighbors: Map<string, boolean>;
    pendingFailures: Map<string, IPendingFailure>;
    evictedShards: Map<string, Set<string>>;
    private trackerResponseCallbacks;
    constructor(bootstrap?: boolean, gatewayNodes?: string[], gatewayCount?: number, delegated?: boolean, name?: string, email?: string, passphrase?: string, spacePledged?: number | null, interval?: number);
    private addRequest;
    private removeRequest;
    private resolveRequest;
    private sendPutResponse;
    private sendGetResponse;
    private sendRevResponse;
    private sendDelResponse;
    private sendContractResponse;
    private getRequestSize;
    private startMessagePruner;
    initEnv(): Promise<void>;
    init(env: string, gateway: boolean, path?: string): Promise<void>;
    createProfile(options?: IProfileOptions): Promise<void>;
    deleteProfile(): Promise<void>;
    requestGateways(nodeId: Uint8Array): Promise<void>;
    private connectToGateways;
    private connectToGateway;
    private createJoinMessage;
    private createMessage;
    connectToAllGateways(): Promise<void>;
    join(myTcpPort: number, myAddress: 'localhost', myWsPort?: number): Promise<void>;
    leave(): void;
    connect(nodeId: Uint8Array): Promise<Uint8Array>;
    disconnect(nodeId: Uint8Array): void;
    private send;
    seedPlot(size?: number): Promise<void>;
    getBalance(address?: string): number;
    sendCredits(amount: number, address: string): Promise<Record>;
    pledgeSpace(interval?: number): Promise<Record>;
    private setPaymentTimer;
    private requestHostPayment;
    reserveSpace(spaceReserved?: number, ttl?: number, replicationFactor?: number, name?: string, email?: string, passphrase?: string): Promise<void>;
    createMutableContract(name?: string, email?: string, passphrase?: string, spaceReserved?: number, ttl?: number, replicationFactor?: number): Promise<{
        txRecord: Record;
        contractRecord: Record;
    }>;
    putContract(txRecord: Record, contractRecord: Record): Promise<void>;
    put(content: any, encrypted: boolean): Promise<any>;
    get(key: string): Promise<any>;
    rev(key: string, update: any): Promise<any>;
    del(key: string): Promise<void>;
    startFarmer(blockTime?: number): Promise<void>;
    private requestLedger;
    private requestLastBlockId;
    private requestLedgerSegment;
    private requestChain;
    private requestLastBlock;
    private requestBlockHeader;
    private requestTx;
    private onLedger;
    getGenesisTime(): Promise<number>;
    private requestPendingBlock;
    private requestPendingBlockHeader;
    private requestPendingTx;
    stopFarmer(): void;
    requestTrackerHash(nodeId: Uint8Array): Promise<string>;
    requestTracker(nodeId: Uint8Array): Promise<any>;
    connectToNeighbor(nodeId: string): Promise<void>;
    joinHosts(): Promise<void>;
    requestShard(nodeId: string, shardId: string, contractRecordId: string): Promise<void>;
    private replicateShards;
    leaveHosts(): Promise<void>;
}
