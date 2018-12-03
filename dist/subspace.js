"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = __importDefault(require("events"));
const crypto = __importStar(require("@subspace/crypto"));
const wallet_1 = __importDefault(require("@subspace/wallet"));
const storage_1 = __importDefault(require("@subspace/storage"));
const network_1 = __importDefault(require("@subspace/network"));
const tracker_1 = require("@subspace/tracker");
const ledger_1 = require("@subspace/ledger");
const database_1 = require("@subspace/database");
const DEFAULT_PROFILE_NAME = 'name';
const DEFAULT_PROFILE_EMAIL = 'name@name.com';
const DEFAULT_PROFILE_PASSPHRASE = 'passphrase';
const DEFAULT_HOST_PLEDGE = 10000000000; // 10 GB in bytes
const DEFAULT_HOST_INTERVAL = 2628000000; // 1 month in ms
const DEFAULT_GATEWAY_COUNT = 1;
const DEFAULT_CONTRACT_NAME = 'key';
const DEFAULT_CONTRACT_EMAIL = 'key@key.com';
const DEFAULT_CONTRACT_PASSPHRASE = 'lockandkey';
const DEFAULT_CONTRACT_SIZE = 1000000000; // 1 GB in bytes
const DEFAULT_CONTRACT_TTL = 2628000000; // 1 month in ms
const DEFAULT_CONTRACT_REPLICATION_FACTOR = 2;
const DEFAULT_GATEWAY_NODES = [
    '772441c914c75d64a3a7af3b2fd9c367ce6fe5c00450a43efe557c544e479de6:127.0.0.1:port:8125'
];
class Subspace extends events_1.default {
    constructor(bootstrap = false, gatewayNodes = DEFAULT_GATEWAY_NODES, gatewayCount = DEFAULT_GATEWAY_COUNT, delegated = false, name = DEFAULT_PROFILE_NAME, email = DEFAULT_PROFILE_EMAIL, passphrase = DEFAULT_CONTRACT_PASSPHRASE, spacePledged = null, interval = null) {
        super();
        this.bootstrap = bootstrap;
        this.gatewayNodes = gatewayNodes;
        this.gatewayCount = gatewayCount;
        this.delegated = delegated;
        this.name = name;
        this.email = email;
        this.passphrase = passphrase;
        this.spacePledged = spacePledged;
        this.interval = interval;
        this.isGateway = false;
        this.isHosting = false;
        this.env = '';
        this.storageAdapter = '';
        this.pendingRequests = new Map();
        this.messages = new Map();
        this.neighbors = new Set();
        this.neighborProofs = new Map();
        this.failedNeighbors = new Map();
        this.pendingFailures = new Map();
        this.evictedShards = new Map();
    }
    async addRequest(type, recordId, data, hosts) {
        // generate and send the request
        const message = await this.network.createGenericMessage(`${type}-request`, data);
        for (const host of hosts) {
            await this.network.send(host, message);
        }
        const hostSet = new Set([...hosts]);
        // add the requests and copy to pending
        this.pendingRequests.set(crypto.getHash(type + recordId), hostSet);
        this.pendingRequests.set(crypto.getHash(recordId + type), hostSet);
    }
    async removeRequest(type, recordId, host) {
        const key = crypto.getHash(type + recordId);
        const request = this.pendingRequests.get(key);
        request.delete(host);
        this.pendingRequests.set(key, request);
    }
    resolveRequest(type, recordId) {
        this.pendingRequests.delete(crypto.getHash(type + recordId));
        const copyKey = crypto.getHash(recordId + type);
        const hosts = this.pendingRequests.get(copyKey);
        this.pendingRequests.delete(copyKey);
        return hosts;
    }
    async sendPutResponse(client, valid, reason, key) {
        const response = { valid, reason, key };
        const message = await this.network.createGenericMessage('put-reply', response);
        this.network.send(client, message);
    }
    async sendGetResponse(client, valid, key, reason, record) {
        const response = { valid, key, reason, record };
        const message = await this.network.createGenericMessage('get-reply', response);
        this.network.send(client, message);
    }
    async sendRevResponse(client, valid, reason, key) {
        const response = { valid, reason, key };
        const message = await this.network.createGenericMessage('rev-reply', response);
        this.network.send(client, message);
    }
    async sendDelResponse(client, valid, reason, key) {
        const response = { valid, reason, key };
        const message = await this.network.createGenericMessage('del-reply', response);
        this.network.send(client, message);
    }
    async sendContractResponse(client, valid, reason, key) {
        const response = { valid, reason, key };
        const message = await this.network.createGenericMessage('contract-reply', response);
        this.network.send(client, message);
    }
    getRequestSize(type, recordId) {
        return this.pendingRequests.get(crypto.getHash(type + recordId)).size;
    }
    startMessagePruner() {
        // expire all messages older than 10 minutes, every 10 minutes
        const messagePruningInterval = setInterval(() => {
            const cutoffTime = Date.now() - 600000;
            this.messages.forEach((timestamp, message) => {
                if (timestamp <= cutoffTime) {
                    this.messages.delete(message);
                }
            });
        }, 600000);
    }
    async initEnv() {
        if (typeof window !== 'undefined') {
            console.log('Browser env detected');
            this.env = 'browser';
        }
        else if (await this.network.isIpPublic()) {
            console.log('Gateway env detected');
            this.env = 'gateway';
        }
        else {
            // else 'node' | 'bitbot' | 'desktop' | 'mobile'
            console.log('Private host env detected');
            this.env = 'private-host';
        }
    }
    async init(env, gateway, path) {
        this.isGateway = gateway;
        this.env = env;
        // determine the node env
        // await this.initEnv()
        // determine the storage adapter
        if (this.env === 'browser') {
            this.storageAdapter = 'browser';
        }
        else {
            this.storageAdapter = 'rocks';
        }
        this.storage = new storage_1.default(this.storageAdapter, path);
        // init the profile
        // if no profile, will create a new default profile
        // if args, will create a new profile from args
        // if existing profile, will load from disk
        this.wallet = new wallet_1.default(this.storage);
        const walletOptions = {
            name: DEFAULT_PROFILE_NAME,
            email: DEFAULT_PROFILE_EMAIL,
            passphrase: DEFAULT_PROFILE_PASSPHRASE
        };
        await this.wallet.init(walletOptions);
        this.setPaymentTimer();
        // ledger 
        this.ledger = new ledger_1.Ledger(this.storage, this.wallet);
        this.ledger.on('block-solution', async (block) => {
            // receive a packed record for sending over the network
            console.log('Gossiping a new block solution: ', block._key, '\n');
            const blockMessage = await this.network.createGenericMessage('block', block);
            this.network.gossip(blockMessage);
            const blockRecord = database_1.Record.readPacked(block._key, block._value);
            await blockRecord.unpack(null);
            this.emit('block', blockRecord);
        });
        this.ledger.on('tx', (txRecord) => {
            this.emit('tx', txRecord);
        });
        this.ledger.on('applied-block', (block) => {
            this.emit('applied-block', block);
        });
        // tracker 
        this.tracker = new tracker_1.Tracker(this.storage, this.wallet, this.ledger);
        this.on('tx', (txRecord) => {
            // on valid pledge tx, add new inactive host entry into the tracker
            if (txRecord.value.content.type === 'pledge') {
                this.tracker.addEntry(txRecord);
                console.log('Applied pledge to tracker');
                // console.log(this.tracker.lht)
            }
            if (txRecord.value.content.type === 'contract') {
                // compute shards
                // for each shard
                // see if I am closest host
                // if closest, initialize the shard
            }
        });
        // database
        this.database = new database_1.DataBase(this.wallet, this.storage);
        // network
        this.network = new network_1.default(this.bootstrap, this.gatewayNodes, this.gatewayCount, this.delegated, this.wallet, this.tracker, this.env);
        // prune messages every 10 minutes
        this.startMessagePruner();
        this.network.on('join', () => this.emit('join'));
        this.network.on('leave', () => this.emit('leave'));
        this.network.on('connection', connection => this.emit('connection', connection.nodeId));
        this.network.on('disconnection', (connection) => {
            this.emit('disconnection', connection.nodeId);
            const nodeId = connection.nodeId;
            // if hosting, listen for and report on failed hosts
            if (this.isHosting) {
                if (this.neighbors.has(nodeId)) {
                    const entry = this.tracker.getEntry(nodeId);
                    if (entry && entry.status) {
                        // a valid neighbor has failed 
                        this.failedNeighbors.set(nodeId, false);
                        const timeout = Math.floor(Math.random() * Math.floor(10));
                        setTimeout(async () => {
                            // later attempt to ping the node 
                            // if failure entry is still false (have not received a failure message)
                            const entry = this.failedNeighbors.get(nodeId);
                            if (!entry) {
                                this.failedNeighbors.set(nodeId, true);
                                // compute their neighbors
                                const profile = this.wallet.getProfile();
                                const hosts = this.tracker.getActiveHosts();
                                const neighbors = new Set([...this.tracker.getNeighbors(nodeId, hosts)]);
                                neighbors.delete(profile.id);
                                // track the failures 
                                const pendingFailure = {
                                    neighbors,
                                    signatures: [],
                                    createdAt: Date.now()
                                };
                                this.pendingFailures.set(nodeId, JSON.parse(JSON.stringify(pendingFailure)));
                                // start the failure message 
                                const failureMessage = await this.tracker.createFailureMessage(nodeId);
                                for (const neighbor of neighbors) {
                                    await this.network.send(neighbor, failureMessage);
                                }
                            }
                        }, timeout * 1000);
                    }
                }
            }
            // handle reply from each neighbor of failed host
            this.once('failure-reply', async (message) => {
                const response = message.data;
                // validate the signature
                const unsignedResponse = JSON.parse(JSON.stringify(response));
                unsignedResponse.signature = null;
                // if valid signature, add to pending failure 
                if (await crypto.isValidSignature(unsignedResponse, response.publicKey, response.signature)) {
                    const pendingFailure = JSON.parse(JSON.stringify(this.pendingFailures.get(response.nodeId)));
                    pendingFailure.signatures.push(response);
                    this.pendingFailures.set(response.nodeId, JSON.parse(JSON.stringify(pendingFailure)));
                    // once you have 2/3 signatures turn into a failure proof
                    if (pendingFailure.signatures.length >= pendingFailure.neighbors.size * (2 / 3)) {
                        // resolve the failure request 
                        this.pendingFailures.delete(response.nodeId);
                        // create and gossip the failure message 
                        const fullFailureMessage = await this.tracker.compileFailureMessage(response.nodeId, pendingFailure.createdAt, pendingFailure.signatures);
                        this.network.gossip(fullFailureMessage);
                    }
                }
            });
        });
        this.network.on('message', async (message) => {
            console.log('Received a', message.type, 'message from', message.sender.substring(0, 8));
            let valid = false;
            // handle validation for gossiped messages here
            // specific rpc methods are emitted and handled in corresponding parent method
            // prevent revalidating and regoissiping the same messages
            if (['block', 'solution'].includes(message.type)) {
                const messagedId = crypto.getHash(JSON.stringify(message.data));
                if (this.messages.has(messagedId)) {
                    return;
                }
                this.messages.set(messagedId, Date.now());
            }
            let response, peer, connection, entry, responseMessage, failure = null;
            switch (message.type) {
                // don't validate tx and blocks until you have the full ledger 
                // and are ready to start farming 
                case ('peer-added'):
                    peer = message.data;
                    connection = this.network.getConnectionFromId(message.sender);
                    connection.peers.push(peer);
                    break;
                case ('peer-removed'):
                    peer = message.data;
                    connection = this.network.getConnectionFromId(message.sender);
                    const index = connection.peers.indexOf(peer);
                    connection.peers.splice(index, 1);
                    break;
                case ('tx'):
                    if (this.ledger.hasLedger) {
                        // first ensure we have a valid SSDB record wrapping the tx
                        const txRecord = database_1.Record.readUnpacked(message.data.key, message.data.value);
                        const txRecordTest = await txRecord.isValid();
                        if (txRecordTest.valid) {
                            // then validate the tx data
                            const txTest = await this.ledger.onTx(txRecord);
                            if (txTest.valid) {
                                const txMessage = await this.network.createGenericMessage('tx', message.data);
                                this.network.gossip(txMessage, message.sender);
                                this.emit('tx', txRecord);
                            }
                        }
                    }
                    break;
                case ('block'):
                    if (this.ledger.hasLedger) {
                        const blockRecord = database_1.Record.readPacked(message.data._key, JSON.parse(JSON.stringify(message.data._value)));
                        await blockRecord.unpack(null);
                        console.log('Received a new block via gossip: ', blockRecord.key, '\n');
                        const blockRecordTest = await this.ledger.onBlock(blockRecord);
                        if (!blockRecordTest.valid) {
                            throw new Error(blockRecordTest.reason);
                        }
                        const blockMessage = await this.network.createGenericMessage('block', message.data);
                        // should not be returned to the same node
                        this.network.gossip(blockMessage, message.sender);
                        this.emit('block', blockRecord);
                    }
                    break;
                case ('gateway-request'):
                    response = await this.network.createGenericMessage('gateway-reply', this.network.gatewayNodes);
                    await this.send(message.sender, response);
                    break;
                case ('chain-request'):
                    const chain = this.ledger.chain;
                    response = await this.network.createGenericMessage('chain-reply', chain);
                    await this.send(message.sender, response);
                    break;
                case ('last-block-id-request'):
                    const lastBlockId = this.ledger.getLastBlockId();
                    response = await this.network.createGenericMessage('last-block-id-reply', lastBlockId);
                    await this.network.send(message.sender, response);
                    break;
                case ('block-header-request'):
                    const blockKey = message.data;
                    const blockValue = JSON.parse(await this.storage.get(blockKey));
                    blockValue.content = JSON.stringify(blockValue.content);
                    const block = database_1.Record.readPacked(blockKey, blockValue);
                    response = await this.network.createGenericMessage('block-header-reply', block.getRecord());
                    await this.network.send(message.sender, response);
                    break;
                case ('tx-request'):
                    const txKey = message.data;
                    const txValue = JSON.parse(await this.storage.get(txKey));
                    const tx = database_1.Record.readPacked(txKey, txValue);
                    response = await this.network.createGenericMessage('tx-reply', tx.getRecord());
                    await this.network.send(message.sender, response);
                    break;
                case ('pending-block-header-request'):
                    const pendingBlockId = this.ledger.validBlocks[0];
                    if (pendingBlockId) {
                        const pendingBlockValue = JSON.parse(JSON.stringify(this.ledger.pendingBlocks.get(pendingBlockId)));
                        const pendingBlock = database_1.Record.readUnpacked(pendingBlockId, pendingBlockValue);
                        await pendingBlock.pack(null);
                        response = await this.network.createGenericMessage('pending-block-header-reply', pendingBlock.getRecord());
                    }
                    else {
                        response = await this.network.createGenericMessage('pending-block-header-reply', null);
                    }
                    await this.network.send(message.sender, response);
                    break;
                case ('pending-tx-request'):
                    const pendingTxId = message.data;
                    const pendingTxValue = this.ledger.validTxs.get(pendingTxId);
                    if (!pendingTxValue) {
                        console.log(pendingTxId, this.ledger.validTxs);
                        throw new Error('Do not have pending tx');
                    }
                    const pendingTxCopy = JSON.parse(JSON.stringify(pendingTxValue));
                    const pendingTxRecord = database_1.Record.readUnpacked(pendingTxId, pendingTxCopy);
                    await pendingTxRecord.pack(null);
                    response = await this.network.createGenericMessage('pending-tx-reply', pendingTxRecord.getRecord());
                    await this.network.send(message.sender, response);
                    break;
                case ('host-join'):
                    // on receipt of join message by each host
                    const join = message.data;
                    // later add strict validation
                    // if the node is in the LHT, in an incative state, compute its neighbors
                    entry = this.tracker.getEntry(join.nodeId);
                    if (entry && !entry.status) {
                        const activeHosts = this.tracker.getActiveHosts();
                        const neighbors = new Set([...this.tracker.getNeighbors(join.nodeId, activeHosts)]);
                        let validCount = 0;
                        // for each valid neighbor, validate the signature 
                        for (const proof of join.signatures) {
                            if (neighbors.has(crypto.getHash(proof.neighbor)) && proof.host === join.nodeId) {
                                const unsignedProof = JSON.parse(JSON.stringify(proof));
                                unsignedProof.signature = null;
                                if (await crypto.isValidSignature(unsignedProof, proof.signature, proof.neighbor)) {
                                    validCount++;
                                }
                                else {
                                    throw new Error('invalid host-join signature');
                                }
                            }
                        }
                        // if 2/3 of neighbors have signed, valid join
                        if (validCount >= (neighbors.size * (2 / 3))) {
                            console.log('Valid host join, updating entry');
                            this.tracker.updateEntry(join);
                            await this.network.gossip(message, message.sender);
                            // drop any shards this host replicated from me
                            if (this.evictedShards.has(join.nodeId)) {
                                const shards = this.evictedShards.get(join.nodeId);
                                this.evictedShards.delete(join.nodeId);
                                for (const shard of shards) {
                                    this.database.delShard(shard);
                                }
                            }
                        }
                        else {
                            throw new Error('Insuffecient singatures for host join');
                        }
                    }
                    break;
                case ('neighbor-request'):
                    // validate a host neighbor request and connect
                    let profile = this.wallet.getProfile();
                    const requestTest = await this.tracker.isValidNeighborRequest(message);
                    const neighborResponse = {
                        valid: false,
                        reason: null,
                        proof: null
                    };
                    // is this a valid neighbor request message?
                    if (!requestTest) {
                        console.log(requestTest.reason);
                        neighborResponse.reason = requestTest.reason;
                        const responseMessage = await this.network.createGenericMessage('neighbor-reply', neighborResponse);
                        await this.network.send(message.sender, responseMessage);
                    }
                    // am I a valid neighbor for this host?
                    const activeHosts = this.tracker.getActiveHosts();
                    const hostNeighbors = this.tracker.getNeighbors(message.sender, activeHosts);
                    if (!hostNeighbors.includes(profile.id)) {
                        neighborResponse.reason = 'invalid neighbor request, not a valid neighbor';
                        console.log(neighborResponse.reason);
                        const responseMessage = await this.network.createGenericMessage('neighbor-reply', neighborResponse);
                        await this.network.send(message.sender, responseMessage);
                    }
                    // add to neighbors 
                    this.neighbors.add(message.sender);
                    // send join reply with my signature proof
                    neighborResponse.proof = {
                        host: message.sender,
                        neighbor: profile.publicKey,
                        timestamp: Date.now(),
                        signature: null
                    };
                    neighborResponse.valid = true;
                    neighborResponse.proof.signature = await crypto.sign(neighborResponse.proof, profile.privateKeyObject);
                    responseMessage = await this.network.createGenericMessage('neighbor-reply', neighborResponse);
                    await this.network.send(message.sender, responseMessage);
                    break;
                case ('shard-reqeust'):
                    const request = message.data;
                    profile = this.wallet.getProfile();
                    const shardResponse = {
                        valid: false,
                        reason: null,
                        contractId: request.contractRecordId,
                        shardId: request.shardId,
                        records: []
                    };
                    // validate the contract and shard match 
                    const contract = JSON.parse(JSON.stringify(this.ledger.clearedContracts.get(request.contractRecordId)));
                    const shards = this.database.computeShardArray(contract.contractId, contract.spaceReserved);
                    if (!shards.includes(request.shardId)) {
                        const responseMessage = await this.network.createGenericMessage('shard-reply', shardResponse);
                        this.network.send(message.sender, responseMessage);
                    }
                    entry = this.tracker.getEntry(message.sender);
                    if (!entry || entry.status) {
                        const responseMessage = await this.network.createGenericMessage('shard-reply', shardResponse);
                        this.network.send(message.sender, responseMessage);
                    }
                    // compute hosts for shard with the requesting host temporarilty set to active
                    entry.status = true;
                    this.tracker.lht.set(message.sender, entry);
                    const hosts = this.database.computeHostsforShards([request.shardId], contract.replicationFactor)[0].hosts;
                    entry.status = false;
                    this.tracker.lht.set(message.sender, entry);
                    // see if they are both closer than me and if I have been evicted from shard
                    if (!hosts.includes(message.sender) || hosts.includes(profile.id)) {
                        const responseMessage = await this.network.createGenericMessage('shard-reply', shardResponse);
                        this.network.send(message.sender, responseMessage);
                    }
                    // valid request 
                    shardResponse.valid = true;
                    // get all records for shard
                    const shard = this.database.getShard(request.shardId);
                    for (const recordId of shard.records) {
                        const recordValue = JSON.parse(await this.storage.get(recordId));
                        recordValue.content = JSON.stringify(recordValue.content);
                        const record = database_1.Record.readPacked(recordId, recordValue);
                        shardResponse.records.push(record);
                    }
                    // once the new host is active on the tracker, this node will drop the shard and records
                    let evictedShard;
                    if (this.evictedShards.has(message.sender)) {
                        evictedShard = this.evictedShards.get(message.sender);
                    }
                    else {
                        evictedShard = new Set();
                    }
                    evictedShard.add(request.shardId);
                    this.evictedShards.set(message.sender, evictedShard);
                    // need to create an unsigned message, should really be sent as a stream
                    responseMessage = await this.network.createGenericMessage('shard-reply', response);
                    this.network.send(message.sender, responseMessage);
                    break;
                case ('host-leave'):
                    const leave = message.data;
                    profile = this.wallet.getProfile();
                    // validate the signature
                    const unsignedLeave = JSON.parse(JSON.stringify(leave));
                    unsignedLeave.signature = null;
                    if (await crypto.isValidSignature(leave, leave.signature, message.publicKey)) {
                        const entry = this.tracker.getEntry(message.sender);
                        if (entry && entry.status) {
                            // valid leave, gossip back out
                            await this.network.gossip(message, message.sender);
                            // see if I need to replicate any shards for this host
                            this.replicateShards(message.sender);
                            // deactivate the node in the tracker after computing shards
                            this.tracker.updateEntry(leave);
                        }
                    }
                    break;
                case ('failure-request'):
                    // reply to a failure inquiry regarding one of my neighbors 
                    failure = message.data;
                    // if you have detected the failure and have not already signed or created a failure message
                    if (this.failedNeighbors.has(failure.nodeId)) {
                        const failedNeighbor = this.failedNeighbors.get(failure.nodeId);
                        if (!failedNeighbor) {
                            // append signature to failure message
                            this.failedNeighbors.set(failure.nodeId, true);
                            const response = await this.tracker.signFailureMessage(failure);
                            const responseMessage = await this.network.createGenericMessage('failure-reply', response);
                            this.network.send(message.sender, responseMessage);
                        }
                    }
                    break;
                case ('host-failure'):
                    // listen for and validate gossiped failures of other hosts neighbors
                    failure = message.data;
                    entry = this.tracker.getEntry(failure.nodeId);
                    if (entry && entry.status) {
                        const hosts = this.tracker.getActiveHosts();
                        const neighbors = new Set([...this.tracker.getNeighbors(failure.nodeId, hosts)]);
                        let validSigs = 0;
                        for (const signature of failure.signatures) {
                            if (neighbors.has(crypto.getHash(signature.publicKey))) {
                                const unsignedSig = JSON.parse(JSON.stringify(signature));
                                unsignedSig.signature = null;
                                if (await crypto.isValidSignature(signature, signature.signature, signature.publicKey)) {
                                    validSigs++;
                                }
                            }
                        }
                        // valid failure if at least 2/3 of signatures are valid
                        if (validSigs >= neighbors.size * (2 / 3)) {
                            // check to see if I need to replicate shards
                            this.replicateShards(failure.nodeId);
                            // deactivate the node in the tracker
                            this.tracker.updateEntry(failure);
                            // continue to spread the failure message
                            this.network.gossip(message, message.sender);
                            // remove the node from pending failure if I am a neighbor
                            if (this.pendingFailures.has(failure.nodeId)) {
                                this.pendingFailures.delete(failure.nodeId);
                            }
                        }
                    }
                    break;
                default:
                    this.emit(message.type, message.data, message.sender);
            }
        });
        this.emit('ready');
    }
    async createProfile(options) {
        // create a new subspace identity 
        if (!options) {
            options = {
                name: DEFAULT_PROFILE_NAME,
                email: DEFAULT_PROFILE_EMAIL,
                passphrase: DEFAULT_PROFILE_PASSPHRASE
            };
        }
        await this.wallet.createProfile(options);
    }
    async deleteProfile() {
        // deletes the existing profile on disk
        if (this.wallet.profile.user) {
            await this.wallet.profile.clear();
        }
    }
    // core network methods
    async getGateways() {
        return new Promise(async (resolve, reject) => {
            // request the latest array of gateway nodes from the first gateway node, merge with your array
            const gateway = this.network.getClosestGateways(1)[0];
            const message = await this.network.createGenericMessage('gateway-request');
            await this.send(gateway.nodeId, message);
            this.once('gateway-reply', (message) => {
                const newGateways = new Set(message);
                const oldGateways = new Set(this.network.gatewayNodes);
                const combinedGateways = new Set([...newGateways, ...oldGateways]);
                this.network.gatewayNodes = [...combinedGateways];
                resolve();
            });
        });
    }
    async join(myTcpPort = 8124, myAddress) {
        return new Promise(async (resolve, reject) => {
            // join the subspace network as a node, connecting to some known gateway nodes
            // currently connects to a signle know gateway and then fetches existing nodes from it 
            // connect to the first gateway 
            await this.network.join(myTcpPort, myAddress);
            if (this.bootstrap) {
                return resolve();
            }
            // get all active gateways 
            await this.getGateways();
            // connect to each not already connected to, up to gateway count
            const gateways = this.network.getGateways();
            const peers = this.network.getPeers();
            for (const gateway of this.network.gatewayNodes) {
                if (!peers.includes(gateway.nodeId) && gateway.nodeId !== this.wallet.profile.user.id) {
                    await this.network.connectToGateway(gateway.nodeId, gateway.publicIp, gateway.tcpPort);
                    const connectedGatewayCount = this.network.getGateways().length;
                    if (connectedGatewayCount === this.gatewayCount) {
                        this.emit('join');
                        resolve();
                    }
                }
            }
            resolve();
        });
    }
    async leave() {
        // leave the subspace network, disconnecting from all peers
        await this.network.leave();
        this.emit('leave');
    }
    async connect(nodeId) {
        // connect to another node directly as a peer
        await this.network.connect(nodeId);
    }
    async disconnect(nodeId) {
        // disconnect from another node as a peer
        await this.network.disconnect(nodeId);
        this.emit('disconnection');
    }
    async send(nodeId, message) {
        await this.network.send(nodeId, message);
    }
    // ledger tx methods
    async seedPlot(size = DEFAULT_HOST_PLEDGE) {
        // seed a plot on disk by generating a proof of space
        const profile = this.wallet.getProfile();
        const proof = crypto.createProofOfSpace(profile.publicKey, size);
        await this.storage.put(proof.id, JSON.stringify(proof));
        this.wallet.profile.proof = proof;
    }
    getBalance(address = this.wallet.profile.user.id) {
        return this.ledger.getBalance(address);
    }
    async sendCredits(amount, address) {
        // send subspace credits to another address
        const profile = this.wallet.getProfile();
        const txRecord = await this.ledger.createCreditTx(profile.publicKey, address, amount);
        const txMessage = await this.network.createGenericMessage('tx', txRecord.getRecord());
        this.network.gossip(txMessage);
        // should emit an event when tx is confirmed, later
        return txRecord;
    }
    async pledgeSpace(interval = DEFAULT_HOST_INTERVAL) {
        // creates and submits a pledges as a proof of space to the ledger as a host
        if (!this.wallet.profile.proof) {
            throw new Error('You must first seed your plot');
        }
        const profile = this.wallet.getProfile();
        const proof = this.wallet.profile.proof;
        const txRecord = await this.ledger.createPledgeTx(profile.publicKey, proof.id, proof.size, interval);
        const txMessage = await this.network.createGenericMessage('tx', txRecord.getRecord());
        this.wallet.profile.pledge = {
            proof: this.wallet.profile.proof.id,
            size: proof.size,
            interval: interval,
            createdAt: Date.now(),
            pledgeTx: txRecord.key
        };
        // this.setPaymentTimer()
        // corresponding code for on('pledge')
        // should emit an event when tx is confirmed 
        this.network.gossip(txMessage);
        return txRecord;
    }
    setPaymentTimer() {
        // called on init 
        const pledge = this.wallet.profile.pledge;
        // if I have an active pledge, set a timeout to request payment
        if (pledge) {
            const timeToPayment = (pledge.createdAt + pledge.interval) - Date.now();
            setTimeout(() => {
                this.requestHostPayment();
            }, timeToPayment);
        }
    }
    async requestHostPayment() {
        // called when payment timer expires
        // requests host payment from the nexus
        const profile = this.wallet.getProfile();
        const pledge = this.wallet.profile.pledge;
        const trackerEntry = this.tracker.getEntry(profile.id);
        const uptime = trackerEntry.uptime;
        const amount = await this.ledger.computeHostPayment(uptime, pledge.size, pledge.interval, pledge.pledgeTx);
        const txRecord = await this.ledger.createNexusTx(profile.publicKey, pledge.pledgeTx, amount, this.ledger.clearedImmutableCost);
        const txMessage = await this.network.createGenericMessage('tx', txRecord.getRecord());
        // later should renew pledge and reset timer
    }
    // may also want to add the ability to do pay per put since the ledger is much faster now
    async reserveSpace(name = DEFAULT_CONTRACT_NAME, email = DEFAULT_CONTRACT_EMAIL, passphrase = DEFAULT_CONTRACT_PASSPHRASE, spaceReserved = DEFAULT_CONTRACT_SIZE, ttl = DEFAULT_CONTRACT_TTL, replicationFactor = DEFAULT_CONTRACT_REPLICATION_FACTOR) {
        if (ttl) {
            const { txRecord, contractRecord } = await this.createMutableContract(name, email, passphrase, spaceReserved, ttl, replicationFactor);
            await this.putContract(txRecord, contractRecord);
        }
    }
    async createMutableContract(name = DEFAULT_CONTRACT_NAME, email = DEFAULT_CONTRACT_EMAIL, passphrase = DEFAULT_CONTRACT_PASSPHRASE, spaceReserved = DEFAULT_CONTRACT_SIZE, ttl = DEFAULT_CONTRACT_TTL, replicationFactor = DEFAULT_CONTRACT_REPLICATION_FACTOR) {
        // initially called from a subspace full node or console app that is reserving space on behalf of a client
        // later once clients can earn / own credits they could call directly 
        // creates a mutable storage contract, backed by an immutable contract tx with a mutable contract state 
        // signature on funding tx must match signature on contract state 
        // importantly, funding tx does not point to it's contract state
        // this provides strong anonymity on the ledger 
        // this also allows for contract funds to be replenished over time
        // for example a mutable contract that needs to be renewed
        // or a mutable contract that needs to have more space added
        // create the empty mutable record to serve as contract state and id 
        const profile = this.wallet.getProfile();
        const contractRecord = await database_1.Record.createMutable(null, false, profile.publicKey);
        // unpack to extract the contract keys
        await contractRecord.unpack(profile.privateKeyObject);
        const privateKey = contractRecord.value.privateKey;
        const publicKey = contractRecord.value.publicKey;
        await contractRecord.pack(profile.publicKey);
        // sign the contract public key with its private key to prove ownership without revealing contract id 
        const privateKeyObject = await crypto.getPrivateKeyObject(privateKey, passphrase);
        const contractSig = await crypto.sign(publicKey, privateKeyObject);
        const contractId = crypto.getHash(publicKey);
        // tx will be saved on apply tx 
        // contract record does not need to be saved directly
        // state is already being saved in the wallet contract object 
        // each host will hold the state
        // when we send an update it should only inlcude the new state
        // create the immutable contract tx and tx record, with included contract signature
        const txRecord = await this.ledger.createMutableContractTx(spaceReserved, replicationFactor, ttl, contractSig, contractId);
        // update the contract record with correct state 
        const contractState = {
            fundingTx: txRecord.key,
            spaceUsed: 0,
            recordIndex: new Set() // index of all records in the contract
        };
        await contractRecord.update(contractState, profile);
        // add the contract keys and data to your wallet
        const walletContract = {
            key: {
                id: contractRecord.key,
                type: 'contract',
                createdAt: contractRecord.value.createdAt,
                public: publicKey,
                private: privateKey,
                privateObject: privateKeyObject
            },
            options: {
                id: contractRecord.key,
                name: name,
                email: email,
                passphrase: passphrase,
                ttl: ttl,
                replicationFactor: replicationFactor,
                spaceReserved: spaceReserved,
                createdAt: contractRecord.value.createdAt,
                contractSig: contractSig
            },
            state: {
                fundingTx: txRecord.key,
                spaceUsed: contractState.spaceUsed,
                recordIndex: contractState.recordIndex
            }
        };
        await this.wallet.contract.store(walletContract);
        return { txRecord, contractRecord };
    }
    putContract(txRecord, contractRecord) {
        return new Promise(async (resolve, reject) => {
            // contact the contract holders so they may initialize contract state
            const contract = this.wallet.getPublicContract();
            const privateKeyObject = this.wallet.contract.key.privateObject;
            const hosts = this.database.getShardAndHostsForKey(contract.id, contract).hosts;
            const request = {
                tx: txRecord.getRecord(),
                contract: contractRecord.getRecord(),
                signature: null
            };
            request.signature = await crypto.sign(JSON.stringify(request), privateKeyObject);
            await this.addRequest('contract', contractRecord.key, request, hosts);
            // gossip the contract tx to the network
            const contractTxMessage = await this.network.createGenericMessage('tx', txRecord.getRecord());
            this.network.gossip(contractTxMessage);
            // when host to hold contract receives the contract-request
            this.on('contract-request', async (message) => {
                const request = message.data;
                // validate the contract-request
                const tx = this.database.loadUnpackedRecord(request.tx);
                const contractState = this.database.loadUnpackedRecord(request.contract);
                const txTest = await this.ledger.onTx(tx);
                if (!txTest.valid) {
                    this.sendContractResponse(message.sender, false, txTest.reason, contractState.key);
                    return;
                }
                // validate the contract tx matches the contract record 
                const contractTest = await this.database.isValidMutableContractRequest(tx, contractState);
                if (!contractTest) {
                    const reason = 'Invalid contract request, mutable contract state public key does not match funding transaction contract signature';
                    this.sendContractResponse(message.sender, false, reason, contractState.key);
                    return;
                }
                // validate the contract mutable record
                const contract = JSON.parse(JSON.stringify(this.ledger.pendingContracts.get(crypto.getHash(contractState.key))));
                const testRequest = await this.database.isValidPutRequest(contractState, contract, request);
                if (!testRequest.valid) {
                    this.sendContractResponse(message.sender, false, testRequest.reason, contractState.key);
                    return;
                }
                // assume valid
                await this.database.saveRecord(contractRecord, contract);
                const proof = contractRecord.createPoR(this.wallet.profile.user.id);
                this.sendContractResponse(message.sender, true, proof, contractRecord.key);
            });
            // when client receives the contract-reply from host
            this.network.on('contract-reply', async (message) => {
                const response = message.data;
                const contract = this.wallet.getPublicContract();
                if (!response.valid) {
                    reject(new Error(response.reason));
                }
                // validate PoR
                const record = await this.database.getRecord(response.key);
                if (!record.isValidPoR(message.sender, response.reason)) {
                    reject(new Error('Host returned invalid proof of replication'));
                }
                // remove from pending requests and get size
                const pendingSize = this.getRequestSize('reserve', record.key);
                this.removeRequest('reserve', record.key, message.sender);
                const shardMap = this.database.getShardAndHostsForKey(record.key, contract);
                const hostLength = shardMap.hosts.length;
                // resolve on first valid response
                if (pendingSize === hostLength) {
                    resolve();
                }
                // emit event and adjust contract when fully resolved
                if (pendingSize === 1) {
                    const hosts = this.resolveRequest('reserve', record.key);
                    this.emit('space-reserved', record.key, hosts);
                }
            });
        });
    }
    // core database methods
    put(content, encrypted) {
        return new Promise(async (resolve, reject) => {
            // create the record, get hosts, and send requests
            const privateContract = this.wallet.getPrivateContract();
            const publicContract = this.wallet.getPublicContract();
            const record = await this.database.createRecord(content, encrypted);
            this.wallet.contract.addRecord(record.key, record.getSize());
            // create a put request signed by contract key
            const request = {
                record: record.getRecord(),
                contractKey: privateContract.publicKey,
                timestamp: Date.now(),
                signature: null
            };
            request.signature = await crypto.sign(JSON.stringify(request), privateContract.privateKeyObject);
            const hosts = this.database.getHosts(record.key, publicContract);
            await this.addRequest('put', record.key, request, hosts);
            this.on('put-request', async (message) => {
                // validate the contract request
                const request = message.data;
                const record = this.database.loadPackedRecord(request.record);
                const contract = JSON.parse(JSON.stringify(this.ledger.pendingContracts.get(crypto.getHash(request.contractKey))));
                const testRequest = await this.database.isValidPutRequest(record, contract, request);
                if (!testRequest.valid) {
                    this.sendPutResponse(message.sender, false, testRequest.reason, record.key);
                    return;
                }
                // validate the record
                const testValid = await record.isValid(message.sender);
                if (!testValid.valid) {
                    // this.rejectRequest(message.sender, 'put', false, testValid.reason, record.key)
                    this.sendPutResponse(message.sender, false, testValid.reason, record.key);
                    return;
                }
                // store the record, create PoR, and send reply
                await this.database.saveRecord(record, contract);
                const proof = record.createPoR(this.wallet.profile.user.id);
                this.sendPutResponse(message.sender, true, proof, record.key);
            });
            this.on('put-reply', async (message) => {
                const response = message.data;
                if (!response.valid) {
                    reject(new Error(response.reason));
                }
                const profile = this.wallet.getProfile();
                const contract = this.wallet.getPublicContract();
                // validate PoR
                const record = await this.database.getRecord(response.key);
                if (!record.isValidPoR(message.sender, response.reason)) {
                    reject(new Error('Host returned invalid proof of replication'));
                }
                // remove from pending requests and get size
                const pendingSize = this.getRequestSize('put', record.key);
                this.removeRequest('put', record.key, message.sender);
                const shardMap = this.database.getShardAndHostsForKey(record.key, contract);
                const hostLength = shardMap.hosts.length;
                // resolve on first valid response
                if (pendingSize === hostLength) {
                    const content = await record.getContent(shardMap.id, contract.replicationFactor, profile.privateKeyObject);
                    resolve(content.value);
                }
                // emit event and adjust contract when fully resolved
                if (pendingSize === 1) {
                    this.rev(contract.id, this.wallet.contract.state);
                    const hosts = this.resolveRequest('put', record.key);
                    this.emit('put', record.key, hosts);
                }
            });
        });
    }
    get(key) {
        return new Promise(async (resolve, reject) => {
            // get hosts and send requests
            const keyObject = this.database.parseRecordKey(key);
            const hosts = this.database.computeHostsforShards([keyObject.shardId], keyObject.replicationFactor)[0].hosts;
            const request = keyObject;
            await this.addRequest('get', keyObject.recordId, request, hosts);
            this.on('get-request', async (message) => {
                const request = message.data;
                // unpack key and validate request
                const record = await this.database.getRecord(request.recordId);
                const testRequest = await this.database.isValidGetRequest(record, request.shardId, request.replicationFactor);
                if (!testRequest.valid) {
                    this.sendGetResponse(message.sender, false, request.recordId, testRequest.reason);
                    return;
                }
                // send the record and PoR back to client
                const proof = record.createPoR(this.wallet.profile.user.id);
                this.sendGetResponse(message.sender, true, request.recordId, proof, record);
            });
            this.on('get-reply', async (message) => {
                const response = message.data;
                if (!response.valid) {
                    reject(new Error(response.reason));
                }
                const profile = this.wallet.getProfile();
                const contract = this.wallet.getPublicContract();
                // load/validate record and validate PoR
                const record = await this.database.loadPackedRecord(response.record);
                if (!record.isValidPoR(message.sender, response.reason)) {
                    reject(new Error('Host returned invalid proof of replication'));
                }
                // remove from pending requests and get size
                const pendingSize = this.getRequestSize('get', record.key);
                this.removeRequest('get', record.key, message.sender);
                const shardMap = this.database.getShardAndHostsForKey(record.key, contract);
                const hostLength = shardMap.hosts.length;
                // resolve on first valid response
                if (pendingSize === hostLength) {
                    const content = await record.getContent(shardMap.id, contract.replicationFactor, profile.privateKeyObject);
                    resolve(content.value);
                }
                // emit event and adjust contract when fully resolved
                if (pendingSize === 1) {
                    const hosts = this.resolveRequest('get', record.key);
                    this.emit('get', record.key, hosts);
                }
            });
        });
    }
    rev(key, update) {
        return new Promise(async (resolve, reject) => {
            const keyObject = this.database.parseRecordKey(key);
            const publicContract = this.wallet.getPublicContract();
            const privateContract = this.wallet.getPrivateContract();
            // get the old record and update
            const oldRecord = await this.database.getRecord(keyObject.recordId);
            if (oldRecord.value.immutable) {
                reject(new Error('Cannot update an immutable record'));
            }
            const newRecord = await this.database.revRecord(key, update);
            const sizeDelta = oldRecord.getSize() - newRecord.getSize();
            this.wallet.contract.updateRecord(key, sizeDelta);
            // create a rev request signed by contract key
            const request = {
                record: newRecord.getRecord(),
                contractKey: privateContract.publicKey,
                shardId: keyObject.shardId,
                timestamp: Date.now(),
                signature: null
            };
            request.signature = await crypto.sign(JSON.stringify(request), privateContract.privateKeyObject);
            // get hosts and send update requests
            const hosts = this.database.getHosts(key, publicContract);
            await this.addRequest('rev', key, request, hosts);
            this.on('rev-request', async (message) => {
                // load the request and new record
                const request = message.data;
                const newRecord = this.database.loadPackedRecord(request.record);
                const oldRecord = await this.database.getRecord(newRecord.key);
                const contract = JSON.parse(JSON.stringify(this.ledger.pendingContracts.get(crypto.getHash(request.contractKey))));
                const testRequest = await this.database.isValidRevRequest(oldRecord, newRecord, contract, request.shardId, request);
                if (!testRequest.valid) {
                    this.sendRevResponse(message.sender, false, testRequest.reason, newRecord.key);
                    return;
                }
                // validate the new record
                const testValid = await newRecord.isValid(message.sender);
                if (!testValid.valid) {
                    this.sendRevResponse(message.sender, false, testValid.reason, newRecord.key);
                    return;
                }
                const sizeDelta = oldRecord.getSize() - newRecord.getSize();
                // update the record, create PoR and send reply
                await this.database.saveRecord(newRecord, contract, true, sizeDelta);
                const proof = newRecord.createPoR(this.wallet.profile.user.id);
                await this.sendRevResponse(message.sender, true, proof, newRecord.key);
            });
            this.on('rev-reply', async (message) => {
                const response = message.data;
                if (!response.valid) {
                    reject(new Error(message.data.data));
                }
                const profile = this.wallet.getProfile();
                const contract = this.wallet.getPublicContract();
                // validate PoR
                const record = await this.database.getRecord(response.key);
                if (!record.isValidPoR(message.sender, response.reason)) {
                    reject(new Error('Host returned invalid proof of replication'));
                }
                // remove from pending requests and get size
                const pendingSize = this.getRequestSize('rev', record.key);
                this.removeRequest('rev', record.key, message.sender);
                const shardMap = this.database.getShardAndHostsForKey(record.key, contract);
                const hostLength = shardMap.hosts.length;
                // resolve on first valid response
                if (pendingSize === hostLength) {
                    const content = await record.getContent(shardMap.id, contract.replicationFactor, profile.privateKeyObject);
                    resolve(content);
                }
                // emit event and adjust contract when fully resolved
                if (pendingSize === 1) {
                    this.rev(contract.id, this.wallet.contract.state);
                    const hosts = this.resolveRequest('rev', record.key);
                    this.emit('rev', record.key, hosts);
                }
            });
        });
    }
    del(key) {
        return new Promise(async (resolve, reject) => {
            // get hosts and send requests
            const keyObject = this.database.parseRecordKey(key);
            const contract = this.wallet.getPrivateContract();
            const hosts = this.database.computeHostsforShards([keyObject.shardId], keyObject.replicationFactor)[0].hosts;
            // create a del request signed by contract key
            const request = {
                shardId: keyObject.shardId,
                recordId: keyObject.recordId,
                replicationFactor: keyObject.replicationFactor,
                contractKey: contract.publicKey,
                signature: null
            };
            request.signature = await crypto.sign(JSON.stringify(request), contract.privateKeyObject);
            await this.addRequest('del', keyObject.recordId, request, hosts);
            this.on('del-request', async (message) => {
                // unpack key and validate request
                const request = message.data;
                const record = await this.database.getRecord(request.recordId);
                const contract = JSON.parse(JSON.stringify(this.ledger.pendingContracts.get(crypto.getHash(request.contractKey))));
                const testRequest = await this.database.isValidDelRequest(record, contract, keyObject.shardId, request);
                if (!testRequest.valid) {
                    this.sendDelResponse(message.sender, false, testRequest.reason, request.recordId);
                    return;
                }
                // delete the record send PoD back to client
                await this.database.delRecord(record, request.shardId);
                const proof = record.createPoD(this.wallet.profile.user.id);
                await this.sendDelResponse(message.sender, true, proof, record.key);
            });
            this.on('del-reply', async (message) => {
                const response = message.data;
                if (!response.valid) {
                    reject(new Error(response.reason));
                }
                const contract = this.wallet.getPublicContract();
                const record = await this.database.getRecord(response.key);
                // load/validate record and validate PoD
                if (!record.isValidPoD(message.sender, response.reason)) {
                    reject(new Error('Host returned invalid proof of deletion'));
                }
                // remove from pending requests and get size
                const pendingSize = this.getRequestSize('del', record.key);
                this.removeRequest('del', record.key, message.sender);
                const shardMap = this.database.getShardAndHostsForKey(record.key, contract);
                const hostLength = shardMap.hosts.length;
                // resolve on first valid response
                if (pendingSize === hostLength) {
                    resolve();
                }
                // emit event and adjust contract when fully resolved
                if (pendingSize === 1) {
                    await this.storage.del(record.key);
                    await this.wallet.contract.removeRecord(key, record.getSize());
                    this.rev(contract.id, this.wallet.contract.state);
                    const hosts = this.resolveRequest('del', record.key);
                    this.emit('del', record.key, hosts);
                }
            });
        });
    }
    // core ledger and farming methods
    async startFarmer(blockTime) {
        // bootstrap or fetch the ledger before starting to farm the chain
        if (blockTime) {
            this.ledger.setBlockTime(blockTime);
        }
        if (this.bootstrap) {
            this.ledger.hasLedger = true;
            this.ledger.isFarming = true;
            await this.ledger.bootstrap();
        }
        else {
            await this.getLedger(blockTime);
            this.ledger.isFarming = true;
        }
    }
    async getLedger(blockTime) {
        // download the ledger until my last blockId matches gateway's, getting all cleared blocks (headers and txs)
        let myLastBlockId = this.ledger.getLastBlockId();
        let gatewayLastBlockId = await this.getLastBlockId();
        let previousBlockRecord = null;
        while (myLastBlockId !== gatewayLastBlockId) {
            console.log('Getting ledger segment');
            previousBlockRecord = await this.getLedgerSegment(myLastBlockId);
            myLastBlockId = this.ledger.getLastBlockId();
            gatewayLastBlockId = await this.getLastBlockId();
        }
        console.log('Got full ledger');
        this.ledger.hasLedger = true;
        await this.onLedger(blockTime, previousBlockRecord);
    }
    getLastBlockId() {
        return new Promise(async (resolve, reject) => {
            // rpc method to retrieve the last block id (head) of the ledger from a gateway node
            const request = await this.network.createGenericMessage('last-block-id-request');
            const gateway = this.network.getGateways()[0];
            await this.network.send(gateway, request);
            this.once('last-block-id-reply', async (blockId) => {
                resolve(blockId);
            });
        });
    }
    async getLedgerSegment(myLastBlockId) {
        // fetch a segment of the ledger based on the current state of the chain from a gateway
        const chain = await this.getChain();
        let previousBlockRecord = null;
        if (!myLastBlockId) {
            // get the chain from genesis block 
            console.log('getting chain from genesis block');
            for (const blockId of chain) {
                previousBlockRecord = await this.getLastBlock(blockId, previousBlockRecord);
            }
        }
        else {
            // get the chain from my last block 
            function findBlockId(blockId) {
                return blockId === myLastBlockId;
            }
            const myLastBlockIndex = chain.findIndex(findBlockId);
            const previousBlockValue = JSON.parse(JSON.stringify(this.ledger.clearedBlocks.get(myLastBlockId)));
            previousBlockRecord = database_1.Record.readUnpacked(myLastBlockId, previousBlockValue);
            let blockId = null;
            console.log('getting chain from block: ', myLastBlockId);
            for (let i = myLastBlockIndex + 1; i <= chain.length; i++) {
                blockId = chain[i];
                if (blockId) {
                    previousBlockRecord = await this.getLastBlock(blockId, previousBlockRecord);
                }
            }
        }
        myLastBlockId = previousBlockRecord.key;
        return previousBlockRecord;
    }
    getChain() {
        return new Promise(async (resolve, reject) => {
            // rpc method to fetch the chain (array of blockHeaderIds) from a gateway node
            const request = await this.network.createGenericMessage('chain-request');
            const gateway = this.network.getGateways()[0];
            await this.send(gateway, request);
            this.once('chain-reply', async (chain) => {
                resolve(chain);
            });
        });
    }
    async getLastBlock(blockId, previousBlockRecord) {
        // fetches and validates each block header and tx for a given block, applying the block if all are valid
        const blockRecord = await this.getBlockHeader(blockId);
        const blockRecordTest = await blockRecord.isValid();
        if (!blockRecordTest.valid) {
            throw new Error(blockRecordTest.reason);
        }
        const block = new ledger_1.Block(blockRecord.value.content);
        // validate block
        if (!block.value.previousBlock) {
            // genesis block
            const genesisTest = await block.isValidGenesisBlock(blockRecord);
            if (!genesisTest.valid) {
                throw new Error(genesisTest.reason);
            }
        }
        else {
            // normal block
            const blockTest = await block.isValid(blockRecord, { key: previousBlockRecord.key, value: previousBlockRecord.value.content });
            if (!blockTest.valid) {
                throw new Error(blockTest.reason);
            }
        }
        for (const txId of block.value.txSet) {
            const txRecord = await this.getTx(txId);
            // validate the tx record
            const txRecordTest = await txRecord.isValid();
            if (!txRecordTest.valid) {
                throw new Error(txRecordTest.reason);
            }
            // then validate the tx data
            const txTest = await this.ledger.onTx(txRecord);
            if (!txTest.valid) {
                console.log(txId, txRecord);
                throw new Error(txTest.reason);
            }
        }
        // apply block 
        await this.ledger.applyBlock(blockRecord);
        return blockRecord;
    }
    getBlockHeader(blockId) {
        return new Promise(async (resolve, reject) => {
            // RPC method to get a cleared block header from a gateway node
            const request = await this.network.createGenericMessage('block-header-request', blockId);
            const gateway = this.network.getGateways()[0];
            this.network.send(gateway, request);
            this.once('block-header-reply', async (block) => {
                if (block) {
                    this.storage.put(block.key, JSON.stringify(block.value));
                    const blockRecord = database_1.Record.readPacked(block.key, block.value);
                    await blockRecord.unpack(null);
                    resolve(blockRecord);
                }
                else {
                    reject(new Error('Node does not have block'));
                }
            });
        });
    }
    getTx(txId) {
        return new Promise(async (resolve, reject) => {
            // rpc method to get a cleared tx from a gateway node
            const request = await this.network.createGenericMessage('tx-request', txId);
            const gateway = this.network.getGateways()[0];
            this.network.send(gateway, request);
            this.once('tx-reply', async (tx) => {
                if (tx) {
                    this.storage.put(tx.key, JSON.stringify(tx.value));
                    const txRecord = database_1.Record.readPacked(tx.key, tx.value);
                    await txRecord.unpack(null);
                    resolve(txRecord);
                }
                else {
                    reject(new Error('Node does not have tx'));
                }
            });
        });
    }
    async onLedger(blockTime, previousBlockRecord) {
        // called once all cleared blocks have been fetched
        // checks for the best pending block then starts the block interval based on last block publish time
        // modify hasLedger to listen for new tx now 
        // start the block interval timer based on time remaining on the last cleared block 
        // the pending block is not being applied to the ledger before the next block is gossiped 
        // contract tx is created in applyBlock, but only if farming 
        // when fetching the ledger, reward and contract tx should be created on getting a new block, not recreated
        // is the contract for the last block fetched being created, so that their will be a contract for the next block 
        // wouldn't start time always be set from the last cleared block?
        // the interval should always be reset based on the last cleared block, each time 
        // block time will be variable based on the delay
        // but the most valid block cannot be determined until the delay has expired
        // each local proposed block is not created until the delay for the best solution expires 
        // the block is gosssiped but not applied until the full interval expires 
        // the full interval should always carry forward from the genesis block 
        // genesis time should be included in each block 
        const genesisTime = await this.getGenesisTime();
        const chainLength = this.ledger.chain.length;
        const stopTime = genesisTime + (chainLength * blockTime);
        const timeRemaining = stopTime - Date.now();
        setTimeout(async () => {
            // apply the best solution 
            const blockId = this.ledger.validBlocks[0];
            if (blockId) {
                const blockValue = this.ledger.pendingBlocks.get(blockId);
                const blockRecord = database_1.Record.readUnpacked(blockId, JSON.parse(JSON.stringify(blockValue)));
                await this.ledger.applyBlock(blockRecord);
            }
        }, timeRemaining);
        await this.getPendingBlock();
        // create the contract tx for the last block 
    }
    async getGenesisTime() {
        // get the 
        const genesisBlockId = this.ledger.chain[0];
        const genesisBlock = JSON.parse(await this.storage.get(genesisBlockId));
        const genesisRecord = database_1.Record.readUnpacked(genesisBlockId, genesisBlock);
        return genesisRecord.value.createdAt;
    }
    async getPendingBlock() {
        const pendingBlockHeader = await this.getPendingBlockHeader();
        if (pendingBlockHeader) {
            if (!this.ledger.pendingBlocks.has(pendingBlockHeader.key)) {
                // fetch each tx from gateway mem pool 
                console.log(pendingBlockHeader.value.content.txSet);
                for (const txId of pendingBlockHeader.value.content.txSet) {
                    const pendingTxRecord = await this.getPendingTx(txId);
                    const txRecordTest = await pendingTxRecord.isValid();
                    // validate the tx record
                    if (!txRecordTest.valid) {
                        throw new Error(txRecordTest.reason);
                    }
                    // then validate the tx data
                    const txTest = await this.ledger.onTx(pendingTxRecord);
                    if (!txTest.valid) {
                        throw new Error(txTest.reason);
                    }
                }
                // validate the block which adds to pendingBlocks if valid and best solution
                const blockRecordTest = await this.ledger.onBlock(pendingBlockHeader);
                if (!blockRecordTest.valid) {
                    throw new Error(blockRecordTest.reason);
                }
            }
        }
    }
    async getPendingBlockHeader() {
        return new Promise(async (resolve, reject) => {
            // rpc method to fetch the most valid pending block from a gateway node
            const request = await this.network.createGenericMessage('pending-block-header-request');
            const gateway = this.network.getGateways()[0];
            this.network.send(gateway, request);
            this.once('pending-block-header-reply', async (pendingBlock) => {
                if (pendingBlock) {
                    const pendingBlockRecord = database_1.Record.readPacked(pendingBlock.key, pendingBlock.value);
                    await pendingBlockRecord.unpack(null);
                    resolve(pendingBlockRecord);
                }
                resolve();
            });
        });
    }
    async getPendingTx(txId) {
        return new Promise(async (resolve, reject) => {
            // rpc method to fetch a pending tx from a gateway node
            const request = await this.network.createGenericMessage('pending-tx-request', txId);
            const gateway = this.network.getGateways()[0];
            this.network.send(gateway, request);
            this.once('pending-tx-reply', async (pendingTx) => {
                const pendingTxRecord = database_1.Record.readPacked(pendingTx.key, pendingTx.value);
                await pendingTxRecord.unpack(null);
                resolve(pendingTxRecord);
            });
        });
    }
    stopFarmer() {
        this.ledger.isFarming = false;
    }
    // host methods
    async joinHosts(count) {
        // after seeding and pledging space, join the host network 
        // should add a delay or ensure the tx has been anchored in the ledger 
        // assumes the host already has an entry into the tracker
        // first host
        // bootstraps an empty tracker
        // seeds plot and pledges to the ledger
        // adds their own entry 
        // second host
        // fetches the tracker
        // seed plot and pledges space
        // connects to first host as neighbor 
        // receives the neighbor proof
        // gossips join proof as single neighbor proof
        // third host
        // fourth host 
        const pledge = this.wallet.profile.pledge;
        if (!pledge) {
            throw new Error('Cannot join host network without first submitting a pledge tx');
        }
        const profile = this.wallet.getProfile();
        const promises = [];
        // connect to all valid neighbors 
        const activeHosts = this.tracker.getActiveHosts();
        this.neighbors = new Set([...this.tracker.getNeighbors(profile.id, activeHosts, count)]);
        console.log('\n Connecting to', this.neighbors.size, 'closest hosts, out of ', this.tracker.lht.size, 'active hosts.\n', this.neighbors);
        for (const nodeId of this.neighbors) {
            promises.push(this.connectToNeighbor(nodeId));
        }
        // get all of my assigned shards, an expensive, (hoepfully) one-time operation 
        for (const [recordId, original] of this.ledger.clearedContracts) {
            const contract = JSON.parse(JSON.stringify(original));
            const shards = this.database.computeShardArray(contract.contractId, contract.replicationFactor);
            for (const shardId of shards) {
                const hosts = this.database.computeHostsforShards([shardId], contract.replicationFactor)[0].hosts;
                if (hosts.includes(profile.id)) {
                    const furthestHost = hosts[hosts.length - 1];
                    promises.push(this.getShard(furthestHost, shardId, recordId));
                }
            }
        }
        await Promise.all(promises);
        // compile signatures, create and gossip the join messsage 
        const publicIP = `${this.network.myAddress}:${this.network.myTcpPort}:${this.network.myWsPort}`;
        const signatures = [...this.neighborProofs.values()];
        const joinMessage = await this.tracker.createJoinMessage(publicIP, this.isGateway, signatures);
        await this.network.gossip(joinMessage);
        this.tracker.updateEntry(joinMessage.data);
        this.isHosting = true;
        this.emit('joined-hosts');
    }
    async connectToNeighbor(nodeId) {
        return new Promise(async (resolve, reject) => {
            // send a connection request to a valid neighbor
            const pledgeTxId = this.wallet.profile.pledge.pledgeTx;
            const request = { pledgeTxId };
            const requestMessage = await this.network.createGenericMessage('neighbor-request', request);
            await this.network.send(nodeId, requestMessage);
            this.once('neighbor-reply', (response, sender) => {
                // check if request accpeted
                if (!response.valid) {
                    reject(new Error(response.reason));
                }
                // update my neighbors
                this.neighbors.add(sender);
                this.neighborProofs.set(sender, JSON.parse(JSON.stringify(response.proof)));
                resolve();
            });
        });
    }
    async getShard(nodeId, shardId, contractRecordId) {
        return new Promise(async (resolve, reject) => {
            // get shard from another host after joining the host network
            // corner case, what if two hosts try to take over the same shard at the same time?
            const request = { shardId, contractRecordId };
            await this.addRequest('shard', shardId, request, [nodeId]);
            this.once('shard-reply', async (response) => {
                // throw error on invalid request
                if (!response.valid) {
                    reject(new Error(response.reason));
                }
                // valid response
                this.resolveRequest('shard', response.shardId);
                // later fetch the merkle hash of the shard from contract state to validate return data
                // or get the record index from contract state  and validate each record 
                // create the shard 
                await this.database.createShard(response.shardId, response.contractId);
                for (const record of response.records) {
                    // save the record to disk and update shard
                    await this.storage.put(record.key, JSON.stringify(record.value));
                    await this.database.putRecordInShard(request.shardId, record);
                }
                resolve();
            });
        });
    }
    async replicateShards(nodeId) {
        // derive all shards for this host and see if I am the next closest host
        const profile = this.wallet.getProfile();
        for (const [recordId, original] of this.ledger.clearedContracts) {
            const contract = JSON.parse(JSON.stringify(original));
            const shards = this.database.computeShardArray(contract.contractId, contract.replicationFactor);
            for (const shardId of shards) {
                const hosts = this.database.computeHostsforShards([shardId], contract.replicationFactor + 1)[0].hosts;
                // if we are both in the enlarged host array 
                if (hosts.includes(nodeId) && hosts.includes(profile.id)) {
                    // and I am last host
                    if (hosts[hosts.length - 1] === profile.id) {
                        // get the shard from the first host
                        this.getShard(hosts[0], shardId, recordId);
                    }
                }
            }
        }
    }
    async leaveHosts() {
        // leave the host network gracefully, disconnecting from all valid neighbors
        const message = await this.tracker.createLeaveMessage();
        await this.network.gossip(message);
        this.isHosting = false;
        this.neighbors.clear;
        await this.network.leaveHosts();
    }
}
exports.default = Subspace;
//# sourceMappingURL=subspace.js.map