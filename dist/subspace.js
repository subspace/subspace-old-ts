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
const tracker_1 = __importDefault(require("@subspace/tracker"));
const ledger_1 = require("@subspace/ledger");
const database_1 = require("@subspace/database");
const DEFAULT_PROFILE_NAME = 'name';
const DEFAULT_PROFILE_EMAIL = 'name@name.com';
const DEFAULT_PROFILE_PASSPHRASE = 'passphrase';
const DEFAULT_HOST_PLEDGE = 10000000000; // 10 GB in bytes
const DEFAULT_HOST_INTERVAL = 2628000000; // 1 month in ms
const DEFAULT_GATEWAY_NODES = [];
const DEFAULT_GATEWAY_COUNT = 1;
const DEFAULT_CONTRACT_NAME = 'key';
const DEFAULT_CONTRACT_EMAIL = 'key@key.com';
const DEFAULT_CONTRACT_PASSPHRASE = 'lockandkey';
const DEFAULT_CONTRACT_SIZE = 1000000000; // 1 GB in bytes
const DEFAULT_CONTRACT_TTL = 2628000000; // 1 month in ms
const DEFAULT_CONTRACT_REPLICATION_FACTOR = 2;
class Subspace extends events_1.default {
    constructor(name = DEFAULT_PROFILE_NAME, email = DEFAULT_PROFILE_EMAIL, passphrase = DEFAULT_CONTRACT_PASSPHRASE, pledge = null, interval = null, bootstrap = false, gateway_nodes = DEFAULT_GATEWAY_NODES, gateway_count = DEFAULT_GATEWAY_COUNT, delegated = false) {
        super();
        this.name = name;
        this.email = email;
        this.passphrase = passphrase;
        this.pledge = pledge;
        this.interval = interval;
        this.bootstrap = bootstrap;
        this.gateway_nodes = gateway_nodes;
        this.gateway_count = gateway_count;
        this.delegated = delegated;
        this.isInit = false;
        this.env = '';
        this.storage_adapter = '';
        this.pendingRequests = new Map();
    }
    async addRequest(type, recordId, data, hosts) {
        // generate and send the request
        const message = await this.network.createGenericMessage(`${type}-request`, data);
        for (const host of hosts) {
            await this.network.send(host, message);
        }
        // add the requests and copy to pending
        this.pendingRequests.set(crypto.getHash(type + recordId), hosts);
        this.pendingRequests.set(crypto.getHash(recordId + type), hosts);
    }
    async removeRequest(type, recordId, host) {
        const key = crypto.getHash(type + recordId);
        const request = this.pendingRequests.get(key);
        this.pendingRequests.delete(host);
        this.pendingRequests.set(key, request);
    }
    resolveRequest(type, recordId) {
        this.pendingRequests.delete(crypto.getHash(type + recordId));
        const copyKey = crypto.getHash(recordId + type);
        const hosts = this.pendingRequests.get(copyKey);
        this.pendingRequests.delete(copyKey);
        return hosts;
    }
    // this.requests.respond('put', false, testRequest.reason, record.key)
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
        return this.pendingRequests.get(crypto.getHash(type + recordId)).length;
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
    async init() {
        if (this.init)
            return;
        // determine the node env
        await this.initEnv();
        // determine the storage adapter
        if (this.env === 'browser') {
            this.storage_adapter = 'browser';
        }
        else {
            this.storage_adapter = 'node';
        }
        this.storage = new storage_1.default(this.storage_adapter);
        // init the profile
        // if no profile, will create a new default profile
        // if args, will create a new profile from args
        // if existing profile, will load from disk
        this.wallet = new wallet_1.default(this.storage);
        await this.wallet.init();
        this.setPaymentTimer();
        // tracker 
        this.tracker = new tracker_1.default(this.storage);
        // ledger 
        this.ledger = new ledger_1.Ledger(this.storage, this.wallet);
        this.ledger.on('block-solution', async (block) => {
            const blockMessage = await this.network.createGenericMessage('block', block);
            this.network.gossip(blockMessage);
            this.emit('block', block);
        });
        // database
        this.database = new database_1.DataBase(this.storage, this.wallet);
        // network
        this.network = new network_1.default(this.bootstrap, this.gateway_nodes, this.gateway_count, this.delegated, this.wallet, this.tracker, this.env);
        this.network.on('join', () => this.emit('join'));
        this.network.on('leave', () => this.emit('leave'));
        this.network.on('connection', connection => this.emit('connection', connection.node_id));
        this.network.on('disconnection', connection => this.emit('disconnection', connection.node_id));
        this.network.on('message', async (message) => {
            let valid = false;
            // handle validation for gossiped messages here
            // specific rpc methods are emitted and handled in corresponding parent method
            switch (message.type) {
                case ('pending-join'):
                    break;
                case ('full-join'):
                    break;
                case ('leave'):
                    break;
                case ('failure'):
                    break;
                case ('tx'):
                    // first ensure we have a valid SSDB record wrapping the tx
                    const txRecord = database_1.Record.readUnpacked(message.data.key, message.data.value);
                    const txRecordTest = await txRecord.isValid();
                    if (txRecordTest.valid) {
                        // then validate the tx data
                        const txTest = await this.ledger.onTx(txRecord);
                        if (txTest.valid) {
                            const txMessage = await this.network.createGenericMessage('tx', message.data);
                            this.network.gossip(txMessage);
                            this.emit('tx', txRecord);
                        }
                    }
                    break;
                case ('block'):
                    // first validate the immutable record on SSDB
                    const blockRecord = database_1.Record.readUnpacked(message.data.key, message.data.value);
                    const blockRecordTest = await blockRecord.isValid();
                    if (blockRecordTest.valid) {
                        // extract the block data and validate that in ledger
                        const blockTest = await this.ledger.onBlock(blockRecord);
                        if (blockTest.valid) {
                            const blockMessage = await this.network.createGenericMessage('block', message.data);
                            this.network.gossip(blockMessage);
                            this.emit('block', blockRecord);
                        }
                    }
                    break;
                default:
                    this.emit(message.type, message.data);
            }
        });
        this.isInit = true;
        this.emit('ready');
    }
    async createProfile(options) {
        // create a new subspace identity 
        await this.wallet.createProfile(options);
    }
    async deleteProfile() {
        // deletes the existing profile on disk
        await this.wallet.profile.clear();
    }
    // core network methods
    async join() {
        // join the subspace network as a node
        await this.init();
        const joined = await this.network.join();
        if (joined) {
            this.emit('connected');
        }
        else {
            throw new Error('Error joining network');
        }
    }
    async leave() {
        await this.network.leave();
        this.emit('disconnected');
    }
    async connect(nodeId) {
        const connection = await this.network.connect(nodeId);
        this.emit('connection', connection);
    }
    async disconnect(nodeId) {
        await this.network.disconnect(nodeId);
        this.emit('disconnected');
    }
    async send(nodeId, message) {
        const sent = await this.network.send(nodeId, message);
        if (!sent) {
            throw new Error('Error sending message');
        }
    }
    // ledger tx methods
    async seedPlot(size) {
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
        const txRecord = await this.ledger.createCreditTx(profile.id, address, amount);
        const txMessage = await this.network.createGenericMessage('tx', txRecord.getRecord());
        this.network.gossip(txMessage);
        // should emit an event when tx is confirmed, later
        return txRecord;
    }
    async pledgeSpace(interval) {
        // creates and submits a pledges as a proof of space to the ledger as a host
        if (!this.wallet.profile.proof) {
            throw new Error('You must first seed your plot');
        }
        const profile = this.wallet.getProfile();
        const pledge = this.wallet.profile.proof.size;
        const txRecord = await this.ledger.createPledgeTx(profile.publicKey, pledge, interval);
        const txMessage = await this.network.createGenericMessage('tx', txRecord.getRecord());
        this.wallet.profile.pledge = {
            proof: this.wallet.profile.proof.id,
            size: pledge,
            interval: interval,
            createdAt: Date.now(),
            pledgeTx: txRecord.key
        };
        this.setPaymentTimer();
        // corresponding code for on('pledge')
        // should emit an event when tx is confirmed 
        this.network.gossip(txMessage);
        return txRecord;
    }
    setPaymentTimer() {
        // called on init 
        const pledge = this.wallet.profile.pledge;
        if (pledge.interval) {
            const timeout = (pledge.createdAt + pledge.interval) - Date.now();
            setTimeout(() => {
                this.requestHostPayment();
            }, timeout);
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
        // tx will be saved on apply tx 
        // contract record does not need to be saved directly
        // state is already being saved in the wallet contract object 
        // each host will hold the state
        // when we send an update it should only inlcude the new state
        // create the immutable contract tx and tx record, with included contract signature
        const txRecord = await this.ledger.createMutableContractTx(spaceReserved, replicationFactor, ttl, contractSig);
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
                const contract = this.ledger.pendingContracts.get(crypto.getHash(contractState.key));
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
                    reject(new Error(message.data.description));
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
                const contract = this.ledger.pendingContracts.get(crypto.getHash(request.contractKey));
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
                const contract = this.ledger.pendingContracts.get(crypto.getHash(request.contractKey));
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
                const contract = this.ledger.pendingContracts.get(crypto.getHash(request.contractKey));
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
    // ledger data methods
    getLastBlockId() {
        return new Promise(async (resolve, reject) => {
            const request = await this.network.createGenericMessage('last-block-id-request');
            const gateway = this.network.getGateways()[0];
            await this.network.send(gateway, request);
            this.on('last-block-id-request', async (message) => {
                const lastBlockId = this.ledger.getLastBlockId();
                const response = await this.network.createGenericMessage('last-block-id-reply', lastBlockId);
                await this.network.send(message.sender, response);
            });
            this.on('last-block-id-reply', async (message) => {
                resolve(message.data);
            });
        });
    }
    getChain() {
        return new Promise(async (resolve, reject) => {
            const request = await this.network.createGenericMessage('chain-request');
            const gateway = this.network.getGateways()[0];
            await this.network.send(gateway, request);
            this.on('chain-request', async (message) => {
                const chain = this.ledger.chain;
                const response = await this.network.createGenericMessage('chain-reply', chain);
                await this.network.send(message.sender, response);
            });
            this.on('chain-reply', async (message) => {
                resolve(message.data);
            });
        });
    }
    getBlockHeader(blockId) {
        return new Promise(async (resolve, reject) => {
            const request = await this.network.createGenericMessage('block-header-request', blockId);
            const gateway = this.network.getGateways()[0];
            this.network.send(gateway, request);
            this.on('block-header-request', async (message) => {
                const blockValue = JSON.parse(await this.storage.get(message.data));
                const block = database_1.Record.readPacked(blockId, blockValue);
                const response = await this.network.createGenericMessage('block-header-reply', block);
                await this.network.send(message.sender, response);
            });
            this.on('block-header-reply', async (message) => {
                if (message.data) {
                    const block = message.data;
                    this.storage.put(block.key, JSON.stringify(block.value));
                    await block.unpack(null);
                    resolve(block);
                }
                else {
                    reject(new Error('Node does not have block'));
                }
            });
        });
    }
    getTx(txId) {
        return new Promise(async (resolve, reject) => {
            const request = await this.network.createGenericMessage('tx-request', txId);
            const gateway = this.network.getGateways()[0];
            this.network.send(gateway, request);
            this.on('tx-request', async (message) => {
                const txValue = JSON.parse(await this.storage.get(message.data));
                const tx = database_1.Record.readPacked(txId, txValue);
                const response = await this.network.createGenericMessage('tx-reply', tx);
                await this.network.send(message.sender, response);
            });
            this.on('tx-reply', async (message) => {
                if (message.data) {
                    const tx = message.data;
                    this.storage.put(tx.key, JSON.stringify(tx.value));
                    await tx.unpack(null);
                    resolve(tx);
                }
                else {
                    reject(new Error('Node does not have tx'));
                }
            });
        });
    }
    async getLastBlock(blockId, previousBlockRecord) {
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
                throw new Error(txTest.reason);
            }
        }
        // apply block 
        await this.ledger.applyBlock(blockRecord);
        return blockRecord;
    }
    async getLedger() {
        // start downloading the ledger
        let myLastBlockId = this.ledger.getLastBlockId();
        const chain = await this.getChain();
        let previousBlockRecord = null;
        if (!myLastBlockId) {
            // get the chain from genesis block 
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
            const previousBlockValue = this.ledger.clearedBlocks.get(myLastBlockId);
            previousBlockRecord = database_1.Record.readUnpacked(myLastBlockId, previousBlockValue);
            let blockId = null;
            for (let i = myLastBlockIndex + 1; i <= chain.length; i++) {
                blockId = chain[i];
                previousBlockRecord = await this.getLastBlock(blockId, previousBlockRecord);
            }
        }
    }
    // farmer methods
    async startFarmer() {
        if (this.bootstrap) {
            await this.ledger.bootstrap();
        }
        else {
            await this.getLedger();
        }
        this.ledger.hasLedger = true;
        this.ledger.isFarming = true;
    }
    stopFarmer() {
        this.ledger.isFarming = false;
    }
    // host methods
    joinHosts() {
        // requirements
        // created a pledge
        // submitted the pledge tx to the chain 
        // 
        // join the network as a valid host with a pledge
        return new Promise(async (resolve, reject) => {
            try {
                // need a valid pledge
                // gossip join to the network
                // determine my valid neighbors
                // connect to each neighbor
                // determine my valid neighbors from the tracker
                // open a direct connection with each neighbor (socket may vary)
                // monitor connections and vote on failures
                // node must gossip plegde to all nodes (as pending) to alert indirect neighbors
                // nodde must initiate connection with first m/2 neighbors
                // node must wait for connection from second m/2 neighbors as pending join spreads
                // once 2/3 of neighbors agree node has joined, the full proof is gossiped
                // corresponding code for on('join-request')
                resolve();
            }
            catch (error) {
                this.emit('error', error);
                reject(error);
            }
        });
    }
    leaveHosts() {
        // gracefully leave the network as a valid host
    }
}
exports.default = Subspace;
//# sourceMappingURL=subspace.js.map