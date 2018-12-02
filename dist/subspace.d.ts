/// <reference types="node" />
import EventEmitter from 'events';
import Wallet, { IProfileOptions } from '@subspace/wallet';
import Storage from '@subspace/storage';
import Network, { IMessage, IMessageCallback } from '@subspace/network';
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
    getGateways(): Promise<void>;
    join(myTcpPort: number, myAddress: 'localhost'): Promise<void>;
    leave(): Promise<void>;
    connect(nodeId: string): Promise<void>;
    disconnect(nodeId: string): Promise<void>;
    send(nodeId: Uint8Array, message: IMessage): Promise<void>;
    send(nodeId: string, message: IMessage): Promise<void>;
    send(nodeId: Uint8Array, message: Uint8Array, callback?: IMessageCallback): Promise<void>;
    send(nodeId: string, message: Uint8Array, callback?: IMessageCallback): Promise<void>;
    seedPlot(size?: number): Promise<void>;
    getBalance(address?: string): number;
    sendCredits(amount: number, address: string): Promise<Record>;
    pledgeSpace(interval: number): Promise<Record>;
    private setPaymentTimer;
    private requestHostPayment;
    reserveSpace(name?: string, email?: string, passphrase?: string, spaceReserved?: number, ttl?: number, replicationFactor?: number): Promise<void>;
    createMutableContract(name?: string, email?: string, passphrase?: string, spaceReserved?: number, ttl?: number, replicationFactor?: number): Promise<{
        txRecord: Record;
        contractRecord: Record;
    }>;
    putContract(txRecord: Record, contractRecord: Record): Promise<{}>;
    put(content: any, encrypted: boolean): Promise<{}>;
    get(key: string): Promise<{}>;
    rev(key: string, update: any): Promise<{}>;
    del(key: string): Promise<{}>;
    startFarmer(blockTime?: number): Promise<void>;
    private getLedger;
    private getLastBlockId;
    private getLedgerSegment;
    private getChain;
    private getLastBlock;
    private getBlockHeader;
    private getTx;
    private onLedger;
    getGenesisTime(): Promise<number>;
    private getPendingBlock;
    private getPendingBlockHeader;
    private getPendingTx;
    stopFarmer(): void;
    connectToNeighbor(nodeId: string): Promise<void>;
    getShard(nodeId: string, shardId: string, contractRecordId: string): Promise<void>;
    joinHosts(): Promise<void>;
    private replicateShards;
    leaveHosts(): Promise<void>;
    onHostFailure(): Promise<void>;
}
