import EventEmitter from 'events'
import * as crypto from '@subspace/crypto'
import Wallet from '@subspace/wallet'
import Storage from '@subspace/storage'
import Network from '@subspace/network'
import {Tracker} from '@subspace/tracker'
import {Ledger, Block} from '@subspace/ledger'
import {DataBase, Record, IValue} from '@subspace/database'
import {IGenericMessage, IGatewayNodeObject, IConnectionObject } from '@subspace/network/dist/interfaces';
import { IRecordObject, IPutRequest, IRevRequest, IDelRequest, IPutResponse, IGetResponse, IRevResponse, IDelResponse, IGetRequest, IContractRequest, IContractResponse, INeighborProof, INeighborResponse, INeighborRequest, IShardRequest, IShardResponse, IPendingFailure } from './interfaces';
import { IKey, IContract, IContractData, IPledge } from '@subspace/wallet/dist/interfaces';
import { IMessage, IHostMessage, IEntryObject, IJoinObject, ILeaveObject, IFailureObject, ISignatureObject } from '@subspace/tracker/dist/interfaces';
import { message } from 'openpgp';
import { promises } from 'fs';

const DEFAULT_PROFILE_NAME = 'name'
const DEFAULT_PROFILE_EMAIL = 'name@name.com'
const DEFAULT_PROFILE_PASSPHRASE = 'passphrase'
const DEFAULT_HOST_PLEDGE = 10000000000 // 10 GB in bytes
const DEFAULT_HOST_INTERVAL = 2628000000 // 1 month in ms
const DEFAULT_GATEWAY_NODES: IGatewayNodeObject[] = []
const DEFAULT_GATEWAY_COUNT = 1
const DEFAULT_CONTRACT_NAME = 'key'
const DEFAULT_CONTRACT_EMAIL = 'key@key.com'
const DEFAULT_CONTRACT_PASSPHRASE = 'lockandkey'
const DEFAULT_CONTRACT_SIZE = 1000000000  // 1 GB in bytes
const DEFAULT_CONTRACT_TTL = 2628000000   // 1 month in ms
const DEFAULT_CONTRACT_REPLICATION_FACTOR = 2

export default class Subspace extends EventEmitter {


  public isInit = false
  public env = ''
  public storageAdapter = ''
  public storage: Storage
  public network: Network
  public wallet: Wallet
  public tracker: Tracker
  public database: DataBase
  public ledger: Ledger
  public pendingRequests: Map<string, Set<string>> = new Map()
  public messages: Map<string, number> = new Map()
  public neighbors: Set <string> = new Set()
  public neighborProofs: Map <string, INeighborProof> = new Map()
  public failedNeighbors: Map<string, boolean> = new Map()
  public pendingFailures: Map<string, IPendingFailure> = new Map()
  public evictedShards: Map <string, Set<string>> = new Map()
  public isHosting = false

  constructor(
    public name = DEFAULT_PROFILE_NAME,
    public email = DEFAULT_PROFILE_EMAIL,
    public passphrase = DEFAULT_CONTRACT_PASSPHRASE,
    public pledge: IPledge = null,
    public interval: number = null,
    public bootstrap = false, 
    public gateway_nodes = DEFAULT_GATEWAY_NODES,
    public gateway_count = DEFAULT_GATEWAY_COUNT, 
    public delegated = false
  ) {
    super()
  }

  private async addRequest(type: string, recordId: string, data: any, hosts: string[]) {
    // generate and send the request
    const message: IGenericMessage = await this.network.createGenericMessage(`${type}-request`, data)
    for (const host of hosts) {
      await this.network.send(host, message)
    }
    const hostSet = new Set([...hosts])
    // add the requests and copy to pending
    this.pendingRequests.set(crypto.getHash(type + recordId), hostSet)
    this.pendingRequests.set(crypto.getHash(recordId + type), hostSet)
  }

  private async removeRequest(type: string, recordId: string, host: string) {
    const key = crypto.getHash(type + recordId)
    const request = this.pendingRequests.get(key)
    request.delete(host)
    this.pendingRequests.set(key, request)
  }

  private resolveRequest(type: string, recordId: string) {
    this.pendingRequests.delete(crypto.getHash(type + recordId))
    const copyKey = crypto.getHash(recordId + type)
    const hosts = this.pendingRequests.get(copyKey)
    this.pendingRequests.delete(copyKey)
    return hosts
  }
  
  private async sendPutResponse(client: string, valid: boolean, reason: string, key: string) {
    const response: IPutResponse = { valid, reason, key}
    const message: IGenericMessage = await this.network.createGenericMessage('put-reply', response)
    this.network.send(client, message)
  }

  private async sendGetResponse(client: string, valid: boolean, key: string, reason: string, record?: IRecordObject) {
    const response: IGetResponse = { valid, key, reason, record}
    const message: IGenericMessage = await this.network.createGenericMessage('get-reply', response)
    this.network.send(client, message)
  }

  private async sendRevResponse(client: string, valid: boolean, reason: string, key: string) {
    const response: IRevResponse = { valid, reason, key}
    const message: IGenericMessage = await this.network.createGenericMessage('rev-reply', response)
    this.network.send(client, message)
  }

  private async sendDelResponse(client: string, valid: boolean, reason: string, key: string) {
    const response: IDelResponse = { valid, reason, key}
    const message: IGenericMessage = await this.network.createGenericMessage('del-reply', response)
    this.network.send(client, message)
  }

  private async sendContractResponse(client: string, valid: boolean, reason: string, key: string) {
    const response: IContractResponse = { valid, reason, key}
    const message: IGenericMessage = await this.network.createGenericMessage('contract-reply', response)
    this.network.send(client, message)
  }

  private getRequestSize(type: string, recordId: string) {
    return this.pendingRequests.get(crypto.getHash(type + recordId)).size
  }

  private startMessagePruner() {
    // expire all messages older than 10 minutes, every 10 minutes
    setInterval(() => {
      const cutoffTime = Date.now() - 600000
      this.messages.forEach((timestamp, message) => {
        if (timestamp <= cutoffTime) {
          this.messages.delete(message)
        }
      })
    }, 600000)
  }

  private isGateway() {
    const profile = this.wallet.getProfile()
    const nodeIds = this.gateway_nodes.map(node => node.nodeId)
    return nodeIds.includes(profile.id)
  }
  
  private async initEnv() {
    if (typeof window !== 'undefined') {
      console.log('Browser env detected')
      this.env = 'browser' 
    } else if (await this.network.isIpPublic()) {
      console.log('Gateway env detected')
      this.env = 'gateway'
    } else {
      // else 'node' | 'bitbot' | 'desktop' | 'mobile'
      console.log('Private host env detected')
      this.env = 'private-host'
    }
  }
  
  private async init() {
    if (this.init) return

    // determine the node env
    await this.initEnv()

    // determine the storage adapter
    if (this.env === 'browser') {
      this.storageAdapter = 'browser'
    } else {
      this.storageAdapter = 'node'
    }

    this.storage = new Storage(this.storageAdapter)

    // init the profile
      // if no profile, will create a new default profile
      // if args, will create a new profile from args
      // if existing profile, will load from disk

    this.wallet = new Wallet(this.storage)
    await this.wallet.init()
    this.setPaymentTimer()

    // ledger 
    this.ledger = new Ledger(this.storage, this.wallet)

    this.ledger.on('block-solution', async (block: Record) => {
      const blockMessage = await this.network.createGenericMessage('block', block)
      this.network.gossip(blockMessage)
      this.emit('block', block)
    })

    // tracker 
    this.tracker = new Tracker(this.storage, this.wallet, this.ledger)

    this.on('tx', (txRecord: Record) => {
      // on valid pledge tx, add new inactive host entry into the tracker
      if (txRecord.value.content.type === 'pledge') {
        this.tracker.addEntry(txRecord)
      }

      if(txRecord.value.content.type === 'contract') {
        // compute shards
        // for each shard
          // see if I am closest host
          // if closest, initialize the shard
      }
    })

    // database
    this.database = new DataBase(this.storage, this.wallet)
    
    // network
    this.network = new Network(
      this.bootstrap, 
      this.gateway_nodes, 
      this.gateway_count, 
      this.delegated, 
      this.wallet,
      this.tracker,
      this.env
    )

    // prune messages every 10 minutes
    this.startMessagePruner()

    this.network.on('join', () => this.emit('join'))
    this.network.on('leave', () => this.emit('leave'))
    this.network.on('connection', connection => this.emit('connection', connection.node_id))

    this.network.on('disconnection', (connection: IConnectionObject) => {
      this.emit('disconnection', connection.nodeId)
    })
    
    
    this.network.on('message', async (message) => {
      let valid = false
      // handle validation for gossiped messages here
      // specific rpc methods are emitted and handled in corresponding parent method

      // prevent revalidating and regoissiping the same messages
      const messagedId = crypto.getHash(JSON.stringify(message.data))
      if (!this.messages.has(messagedId)) {
        this.messages.set(messagedId, Date.now())
        switch(message.type) {
          case('tx'):
            // first ensure we have a valid SSDB record wrapping the tx
            const txRecord = Record.readUnpacked(message.data.key, message.data.value) 
            const txRecordTest = await txRecord.isValid()
            if (txRecordTest.valid) {
              // then validate the tx data
              const txTest = await this.ledger.onTx(txRecord)
              if (txTest.valid) {
                const txMessage = await this.network.createGenericMessage('tx', message.data)
                this.network.gossip(txMessage)
                this.emit('tx', txRecord)
              }
            }          
            break
          case('block'):
            // first validate the immutable record on SSDB
            const blockRecord = Record.readUnpacked(message.data.key, message.data.value)
            const blockRecordTest = await blockRecord.isValid()
            if (blockRecordTest.valid) {
              // extract the block data and validate that in ledger
              const blockTest = await this.ledger.onBlock(blockRecord)
              if (blockTest.valid) {
                const blockMessage = await this.network.createGenericMessage('block', message.data)
                this.network.gossip(blockMessage)
                this.emit('block', blockRecord)


              }
            }
            break
          default:
            this.emit(message.type, message.data)
        }
      }
    })

    this.isInit = true
    this.emit('ready')
  }

  public async createProfile(options: any) {
    // create a new subspace identity 
    await this.wallet.createProfile(options)
  }

  public async deleteProfile() {
    // deletes the existing profile on disk
    await this.wallet.profile.clear()
  }

  // core network methods

  public async join() {  
    // join the subspace network as a node
    await this.init()
    const joined = await this.network.join()
    if (joined) {
      this.emit('connected')
    } else {
      throw new Error('Error joining network')
    }
  }

  public async leave() {
    await this.network.leave()
    this.emit('disconnected')
  }

  public async connect(nodeId: string) {
    const connection = await this.network.connect(nodeId)
    this.emit('connection', connection)
  }

  public async disconnect(nodeId: string) {
    await this.network.disconnect(nodeId)
    this.emit('disconnected')
  }

  public async send(nodeId: string, message: any) {
    const sent = await this.network.send(nodeId, message)
    if (!sent) {
      throw new Error('Error sending message')
    }
  }

  // ledger tx methods

  public async seedPlot(size: number) {
    // seed a plot on disk by generating a proof of space
    const profile = this.wallet.getProfile()
    const proof =  crypto.createProofOfSpace(profile.publicKey, size)
    await this.storage.put(proof.id, JSON.stringify(proof))
    this.wallet.profile.proof = proof
  }

  public getBalance(address = this.wallet.profile.user.id) {
    return this.ledger.getBalance(address)
  }

  public async sendCredits(amount: number, address: string) {
    // send subspace credits to another address
    const profile = this.wallet.getProfile()
    const txRecord = await this.ledger.createCreditTx(profile.id, address, amount)
    const txMessage = await this.network.createGenericMessage('tx', txRecord.getRecord())
    this.network.gossip(txMessage)

    // should emit an event when tx is confirmed, later

    return txRecord
  }

  public async pledgeSpace(interval: number) {
    // creates and submits a pledges as a proof of space to the ledger as a host

    if (!this.wallet.profile.proof) {
      throw new Error('You must first seed your plot')
    }

    const profile = this.wallet.getProfile()
    const pledge = this.wallet.profile.proof.size

    const txRecord = await this.ledger.createPledgeTx(profile.publicKey, pledge, interval)
    const txMessage = await this.network.createGenericMessage('tx', txRecord.getRecord())

    this.wallet.profile.pledge = {
      proof: this.wallet.profile.proof.id,
      size: pledge,
      interval: interval,
      createdAt: Date.now(),
      pledgeTx: txRecord.key

    }

    this.setPaymentTimer()

    // corresponding code for on('pledge')
    // should emit an event when tx is confirmed 

    this.network.gossip(txMessage)
    return txRecord
  }

  private setPaymentTimer() {
    // called on init 
    const pledge = this.wallet.profile.pledge
    if (pledge.interval) {
      const timeout = (pledge.createdAt + pledge.interval) - Date.now()
      setTimeout(() => {
        this.requestHostPayment()
      }, timeout)
    }
  }

  private async requestHostPayment() {
    // called when payment timer expires
    // requests host payment from the nexus
    const profile = this.wallet.getProfile()
    const pledge = this.wallet.profile.pledge
    const trackerEntry = this.tracker.getEntry(profile.id)
    const uptime = trackerEntry.uptime
    const amount = await this.ledger.computeHostPayment(uptime, pledge.size, pledge.interval, pledge.pledgeTx)
    const txRecord = await this.ledger.createNexusTx(profile.publicKey, pledge.pledgeTx, amount, this.ledger.clearedImmutableCost)
    const txMessage = await this.network.createGenericMessage('tx', txRecord.getRecord())
    // later should renew pledge and reset timer
  }

  // may also want to add the ability to do pay per put since the ledger is much faster now

  public async reserveSpace(
    name = DEFAULT_CONTRACT_NAME,
    email = DEFAULT_CONTRACT_EMAIL,
    passphrase = DEFAULT_CONTRACT_PASSPHRASE,
    spaceReserved = DEFAULT_CONTRACT_SIZE,
    ttl = DEFAULT_CONTRACT_TTL,
    replicationFactor = DEFAULT_CONTRACT_REPLICATION_FACTOR
  ) {
    if (ttl) {
      const {txRecord, contractRecord} = await this.createMutableContract(name, email, passphrase, spaceReserved, ttl, replicationFactor)
      await this.putContract(txRecord, contractRecord)
    }
  }

  public async createMutableContract(
    name = DEFAULT_CONTRACT_NAME,
    email = DEFAULT_CONTRACT_EMAIL,
    passphrase = DEFAULT_CONTRACT_PASSPHRASE,
    spaceReserved = DEFAULT_CONTRACT_SIZE,
    ttl = DEFAULT_CONTRACT_TTL,
    replicationFactor = DEFAULT_CONTRACT_REPLICATION_FACTOR
  ) {
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
    const profile = this.wallet.getProfile()
    const contractRecord = await Record.createMutable(null, false, profile.publicKey)

    // unpack to extract the contract keys
    await contractRecord.unpack(profile.privateKeyObject)
    const privateKey = contractRecord.value.privateKey
    const publicKey = contractRecord.value.publicKey
    await contractRecord.pack(profile.publicKey)

    // sign the contract public key with its private key to prove ownership without revealing contract id 
    const privateKeyObject = await crypto.getPrivateKeyObject(privateKey, passphrase)
    const contractSig = await crypto.sign(publicKey, privateKeyObject)
    const contractId = crypto.getHash(publicKey)

    // tx will be saved on apply tx 
    // contract record does not need to be saved directly
      // state is already being saved in the wallet contract object 
      // each host will hold the state
      // when we send an update it should only inlcude the new state

    // create the immutable contract tx and tx record, with included contract signature
    const txRecord = await this.ledger.createMutableContractTx(spaceReserved, replicationFactor, ttl, contractSig, contractId)

    // update the contract record with correct state 
    const contractState = {
      fundingTx: txRecord.key,    // the current funding tx, can change over time
      spaceUsed: 0,                       // size of all data written to contract
      recordIndex: new Set()              // index of all records in the contract
    }
    
    await contractRecord.update(contractState, profile)
    
    // add the contract keys and data to your wallet
    const walletContract: IContractData = {
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
    }
    
    await this.wallet.contract.store(walletContract)
    return {txRecord, contractRecord}
  }

  public putContract(txRecord: Record, contractRecord: Record) {
    return new Promise(async (resolve, reject) => {
      // contact the contract holders so they may initialize contract state
      const contract = this.wallet.getPublicContract()
      const privateKeyObject = this.wallet.contract.key.privateObject
      const hosts = this.database.getShardAndHostsForKey(contract.id, contract).hosts
      const request: IContractRequest = {
        tx: txRecord.getRecord(),
        contract: contractRecord.getRecord(),       
        signature: null
      }

      request.signature = await crypto.sign(JSON.stringify(request), privateKeyObject)
      await this.addRequest('contract', contractRecord.key, request, hosts)

      // gossip the contract tx to the network
      const contractTxMessage = await this.network.createGenericMessage('tx', txRecord.getRecord())
      this.network.gossip(contractTxMessage)

      // when host to hold contract receives the contract-request
      this.on('contract-request', async (message: IGenericMessage) => {
        const request: IContractRequest = message.data
        
        // validate the contract-request
        const tx = this.database.loadUnpackedRecord(request.tx)
        const contractState = this.database.loadUnpackedRecord(request.contract)
        const txTest = await this.ledger.onTx(tx)
        if (!txTest.valid) {
          this.sendContractResponse(message.sender, false, txTest.reason, contractState.key )
          return
        }

        // validate the contract tx matches the contract record 
        const contractTest = await this.database.isValidMutableContractRequest(tx, contractState)
        if (!contractTest) {
          const reason = 'Invalid contract request, mutable contract state public key does not match funding transaction contract signature'
          this.sendContractResponse(message.sender, false, reason, contractState.key)
          return
        }

        // validate the contract mutable record
        const contract = this.ledger.pendingContracts.get(crypto.getHash(contractState.key))
        const testRequest = await this.database.isValidPutRequest(contractState, contract, request)
        if (!testRequest.valid) {
          this.sendContractResponse(message.sender, false, testRequest.reason, contractState.key )
          return
        }

        // assume valid
        await this.database.saveRecord(contractRecord, contract)
        const proof = contractRecord.createPoR(this.wallet.profile.user.id)
        this.sendContractResponse(message.sender, true, proof, contractRecord.key)
      })

      // when client receives the contract-reply from host
      this.network.on('contract-reply', async (message: IGenericMessage) => {

        const response: IContractResponse = message.data
        const contract = this.wallet.getPublicContract()
        if (!response.valid) {
          reject(new Error(message.data.description))
        }

        // validate PoR
        const record = await this.database.getRecord(response.key)
        if (! record.isValidPoR(message.sender, response.reason))  {
          reject(new Error('Host returned invalid proof of replication'))
        }

        // remove from pending requests and get size
        const pendingSize = this.getRequestSize('reserve', record.key)
        this.removeRequest('reserve', record.key, message.sender)
        const shardMap = this.database.getShardAndHostsForKey(record.key, contract)
        const hostLength = shardMap.hosts.length
        
        // resolve on first valid response
        if (pendingSize === hostLength) {
          resolve()
        }
    
        // emit event and adjust contract when fully resolved
        if (pendingSize === 1) {
          const hosts = this.resolveRequest('reserve', record.key)
          this.emit('space-reserved', record.key, hosts)
        }
      }) 
    })
  }

  // core database methods

  public put(content: any, encrypted: boolean) {
    return new Promise( async(resolve, reject) => {
      // create the record, get hosts, and send requests
      const privateContract = this.wallet.getPrivateContract()
      const publicContract = this.wallet.getPublicContract()
      const record = await this.database.createRecord(content, encrypted)
      this.wallet.contract.addRecord(record.key, record.getSize())
      
      // create a put request signed by contract key
      const request: IPutRequest = {
        record: record.getRecord(),
        contractKey: privateContract.publicKey,
        timestamp: Date.now(),
        signature: null
      }
      request.signature = await crypto.sign(JSON.stringify(request), privateContract.privateKeyObject)

      const hosts = this.database.getHosts(record.key, publicContract)
      await this.addRequest('put', record.key, request, hosts)
      
      this.on('put-request', async (message: IGenericMessage) => {
        // validate the contract request
        const request: IPutRequest = message.data 
        const record = this.database.loadPackedRecord(request.record)
        const contract = this.ledger.pendingContracts.get(crypto.getHash(request.contractKey))
        const testRequest = await this.database.isValidPutRequest(record, contract, request)
        if (!testRequest.valid)  {
          this.sendPutResponse(message.sender, false, testRequest.reason, record.key)
          return
        }
        
        // validate the record
        const testValid = await record.isValid(message.sender)
        if (!testValid.valid)  {
          // this.rejectRequest(message.sender, 'put', false, testValid.reason, record.key)
          this.sendPutResponse(message.sender, false, testValid.reason, record.key)
          return
        }
      
        // store the record, create PoR, and send reply
        await this.database.saveRecord(record, contract)
        const proof = record.createPoR(this.wallet.profile.user.id)
        this.sendPutResponse(message.sender, true, proof, record.key)
      })
    
      this.on('put-reply', async (message: IGenericMessage) => {
        const response: IPutResponse = message.data
        if (!response.valid) {
          reject(new Error(response.reason))
        }
    
        const profile = this.wallet.getProfile()
        const contract = this.wallet.getPublicContract()
    
        // validate PoR
        const record = await this.database.getRecord(response.key)
        if (! record.isValidPoR(message.sender, response.reason))  {
          reject(new Error('Host returned invalid proof of replication'))
        }
    
        // remove from pending requests and get size
        const pendingSize = this.getRequestSize('put', record.key)
        this.removeRequest('put', record.key, message.sender)
        const shardMap = this.database.getShardAndHostsForKey(record.key, contract)
        const hostLength = shardMap.hosts.length
        
        // resolve on first valid response
        if (pendingSize === hostLength) {
          const content = await record.getContent(shardMap.id, contract.replicationFactor, profile.privateKeyObject)
          resolve(content.value)
        }
    
        // emit event and adjust contract when fully resolved
        if (pendingSize === 1) {
          this.rev(contract.id, this.wallet.contract.state)
          const hosts = this.resolveRequest('put', record.key)
          this.emit('put', record.key, hosts)
        }
      })
    })
  }

  public get(key: string) {
    return new Promise( async (resolve, reject) => {
      // get hosts and send requests
      const keyObject = this.database.parseRecordKey(key)
      const hosts = this.database.computeHostsforShards([keyObject.shardId], keyObject.replicationFactor)[0].hosts
      const request: IGetRequest = keyObject
      await this.addRequest('get', keyObject.recordId, request, hosts)

      this.on('get-request', async (message: IGenericMessage) => {
        const request: IGetRequest = message.data
        // unpack key and validate request
        const record = await this.database.getRecord(request.recordId) 
        const testRequest = await this.database.isValidGetRequest(record, request.shardId, request.replicationFactor)
        if (!testRequest.valid)  {
          this.sendGetResponse(message.sender, false, request.recordId, testRequest.reason)
          return
        }
    
        // send the record and PoR back to client
        const proof = record.createPoR(this.wallet.profile.user.id)
        this.sendGetResponse(message.sender, true, request.recordId, proof, record)
      })
    
      this.on('get-reply', async (message: IGenericMessage) => {
        const response: IGetResponse = message.data
        if (!response.valid) {
          reject(new Error(response.reason))
        }
    
        const profile = this.wallet.getProfile()
        const contract = this.wallet.getPublicContract()
    
        // load/validate record and validate PoR
        const record = await this.database.loadPackedRecord(response.record)
        if (! record.isValidPoR(message.sender, response.reason))  {
          reject(new Error('Host returned invalid proof of replication'))
        }
    
        // remove from pending requests and get size
        const pendingSize = this.getRequestSize('get', record.key)
        this.removeRequest('get', record.key, message.sender)
        const shardMap = this.database.getShardAndHostsForKey(record.key, contract)
        const hostLength = shardMap.hosts.length
        
        // resolve on first valid response
        if (pendingSize === hostLength) {
          const content = await record.getContent(shardMap.id, contract.replicationFactor, profile.privateKeyObject)
          resolve(content.value)
        }
    
        // emit event and adjust contract when fully resolved
        if (pendingSize === 1) {
          const hosts = this.resolveRequest('get', record.key)
          this.emit('get', record.key, hosts)
        }
      })
    })
  }
  
  public rev(key: string, update: any) {
    return new Promise( async (resolve, reject) => {
      const keyObject = this.database.parseRecordKey(key)
      const publicContract = this.wallet.getPublicContract()
      const privateContract = this.wallet.getPrivateContract()
    
      // get the old record and update
      const oldRecord = await this.database.getRecord(keyObject.recordId)
      if (oldRecord.value.immutable) {
        reject(new Error('Cannot update an immutable record'))
      }
      const newRecord = await this.database.revRecord(key, update)
      const sizeDelta = oldRecord.getSize() - newRecord.getSize()
      this.wallet.contract.updateRecord(key, sizeDelta)

      // create a rev request signed by contract key
      const request: IRevRequest = {
        record: newRecord.getRecord(),
        contractKey: privateContract.publicKey,
        shardId: keyObject.shardId,
        timestamp: Date.now(),
        signature: null
      }
      request.signature = await crypto.sign(JSON.stringify(request), privateContract.privateKeyObject)
    
      // get hosts and send update requests
      const hosts = this.database.getHosts(key, publicContract)
      await this.addRequest('rev', key, request, hosts)
    
      this.on('rev-request', async (message: IGenericMessage) => {
        // load the request and new record
        const request: IRevRequest = message.data 
        const newRecord = this.database.loadPackedRecord(request.record)
        const oldRecord = await this.database.getRecord(newRecord.key)
        const contract = this.ledger.pendingContracts.get(crypto.getHash(request.contractKey))
        const testRequest = await this.database.isValidRevRequest(oldRecord, newRecord, contract, request.shardId, request)

        if (!testRequest.valid)  {
          this.sendRevResponse(message.sender, false, testRequest.reason, newRecord.key)
          return
        }

        // validate the new record
        const testValid = await newRecord.isValid(message.sender)
        if (!testValid.valid)  {
          this.sendRevResponse(message.sender, false, testValid.reason, newRecord.key)
          return
        }

        const sizeDelta = oldRecord.getSize() - newRecord.getSize()
    
        // update the record, create PoR and send reply
        await this.database.saveRecord(newRecord, contract, true, sizeDelta)
        const proof = newRecord.createPoR(this.wallet.profile.user.id,)
        await this.sendRevResponse(message.sender, true, proof, newRecord.key)
      })
    
      this.on('rev-reply', async (message: IGenericMessage) => {
        const response: IRevResponse = message.data
        if (!response.valid) {
          reject(new Error(message.data.data))
        }
    
        const profile = this.wallet.getProfile()
        const contract = this.wallet.getPublicContract()
    
        // validate PoR
        const record = await this.database.getRecord(response.key)
        if (! record.isValidPoR(message.sender, response.reason))  {
          reject(new Error('Host returned invalid proof of replication'))
        }
    
        // remove from pending requests and get size
        const pendingSize = this.getRequestSize('rev', record.key)
        this.removeRequest('rev', record.key, message.sender)
        const shardMap = this.database.getShardAndHostsForKey(record.key, contract)
        const hostLength = shardMap.hosts.length
        
        // resolve on first valid response
        if (pendingSize === hostLength) {
          const content = await record.getContent(shardMap.id, contract.replicationFactor, profile.privateKeyObject)
          resolve(content)
        }
    
        // emit event and adjust contract when fully resolved
        if (pendingSize === 1) {
          this.rev(contract.id, this.wallet.contract.state)
          const hosts = this.resolveRequest('rev', record.key)
          this.emit('rev', record.key, hosts)
        }
      })
    })
  }
  
  public del(key: string) {
    return new Promise( async (resolve, reject) => {
      // get hosts and send requests
      const keyObject = this.database.parseRecordKey(key)
      const contract = this.wallet.getPrivateContract()
      const hosts = this.database.computeHostsforShards([keyObject.shardId], keyObject.replicationFactor)[0].hosts
      
      // create a del request signed by contract key
      const request: IDelRequest = {
        shardId: keyObject.shardId,
        recordId: keyObject.recordId,
        replicationFactor: keyObject.replicationFactor,
        contractKey: contract.publicKey,
        signature: null
      }

      request.signature = await crypto.sign(JSON.stringify(request), contract.privateKeyObject)
      await this.addRequest('del', keyObject.recordId, request, hosts)
    
      this.on('del-request', async (message: IGenericMessage) => {
        // unpack key and validate request
        const request: IDelRequest = message.data
        const record = await this.database.getRecord(request.recordId)
        const contract = this.ledger.pendingContracts.get(crypto.getHash(request.contractKey))
        
        const testRequest = await this.database.isValidDelRequest(record, contract, keyObject.shardId, request)
        if (!testRequest.valid)  {
          this.sendDelResponse(message.sender, false, testRequest.reason, request.recordId)
          return
        }
    
        // delete the record send PoD back to client
        await this.database.delRecord(record, request.shardId)
        const proof = record.createPoD(this.wallet.profile.user.id)
        await this.sendDelResponse(message.sender, true, proof, record.key)
      })
    
      this.on('del-reply', async (message: IGenericMessage) => {
        const response: IDelResponse = message.data
        if (!response.valid) {
          reject(new Error(response.reason))
        }
    
        const contract = this.wallet.getPublicContract()
        const record = await this.database.getRecord(response.key)
    
        // load/validate record and validate PoD
        if (! record.isValidPoD(message.sender, response.reason))  {
          reject(new Error('Host returned invalid proof of deletion'))
        }
    
        // remove from pending requests and get size
        const pendingSize = this.getRequestSize('del', record.key)
        this.removeRequest('del', record.key, message.sender)
        const shardMap = this.database.getShardAndHostsForKey(record.key, contract)
        const hostLength = shardMap.hosts.length
        
        // resolve on first valid response
        if (pendingSize === hostLength) {
          resolve()
        }
    
        // emit event and adjust contract when fully resolved
        if (pendingSize === 1) {
          await this.storage.del(record.key)
          await this.wallet.contract.removeRecord(key, record.getSize())
          this.rev(contract.id, this.wallet.contract.state)
          const hosts = this.resolveRequest('del', record.key)
          this.emit('del', record.key, hosts)
        }
      })
    })
  }

  // ledger data methods

  private getLastBlockId(): Promise<string> {
    return new Promise<string> ( async (resolve, reject) => {
      const request = await this.network.createGenericMessage('last-block-id-request')
      const gateway = this.network.getGateways()[0]
      await this.network.send(gateway, request)

      this.on('last-block-id-request', async (message: IGenericMessage) => {
        const lastBlockId = this.ledger.getLastBlockId()
        const response = await this.network.createGenericMessage('last-block-id-reply', lastBlockId)
        await this.network.send(message.sender, response)
      })

      this.on('last-block-id-reply', async (message: IGenericMessage) => {
        resolve(message.data)
      })
    })
  }

  private getChain(): Promise<string[]> {
    return new Promise<string[]>( async (resolve, reject) => {
      const request = await this.network.createGenericMessage('chain-request')
      const gateway = this.network.getGateways()[0]
      await this.network.send(gateway, request)

      this.on('chain-request', async (message: IGenericMessage) => {
        const chain = this.ledger.chain
        const response = await this.network.createGenericMessage('chain-reply', chain)
        await this.network.send(message.sender, response)
      })

      this.on('chain-reply', async (message: IGenericMessage) => {
        resolve(message.data)
      })
    })
  }

  private getBlockHeader(blockId: string): Promise<Record> {
    return new Promise<Record> ( async (resolve, reject) => {
      const request = await this.network.createGenericMessage('block-header-request', blockId)
      const gateway = this.network.getGateways()[0]
      this.network.send(gateway, request)

      this.on('block-header-request', async (message: IGenericMessage) => {
        const blockValue = JSON.parse( await this.storage.get(message.data))
        const block = Record.readPacked(blockId, blockValue)
        const response = await this.network.createGenericMessage('block-header-reply', block)
        await this.network.send(message.sender, response)
      })

      this.on('block-header-reply', async (message: IGenericMessage) => {
        if (message.data) {
          const block: Record = message.data
          this.storage.put(block.key, JSON.stringify(block.value))
          await block.unpack(null)
          resolve(block)
        } else {
          reject(new Error('Node does not have block'))
        }
      })
    })
  }

  private getTx(txId: string): Promise<Record> {
    return new Promise<Record>( async (resolve, reject) => {
      const request = await this.network.createGenericMessage('tx-request', txId)
      const gateway = this.network.getGateways()[0]
      this.network.send(gateway, request)

      this.on('tx-request', async (message: IGenericMessage) => {
        const txValue = JSON.parse( await this.storage.get(message.data))
        const tx = Record.readPacked(txId, txValue)
        const response = await this.network.createGenericMessage('tx-reply', tx)
        await this.network.send(message.sender, response)
      })

      this.on('tx-reply', async (message: IGenericMessage) => {
        if (message.data) {
          const tx: Record = message.data
          this.storage.put(tx.key, JSON.stringify(tx.value))
          await tx.unpack(null)
          resolve(tx)
        } else {
          reject(new Error('Node does not have tx'))
        }
      })
    })
  }

  private async getLastBlock(blockId: string, previousBlockRecord: Record) {
    const blockRecord = await this.getBlockHeader(blockId)
    const blockRecordTest = await blockRecord.isValid()
    if (!blockRecordTest.valid) {
      throw new Error(blockRecordTest.reason)
    }
    const block = new Block(blockRecord.value.content)

    // validate block
    if (!block.value.previousBlock) { 
      // genesis block
      const genesisTest = await block.isValidGenesisBlock(blockRecord)
        if (!genesisTest.valid) {
          throw new Error(genesisTest.reason)
        } 
    } else {          
      // normal block
      const blockTest = await block.isValid(blockRecord, {key: previousBlockRecord.key, value: previousBlockRecord.value.content})
      if (!blockTest.valid) {
        throw new Error(blockTest.reason)
      }
    }

    for (const txId of block.value.txSet) {
      const txRecord = await this.getTx(txId)
      // validate the tx record
      const txRecordTest = await txRecord.isValid()
      if (!txRecordTest.valid) {
        throw new Error(txRecordTest.reason)
      }
      // then validate the tx data
      const txTest = await this.ledger.onTx(txRecord)
      if (!txTest.valid) {
        throw new Error(txTest.reason)
      }
    }

    // apply block 
    await this.ledger.applyBlock(blockRecord)
    return blockRecord
  }

  private async getLedger() {
    // start downloading the ledger

    let myLastBlockId = this.ledger.getLastBlockId()
    const chain = await this.getChain()
    let previousBlockRecord: Record = null
    if (!myLastBlockId) {
      // get the chain from genesis block 
      for (const blockId of chain) {
        previousBlockRecord = await this.getLastBlock(blockId, previousBlockRecord)
      }
    }  else {
      // get the chain from my last block 
      function findBlockId(blockId: string) {
        return blockId === myLastBlockId
      }
      const myLastBlockIndex = chain.findIndex(findBlockId)
      const previousBlockValue = this.ledger.clearedBlocks.get(myLastBlockId)
      previousBlockRecord = Record.readUnpacked(myLastBlockId, previousBlockValue)
      let blockId: string = null
      for (let i = myLastBlockIndex + 1; i <= chain.length; i++) {
        blockId = chain[i] 
        previousBlockRecord = await this.getLastBlock(blockId, previousBlockRecord)
      }
    }
  }

  // farmer methods

  public async startFarmer() {
    if (this.bootstrap) { 
      await this.ledger.bootstrap()
    } else {
      await this.getLedger()
    }

    this.ledger.hasLedger = true
    this.ledger.isFarming = true
  }

  public stopFarmer() {
    this.ledger.isFarming = false 
  }

  // host methods

  public async connectToNeighbor(nodeId:string): Promise<void> {
    return new Promise<void>( async (resolve, reject) => {
      // send a connection request to a valid neighbor

      const pledgeTxId = this.wallet.profile.pledge.pledgeTx
      const request: INeighborRequest = { pledgeTxId }
      const requestMessage = await this.network.createGenericMessage('neighbor-request', request)
      await this.network.send(nodeId, requestMessage)

      this.on('neighbor-request', async (message: IGenericMessage) => {
        const response: INeighborResponse = {
          valid: false,
          reason: null,
          proof: null
        }
        const requestTest = await this.tracker.isValidNeighborRequest(message)

        // is this a valid neighbor request message?
        if (!requestTest) {
          response.reason = requestTest.reason
          const responseMessage = await this.network.createGenericMessage('neighbor-reply', response)
          await this.network.send(message.sender, responseMessage)  
        }

        // am I a valid neighbor for this host?
        const profile = this.wallet.getProfile()
        const activeHosts = this.tracker.getActiveHosts()
        const hostNeighbors = this.tracker.getNeighbors(message.sender, activeHosts)
        if (!hostNeighbors.includes(profile.id)) {
          response.reason = 'invalid neighbor request, not a valid neighbor'
          const responseMessage = await this.network.createGenericMessage('neighbor-reply', response)
          await this.network.send(message.sender, responseMessage)
        }

        // add to neighbors 
        this.neighbors.add(message.sender)
          
        // send join reply with my signature proof
        response.proof = {
          host: message.sender,
          neighbor: profile.publicKey,
          timestamp: Date.now(),
          signature: <string> null
        }
        response.valid = true
        response.proof.signature = await crypto.sign(response.proof, profile.privateKey)
        const responseMessage = await this.network.createGenericMessage('neighbor-reply', response)
        await this.network.send(message.sender, responseMessage)
      })

      this.on('neighbor-reply', (message: IGenericMessage) => {
        // check if request accpeted
        const response: INeighborResponse = message.data
        if (!response.valid) {
          reject(new Error(response.reason))
        }

        // update my neighbors
        this.neighbors.add(message.sender)
        this.neighborProofs.set(message.sender, response.proof)
        resolve()
      })      
    })
  }

  public async getShard(nodeId: string, shardId: string, contractRecordId: string): Promise<void> {
    return new Promise<void>( async (resolve, reject) => {
      // get shard from another host after joining the host network
      // corner case, what if two hosts try to take over the same shard at the same time?
      const request: IShardRequest = { shardId, contractRecordId }
      await this.addRequest('shard', shardId, request, [nodeId])
     
      this.on('shard-request', async (message: IGenericMessage) => {
        const request: IShardRequest = message.data
        const profile = this.wallet.getProfile()

        const response: IShardResponse = {
          valid: false,
          reason: null,
          contractId: request.contractRecordId,
          shardId: request.shardId,
          records: []
        }

        // validate the contract and shard match 
        const contract = this.ledger.clearedContracts.get(request.contractRecordId)
        const shards = this.database.computeShardArray(contract.contractId, contract.spaceReserved)
        if (!shards.includes(request.shardId)) {
          const responseMessage = await this.network.createGenericMessage('shard-reply', response)
          this.network.send(message.sender, responseMessage)
        }

        const entry = this.tracker.getEntry(message.sender)
        if (!entry || entry.status) {
          const responseMessage = await this.network.createGenericMessage('shard-reply', response)
          this.network.send(message.sender, responseMessage)
        }

        // compute hosts for shard with the requesting host temporarilty set to active
        entry.status = true
        this.tracker.lht.set(message.sender, entry)
        const hosts = this.database.computeHostsforShards([request.shardId], contract.replicationFactor)[0].hosts
        entry.status = false
        this.tracker.lht.set(message.sender, entry)

        // see if they are both closer than me and if I have been evicted from shard
        if (!hosts.includes(message.sender) || hosts.includes(profile.id)) {
          const responseMessage = await this.network.createGenericMessage('shard-reply', response)
          this.network.send(message.sender, responseMessage)
        }

        // valid request 
        response.valid = true

        // get all records for shard
        const shard = this.database.getShard(request.shardId)
        for (const recordId of shard.records) {
          const recordValue: IValue = JSON.parse(await this.storage.get(recordId))
          const record = Record.readPacked(recordId, recordValue)
          response.records.push(record)
        }

        // once the new host is active on the tracker, this node will drop the shard and records
        let evictedShard: Set<string> = null
        if (this.evictedShards.has(message.sender)) {
          evictedShard = this.evictedShards.get(message.sender)
        } else {  
          evictedShard = new Set()
        }
        evictedShard.add(shardId)
        this.evictedShards.set(message.sender, evictedShard)

        // need to create an unsigned message, should really be sent as a stream
        const responseMessage = await this.network.createGenericMessage('shard-reply', response)
        this.network.send(message.sender, responseMessage)
      })

      this.on('shard-reply', async (message: IGenericMessage) => {
        const response: IShardResponse = message.data

        // throw error on invalid request
        if (!response.valid) {
          reject(new Error(response.reason))
        }

        // valid response
        this.resolveRequest('shard', response.shardId)

        // later fetch the merkle hash of the shard from contract state to validate return data
        // or get the record index from contract state  and validate each record 

        // create the shard 
        await this.database.createShard(response.shardId, response.contractId)

        for (const record of response.records) {
          // save the record to disk and update shard
          await this.storage.put(record.key, JSON.stringify(record.value))
          await this.database.putRecordInShard(request.shardId, record)
        }
        resolve()
      })
    })
  }

  public async joinHosts() {
    // after seeding and pledging space, join the host network 
    // should add a delay or ensure the tx has been anchored in the ledger 
    // assumes the host already has an entry into the tracker

    const pledge = this.wallet.profile.pledge
    if (!pledge.interval) {
      throw new Error('Cannot join host network without first submitting a pledge tx')
    }

    const profile = this.wallet.getProfile()
    const promises: Promise<void>[] = []

    // connect to all valid neighbors 
    const activeHosts = this.tracker.getActiveHosts()
    this.neighbors = new Set([...this.tracker.getNeighbors(profile.id, activeHosts)])
    for (const nodeId of this.neighbors) {
      promises.push(this.connectToNeighbor(nodeId))
    }

    // get all of my assigned shards, an expensive, (hoepfully) one-time operation 
    for (const [recordId, contract] of this.ledger.clearedContracts) {
      const shards = this.database.computeShardArray(contract.contractId, contract.replicationFactor)
      for (const shardId of shards) {
        const hosts = this.database.computeHostsforShards([shardId], contract.replicationFactor)[0].hosts
        if (hosts.includes(profile.id)) {
          const furthestHost = hosts[hosts.length - 1]
          promises.push(this.getShard(furthestHost, shardId, recordId))
        }
      }
    }

    await Promise.all(promises)

    // comile signatures, create and gossip the join messsage 
    const publicIP = this.network.my_ip
    const isGateway = this.isGateway()
    const signatures = [...this.neighborProofs.values()]
    const joinMessage = await this.tracker.createJoinMessage(publicIP, isGateway, signatures)
    await this.network.gossip(joinMessage)
    this.tracker.updateEntry(joinMessage.data)
    this.isHosting = true
    this.emit('joined-hosts')

    // on receipt of join message by each host
    this.on('host-join', async (message: IHostMessage) => {
      const join: IJoinObject = message.data

      // later add strict validation
      
      // if the node is in the LHT, in an incative state, compute its neighbors
      const entry = this.tracker.getEntry(join.nodeId)
      if (entry && !entry.status) {
        const activeHosts = this.tracker.getActiveHosts()
        const neighbors = new Set([...this.tracker.getNeighbors(join.nodeId, activeHosts)])
        let validCount = 0

        // for each valid neighbor, validate the signature 
        for (const proof of join.signatures) {
          if (neighbors.has(crypto.getHash(proof.neighbor)) && proof.host === join.nodeId) {
            const unsignedProof = {...proof}
            unsignedProof.signature = null
            if (await crypto.isValidSignature(unsignedProof, proof.signature, proof.neighbor)) {
              validCount ++
            }
          }
        }

        // if 2/3 of neighbors have signed, valid join
        if (validCount >= (neighbors.size * (2/3))) {
          this.tracker.updateEntry(join)
          await this.network.gossip(message)

          // drop any shards this host replicated from me
          if (this.evictedShards.has(join.nodeId)) {
            const shards = this.evictedShards.get(join.nodeId)
            this.evictedShards.delete(join.nodeId)
            for (const shard of shards) {
              this.database.delShard(shard)
            }
          }
        }
      }      
    })
  }

  private async replciateShards(nodeId: string) {
    // derive all shards for this host and see if I am the next closest host
    const profile = this.wallet.getProfile()
    for (const [recordId, contract] of this.ledger.clearedContracts) {
      const shards = this.database.computeShardArray(contract.contractId, contract.replicationFactor)
      for (const shardId of shards) {
        const hosts = this.database.computeHostsforShards([shardId], contract.replicationFactor + 1)[0].hosts
        // if we are both in the enlarged host array 
        if (hosts.includes(nodeId) && hosts.includes(profile.id)) {
          // and I am last host
          if (hosts[hosts.length -1] === profile.id) {
            // get the shard from the first host
            this.getShard(hosts[0], shardId, recordId)
          }
        }
      }
    }
  }

  public async leaveHosts() {
    // leave the host network gracefully, disconnecting from all valid neighbors
    const message = await this.tracker.createLeaveMessage()
    await this.network.gossip(message)
    this.isHosting = false
    this.neighbors.clear
    await this.network.leaveHosts()

    // on receipt of leave message by each host
    this.network.on('host-leave', async (message: IHostMessage) => {
      const leave: ILeaveObject = message.data
      const profile = this.wallet.getProfile()

      // validate the signature
      const unsignedLeave = {...leave}
      unsignedLeave.signature = null
      if (await crypto.isValidSignature(leave, leave.signature, message.publicKey)) {
        const entry = this.tracker.getEntry(message.sender)
        if (entry && entry.status) {
          // valid leave, gossip back out
          await this.network.gossip(message)
          
          // see if I need to replicate any shards for this host
          this.replciateShards(message.sender)

          // deactivate the node in the tracker after computing shards
          this.tracker.updateEntry(leave)
        }
      }
    })
  }

  public async onHostFailure() {
    // listen for and validate disconnection of my host neighbors

    this.on('disconnection', async (nodeId: string) => {
      if (this.isHosting) {
        if (this.neighbors.has(nodeId)) {
          const entry = this.tracker.getEntry(nodeId)
          if (entry && entry.status) { 
            // a valid neighbor has failed 
            this.failedNeighbors.set(nodeId, false)
            const timeout = Math.floor(Math.random() * Math.floor(10))
            setTimeout(async () => {
              // later attempt to ping the node 

              // if failure entry is still false (have not received a failure message)
              const entry = this.failedNeighbors.get(nodeId)
              if (!entry) {
                this.failedNeighbors.set(nodeId, true)
                // compute their neighbors
                const profile = this.wallet.getProfile()
                const hosts = this.tracker.getActiveHosts()
                const neighbors = new Set([...this.tracker.getNeighbors(nodeId, hosts)])
                neighbors.delete(profile.id)

                // track the failures 
                const pendingFailure: IPendingFailure = {
                  neighbors,
                  signatures: [],
                  createdAt: Date.now()
                }
                this.pendingFailures.set(nodeId, pendingFailure)

                // start the failure message 
                const failureMessage = await this.tracker.createFailureMessage(nodeId)
                for (const neighbor of neighbors) {
                  await this.network.send(neighbor, failureMessage)
                }
              }
            }, timeout * 1000)
          }
        } 
      }
    })

    this.on('failure-request', async (message: IGenericMessage) => {
      // reply to a failure inquiry regarding one of my neighbors 
      const failure: IFailureObject = message.data
      // if you have detected the failure and have not already signed or created a failure message
      if (this.failedNeighbors.has(failure.nodeId)) {
        const entry = this.failedNeighbors.get(failure.nodeId)
        if (!entry) {
          // append signature to failure message
          this.failedNeighbors.set(failure.nodeId, true)
          const response = await this.tracker.signFailureMessage(failure)
          const responseMessage = await this.network.createGenericMessage('failure-reply', response)
          this.network.send(message.sender, responseMessage)
        }
      }
    })

    this.on('failure-reply', async (message: IGenericMessage) => {
      const response: ISignatureObject = message.data
      // validate the signature
      const unsignedResponse = {...response}
      unsignedResponse.signature = null
      // if valid signature, add to pending failure 
      if (await crypto.isValidSignature(unsignedResponse, response.publicKey, response.signature)) {
        const pendingFailure = this.pendingFailures.get(response.nodeId)
        pendingFailure.signatures.push(response)
        this.pendingFailures.set(response.nodeId, pendingFailure)
        // once you have 2/3 signatures turn into a failure proof
        if (pendingFailure.signatures.length >= pendingFailure.neighbors.size * (2/3)) {
          // resolve the failure request 
          this.pendingFailures.delete(response.nodeId)
          // create and gossip the failure message 
          const fullFailureMessage = await this.tracker.compileFailureMessage(response.nodeId, pendingFailure.createdAt, pendingFailure.signatures)
          this.network.gossip(fullFailureMessage)
        }
      } 
    })

    // listen for and validate gossiped failures of other hosts neighbors
    this.on('host-failure', async (message: IHostMessage) => {
      const failure: IFailureObject = message.data

      const entry = this.tracker.getEntry(failure.nodeId)
      if (entry && entry.status) {
        const hosts = this.tracker.getActiveHosts()
        const neighbors = new Set([...this.tracker.getNeighbors(failure.nodeId, hosts)])
        let validSigs = 0
        for (const signature of failure.signatures) {
          if (neighbors.has(crypto.getHash(signature.publicKey))) {
            const unsignedSig = {...signature}
            unsignedSig.signature = null
            if (await crypto.isValidSignature(signature, signature.signature, signature.publicKey)) {
              validSigs ++
            }
          }
        }

        // valid failure if at least 2/3 of signatures are valid
        if (validSigs >= neighbors.size*(2/3)) {

          // check to see if I need to replicate shards
          this.replciateShards(failure.nodeId)

          // deactivate the node in the tracker
          this.tracker.updateEntry(failure)

          // continue to spread the failure message
          this.network.gossip(message)

          // remove the node from pending failure if I am a neighbor
          if (this.pendingFailures.has(failure.nodeId)) {
            this.pendingFailures.delete(failure.nodeId)
          }
        }
      }
    })
  }
}
