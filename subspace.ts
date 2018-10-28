import EventEmitter from 'events'
import * as crypto from '@subspace/crypto'
import * as Wallet from '@subspace/wallet'
import * as Storage from '@subspace/storage'
// import  Network from '@subspace/network'
import Tracker from '@subspace/tracker'
import Ledger from '@subspace/ledger'
import {DataBase, Record} from '@subspace/database'

const DEFAULT_PROFILE_NAME = 'name'
const DEFAULT_PROFILE_EMAIL = 'name@name.com'
const DEFAULT_PROFILE_PASSPHRASE = 'passphrase'
const DEFAULT_HOST_PLEDGE = 10000000000 // 10 GB in bytes
const DEFAULT_HOST_INTERVAL = 2628000000 // 1 month in ms
const DEFAULT_GATEWAY_NODES = []
const DEFAULT_GATEWAY_COUNT = 1
const DEFAULT_CONTRACT_NAME = 'dev'
const DEFAULT_CONTRACT_EMAIL = 'dev@subspace.network'
const DEFAULT_CONTRACT_PASSPHRASE = 'passphrase'
const DEFAULT_CONTRACT_SIZE = 1000000000  // 1 GB in bytes
const DEFAULT_CONTRACT_TTL = 2628000000   // 1 month in ms
const DEFAULT_CONTRACT_REPLICATION_FACTOR = 2

export default class Subspace extends EventEmitter {

  // small change

  public isInit = false
  public env: string = null
  public storage_adapter: string = null
  public pending: Map<string, string> = new Map()
  public isFarming = false

  constructor(
    public name  = DEFAULT_PROFILE_NAME,
    public email = DEFAULT_PROFILE_EMAIL,
    public passphrase = DEFAULT_CONTRACT_PASSPHRASE,
    public pledge = null,
    public interval = null,
    public bootstrap = false, 
    public gateway_nodes = DEFAULT_GATEWAY_NODES,
    public gateway_count = DEFAULT_GATEWAY_COUNT, 
    public delegated = false
  ) {
    super()
  }

  requests = {
    pending: <Map<string, string>> new Map(),
    async add(type, recordId, data, hosts) {
      // generate and send the request
      const message = await this.network.createGenericMessage(`${type}-request`, data)
      for (const host of hosts) {
        this.network.send(host, message)
      }
  
      // add the requests and copy to pending
      this.requests.pending.set(crypto.getHash(type + recordId), hosts)
      this.requests.pending.set(crypto.getHash(recordId + type), hosts)
    },
    async remove(type, recordId, host) {
      const key = crypto.getHash(type + recordId)
      const request = this.requests.pending.get(key)
      request.delete(host)
      this.requests.pending.set(key, request)
    },
    resolve(type, recordId) {
      this.requests.pending.delete(crypto.getHash(type + recordId))
      const copyKey = crypto.getHash(recordId + type)
      const hosts = this.requests.pending.get(copyKey)
      this.requests.pending.delete(copyKey)
      return hosts
    },
    async respond(client, type, valid, data, key) {
      const response = { valid, data, key }
      const message = await this.network.createGenericMessage(`${type}-reply`, record)
      this.network.send(client, message)
    },
    size(type, recordId) {
      return this.requests.pending.get(crypto.getHasin(type + recordId)).size
    }
  }
  
  async initEnv() {
    if (typeof window !== 'undefined') {
      console.log('Browser env detected')
      this.env = 'browser' 
    } else if (await this.network.checkPublicIP()) {
      console.log('Gateway env detected')
      this.env = 'gateway'
    } else {
      // else 'node' | 'bitbot' | 'desktop' | 'mobile'
      console.log('Private host env detected')
      this.env = 'private-host'
    }
  }
  
  async init() {
    if (this.init) return

    // determine the node env
    await this.getEnv()

    // determine the storage adapter
    if (this.env === 'browser') {
      this.storage_adapter = 'browser'
    } else {
      this.storage_adapter = 'node'
    }

    this.storage = new Storage(this.storage_adapter)

    // init the profile
      // if no profile, will create a new default profile
      // if args, will create a new profile from args
      // if existing profile, will load from disk

    this.wallet = new Wallet()
    await this.wallet.init({
      storage: this.storage,
      options: {
        name: this.name,
        email: this.email,
        passphrase: this.passphrase
      }
    })

    // tracker 
    this.tracker = new Tracker(this.storage)

    // ledger 

    this.ledger = new Ledger(this.storage, this.wallet, this.tracker)

    // database

    this.database = new Database(this.storage, this.wallet)
    
    // network
    this.network = new Network(
      bootstrap = this.bootstrap, 
      gateway_nodes = this.gateway_nodes, 
      gateway_count = this.gateway_count, 
      delegated = this.delegated, 
      profile = this.wallet,
      tracker = this.tracker,
      env = this.env
    )

    this.network.on('join', () => this.emit('join'))
    this.network.on('leave', () => this.emit('leave'))
    this.network.on('connection', connection => this.emit('connection', connection.node_id))
    this.network.on('disconnection', connection => this.emit('disconnection', connection.node_id))  
    
    this.network.on('message', async (message) => {
      let valid = false

      // handle validation for gossiped messages here
      // specific rpc methods are emitted and handled in corresponding parent method

      switch(message.type) {
        case('pending-join'):
          break
        case('full-join'):
          break
        case('leave'):
          break
        case('failure'):
          break
        case('tx'):
          // first ensure we have a valid SSDB record wrapping the tx
          const record = Record.readUnpacked(message.data) 
          const recordTest = await record.isValid()
          if (recortTest.valid) {
            // then validate the tx data
            txTest = await this.ledger.onTx(record)
            if (txTest.valid) {
              const newMessage = this.network.createGenericMessage('tx', message.data)
              this.network.gossip(newMessage)
              this.emit('tx', message.data)
            }
          }          
          break
        case('block'):
          // first validate the immutable record on SSDB
          const record = Record.readUnpacked(message.data)
          const recordTest = await record.isValid()
          if (recordTest.valid) {
            // extract the block data and validate that in ledger
            blockTest = await this.ledger.onBlock(record)
            if (blockTest.valid) {
              const newMessage = this.network.createGenericMessage('block', message.data)
              this.network.gossip(newMessage)
              this.emit('block', message.data)
            }
          }
          break
        default:
          this.emit(message.type, message.data)
      }
    })

    this.init = true
    this.emit('ready')
  }

  async createProfile(options) {
    // create a new subspace identity 
    await this.wallet.createProfile(options)
  }

  async deleteProfile(name = 'profile') {
    // deletes the existing profile on disk
    await this.wallet.profile.clear()
  }

  // core network methods

  async join() {  
    // join the subspace network as a node
    await this.init()
    await this.network.join()   
    this.emit('connected')
  }

  async leave() {
    await this.network.leave()
    this.emit('disconnected')
  }

  async connect(nodeId) {
    await this.network.connect(nodeId)
    this.emit('connection', nodeId)
  }

  async disconnect(nodeId) {
    await this.network.discconnect(nodeId)
    this.emit('disconnected', nodeId)
  }

  async send(nodeId, message) {
    await this.network.send(nodeId, message)
  }

  // ledger tx methods

  async seedPlot(size) {
    // seed a plot on disk by generating a proof of space
    const profile = this.wallet.getProfile()
    const proof =  crypto.createProofOfSpace(profile.publicKey, size)
    await this.storage.put(proof.id, JSON.stringify(proof))
    this.wallet.profile.proof = proof
  }

  getBalance(address = this.wallet.profile.user.id) {
    return this.ledger.getBalance(address)
  }

  async sendCredits(amount, address) {
    // send subspace credits to another address
    const txRecord = await this.ledger.createCreditTx(profile.id, address, amount)
    const txMessage = await this.network.createGenericMessage('tx', txRecord.getRecord())
    this.network.gossip(txMessage)

    // should emit an event when tx is confirmed, later

    return txRecord
  }

  async pledgeSpace(interval) {
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
      interval: interval
    }

    // corresponding code for on('pledge')
    // should emit an event when tx is confirmed 

    this.network.gossip(txMessage)
    return txRecord
  }

  async requestHostPayment() {
    // on init, check if you have a pledge
    // if yes, then set a timer for payment 
    // emit an event when timer expires
    // call this funciton to request payment, and renew pledge 
  }

 
  async createMutableContract() {
    // this should be the default for now 
  }

  // may also want to add the ability to do pay per put since the ledger is much faster now

  reserveSpace({
    name = DEFAULT_CONTRACT_NAME,
    email = DEFAULT_CONTRACT_EMAIL,
    passphrase = DEFAULT_CONTRACT_PASSPHRASE,
    spaceReserved = DEFAULT_CONTRACT_SIZE,
    ttl = DEFAULT_CONTRACT_TTL,
    replicationFactor = DEFAULT_CONTRACT_REPLICATION_FACTOR
  }) {
    return new Promise(async (resolve) => {
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


      
      // create the immutable contract tx and tx record, with tx signed by contract keys

      // embed the contract id in the mutable state record 

      // create the contract state object and embed in the record 
        // public and private key are already embedded in the record 
        // tx_id of the contract funding tx (this can change over time)
        // signature that matches the same public key used for the funding tx 
        // current size of the contract in bytes
        // an index of all records in the contract 
        // possibly an ACL for users who may edit the contract and assigned space 

      // update the record (sign and pack)

      // push the contract to contract hosts with txRecord, and stateRecord


      const profile = this.wallet.getProfile()

      // init the public contract data
      const contractPublicData = {
        id: null,                                 // add after creating the record, hash of contract public key
        owner: profile.id,                        // my nodeId
        ttl: ttl,                                 // from args
        replicationFactor: replicationFactor,     // from args
        spaceReserved: spaceReserved,             // from args
        spaceUsed: 0,
        createdAt: Date.now(),
        updatedAt: null,
        recordIndex: new Set(),
        publicKey: null,                          // after creating the record, full public key of contract
      }
  
      // create the mutable encoded contract record, decrypted, from public contract data
      const encodedPublicContractRecord = await this.database.createMutableRecord(contractPublicData, null, false)
      const decodedPublicContractRecord = await this.database.readMutableRecord(encodedPublicContractRecord)
      
      // update the record with correct info 
      const newContent = {...decodedPublicContractRecord.value.content}
      newContent.id = decodedPublicContractRecord.key
      newContent.publicKey = decodedPublicContractRecord.value.publicKey
      newContent.updatedAt = Date.now()
      const finalPublicContractRecord = await this.database.updateMutableRecord(newContent, decodedPublicContractRecord)

      // reformat into interfaces expected by wallet
      const walletContract = {
        key: {
          id: newContent.id,
          type: 'contract',
          createdAt: newContent.createdAt,
          public: decodedPublicContractRecord.value.publicKey,
          private: decodedPublicContractRecord.value.privateKey,
          privateObject: await crypto.getPrivateKeyObject(decodedPublicContractRecord.value.privateKey, passphrase)

        },
        options: {
          id: newContent.id,
          owner: profile.id,
          name: name,
          email: email,
          passphrase: passphrase,
          ttl: ttl,
          replicationFactor: replicationFactor,
          spaceReserved: spaceReserved,
          createdAt: newContent.createdAt 
        },
        state: {
          spaceUsed: newContent.spaceUsed,
          updatedAt: newContent.updatedAt,
          recordIndex: newContent.recordIndex
        }
      }

      // store the contract in wallet, create tx and gossip
      const contract = this.wallet.contract.storeContract(walletContract)
      const tx = await this.ledger.createContractTx(contract)
      const gossipMessage = await this.network.createGenericMessage('tx', tx)
      this.network.gossip(gossipMessage)

      // contact the contract holders so they may initialize contract state
      const shardMap = this.database.computeShardAndHostsForKey(contract.id, contract.id, contract.spaceReserved, contract.replicationFactor)
      const hosts = new Set(...shardMap.hosts)
      this.addRequest('reserve', finalPublicContractRecord.key, hosts)

      const data = {
        tx: tx,
        contract: contract,
        record: finalPublicContractRecord
      }
      const hostMessage = await this.network.createGenericMessage('contract-request', data)

      for (const hostId of hosts) {
        this.network.send(hostId, hostMessage)
      }

      // when host to hold contract receives the contract-request
      this.on('contract-request', message => {

        // create the response object
        const response = {
          valid: false,
          description: null,
          contractId: message.data.record.value.id
        }
        
        // validate the contract-request
        const tx = message.data.tx
        const record = message.data.record
        const contract = message.data.contract
        const isValidTx = await this.ledger.onTx(tx)
        if (!isValidTx) {
          response.description = 'invalid tx for contract request'
          await this.createGenericMessage('contract-reply', response)
          this.network.send(message.data.nodeId, response)
          break
        }
          
        // validate the contract mutable record
        const testRequest = await this.database.isValidPutRequest(record, contract)
        if (!testRequest.valid) {
          response.description = testRequest.reason
          await this.createGenericMessage('put-reply', response)
          this.network.send(message.data.nodeId, response)
          break
        }

        // assume valid

        // write the record locally
        await this.database.put(record.key, record.value)

        // create or update shard, then update the shard
        const shardMap = this.database.computeShardAndHostsForKey(record.key, record.value.contract, contract.spaceReserved contract.replicationFactor)
        const shard = await this.database.getOrCreateShard(shardMap.id, contract.id)
        await this.database.addRecordToShard(shard.id, record)

        // return a proof of replication 
        const proof = this.database.createProofOfReplication(record, profile.id)

        // create valid contract-reply 
        response.valid = true
        response.description = proof
        
        await this.createGenericMessage('contract-reply', response)
        this.network.send(message.data.nodeId, response)
      })

      // when client receives the contract-reply from host
      this.network.on('contract-reply', message => {

        contract = this.getContract()

        // throw error if invalid response
        if (!message.data.valid) {
          throw new Error(message.data.description)
        }

        // validate the proof of replicaiton
        const value = await this.database.get(message.data.recordId)
        const record = {
          key: message.data.record.id,
          value: value
        }
        const typedRecord = this.database.setRecordType(record)
        const testPOR = this.database.isValidProofOfReplication(message.data.description, typedRecord, message.sender)
        if (!testPOR) {
          throw new Error('Host returned invalid proof of replication')
        }

        // remove the pending host
        const contract = this.wallet.getContract()
        const pendingHosts = this.getRequest('reserve', message.data.recordId)
        this.deleteHostFromRequest('reserve', message.data.recordId, message.sender)

        // resolve on the first reply
        if (pendingHosts.size = contract.replicationFactor) {

          // decode the record
          let decodedRecord = await this.database.readRecord(typedRecord)

          // hide schema implementation from developer
          delete decodedRecord.kind
          decodedRecord.value = decodedRecord.value.content
          resolve(record)
        }
        
        if (!pendingHosts.size) {
          // close out the pending requests
          const hosts = this.deleteRequest('reserve', message.data.recordId)


          // emit the event on final completion
          this.emit('reservation', message.data.recordId, hosts)
        }
      }) 
    })
  }

  // client request manager, since there can be many requests pending, mabye of diff types for the same record
  // should be abstracted out into a request object or class


  // core database methods
  async put(content, encrypted) {
    // create the record, get hosts, and send requests
    const contract = this.wallet.getContract()
    const record = await this.database.createRecord(content, encrypted)
    this.wallet.contract.addRecord(record.key, record.value.size)
    
    // create a put request signed by contract key
    const request = {
      record,
      contractKey: contract.publicKey,
      timestamp: Date.now(),
      signature: null
    }
    request.signature = await crypto.sign(JSON.stringify(request), contract.privateKeyObject)

    const hosts = this.database.getHosts(record.key, contract)
    await this.requests.add('put', record.key, request, hosts)
    
    this.on('put-request', (message) => {
      // validate the contract request
      const request = message.data 
      const record = this.database.loadRecord(request.record)
      const contract = this.ledger.contracts.get(crypto.getHash(request.contractKey))
      const testRequest = database.isValidPutRequest(record, contract, request)
      if (!testRequest.valid)  {
        this.requests.respond('put', false, testRequest.reason, record.key)
      }
      
      // validate the record
      const testValid = await record.isValid(message.sender)
      if (!testValid.valid)  {
        this.requests.respond('put', false, testValid.reason, record.key)
      }
     
      // store the record, create PoR, and send reply
      await database.saveRecord(record, contract)
      const proof = record.createPoR(this.wallet.profile.options.id)
      await this.requests.respond(message.sender, 'put', true, proof, record.key)
    })
  
    this.on('put-reply', (message) => {
      if (!message.data.valid) {
        throw new Error(message.data.data)
      }
  
      const profile = this.wallet.getProfile()
      const contract = this.wallet.getContract()
  
      // validate PoR
      const record = await database.getRecord(message.data.key)
      if (! record.isValidPoR(message.sender, message.data.data))  {
        throw new Error('Host returned invalid proof of replication')
      }
  
      // remove from pending requests and get size
      const pendingSize = this.requests.size('put', record.key)
      this.requests.remove('put', record.key, message.sender)
      const shardMap = this.database.getShardAndHostsForKey(record.key, contract)
      const hostLength = shardMap.hosts.length()
      
      // resolve on first valid response
      if (pendingSize === hostLength) {
        const content = await record.getContent(shardMap.id, contract.replicationFactor, profile.privateKeyObject)
        resolve(content.value)
      }
  
      // emit event and adjust contract when fully resolved
      if (pendingSize === 1) {
        this.rev(contract.id, contract)
        const hosts = this.requests.resolve('put', record.key)
        this.emit('put', record.key, hosts)
      }
    })
  }

  async get(key) {
    // get hosts and send requests
    const keyObject = this.database.parseKey(key)
    const contract = this.wallet.getContract()
    const hosts = database.getHosts(keyObject.recordId, contract)
    await this.requests.add('get', keyObject.recordId, keyObject, hosts)
  
    this.on('get-request', (message) => {
      // unpack key and validate request
      const keyObject = database.parseKey(message.data) 
      const record = await this.database.getRecord(keyObject.recordId) 
      const contract = this.ledger.contracts.get(crypto.getHash(record.value.contractKey))
      const testRequest = await database.isValidGetRequest(record, contract, keyObject.shardId)
      if (!testRequest.valid)  {
        this.requests.respond('get', false, testRequest.reason, keyObject.recordId)
      }
  
      // send the record and PoR back to client
      const proof = record.createPoR(this.wallet.profile.options.id)
      const data = { record, proof }
      await this.requests.respond(message.sender, 'get', true, data, record.key)
    })
  
    this.on('get-reply', (message) => {
      if (!message.data.valid) {
        throw new Error(message.data.data)
      }
  
      const profile = this.wallet.getProfile()
      const contract = this.wallet.getContract()
  
      // load/validate record and validate PoR
      const record = await database.loadRecord(message.data.data.record)
      if (! record.isValidPoR(message.sender, message.data.data.proof))  {
        throw new Error('Host returned invalid proof of replication')
      }
  
      // remove from pending requests and get size
      const pendingSize = this.requests.size('get', record.key)
      this.requests.remove('get', record.key, message.sender)
      const shardMap = this.database.getShardAndHostsForKey(record.key, contract)
      const hostLength = shardMap.hosts.length()
      
      // resolve on first valid response
      if (pendingSize === hostLength) {
        const content = await record.getContent(shardMap.id, contract.replicationFactor, profile.privateKeyObject)
        resolve(content.value)
      }
  
      // emit event and adjust contract when fully resolved
      if (pendingSize === 1) {
        const hosts = this.requests.resolve('get', record.key)
        this.emit('get', record.key, hosts)
      }
    })
  }
  
  async rev(key, value) {
  
    const keyObject = this.database.parseKey(key)
    const contract = this.wallet.getContract()
  
    // get the old record and update
    const oldRecord = await this.database.getRecord(key.recordId)
    if (oldRecord.value.immutable) {
      throw new Error('Cannot update an immutable record')
    }
    const newRecord = await this.database.revRecord(key, value)
    const sizeDelta = oldRecord.size() - newRecord.size()
    await this.wallet.contract.updateRecord(key, sizeDelta)

    // create a rev request signed by contract key
    const request = {
      newRecord,
      contractKey: contract.publicKey,
      timestamp: Date.now(),
      signature: null
    }
    request.signature = await crypto.sign(JSON.stringify(request), contract.privateKeyObject)
  
    // get hosts and send update requests
    const hosts = this.database.getHosts(record.key, contract)
    await this.requests.add('rev', newRecord.key, request, hosts)
  
    this.on('rev-request', (message) => {
      // load the request and new record
      const request = message.data 
      const newRecord = this.database.loadRecord(request.record)
      const oldRecord = await this.database.getRecord(newRecord.key)
      const contract = this.ledger.contracts.get(crypto.getHash(request.contractKey))
      const testRequest = await database.isValidRevRequest(oldRecord, newRecord, contract, keyObject.shardId, request)
      if (!testRequest.valid)  {
        this.requests.respond('rev', false, testRequest.reason, newRecord.key)
      }

      // validate the new record
      const testValid = await newRecord.isValid(message.sender)
      if (!testValid.valid)  {
        this.requests.respond('rev', false, testValid.reason, newRecord.key)
      }
  
      // update the record, create PoR and send reply
      await database.saveRecord(newRecord, contract, true, testRequest.data)
      const proof = record.createPoR(this.wallet.profile.options.id)
      await this.requests.respond(message.sender, 'rev', true, proof, newRecord.key)
    })
  
    this.on('rev-reply', (message) => {
      if (!message.data.valid) {
        throw new Error(message.data.data)
      }
  
      const profile = this.wallet.getProfile()
      const contract = this.wallet.getContract()
  
      // validate PoR
      const record = await database.getRecord(message.data.key)
      if (! record.isValidPoR(message.sender, message.data.data))  {
        throw new Error('Host returned invalid proof of replication')
      }
  
      // remove from pending requests and get size
      const pendingSize = this.requests.size('rev', record.key)
      this.requests.remove('rev', record.key, message.sender)
      const shardMap = this.database.getShardAndHostsForKey(record.key, contract)
      const hostLength = shardMap.hosts.length()
      
      // resolve on first valid response
      if (pendingSize === hostLength) {
        const content = await record.getContent(shardMap.id, contract.replicationFactor, profile.privateKeyObject)
        resolve(content.value)
      }
  
      // emit event and adjust contract when fully resolved
      if (pendingSize === 1) {
        this.rev(contract.id, contract)
        const hosts = this.requests.resolve('rev', record.key)
        this.emit('rev', record.key, hosts)
      }
    })
  }
  
  async del(key) {
    // get hosts and send requests
    const keyObject = this.database.parseKey(key)
    const contract = this.wallet.getContract()
    const hosts = database.getHostsFromKey(keyObject.recordId, contract)
    
    // create a del request signed by contract key
    const proof = {
      record: keyObject,
      contractKey: contract.publicKey,
      timestamp: Date.now(),
      signature: null
    }
    proof.signature = await crypto.sign(JSON.stringify(proof), contract.privateKeyObject)
  
    await this.requests.add('del', keyObject.recordId, proof, hosts)
  
    this.on('del-request', (message) => {
      // unpack key and validate request
      const request = message.data
      const keyObject = database.parseKey(message.data.record) 
      const record = await this.database.getRecord(keyObject.recordId)
      request.record = record
      const contract = this.ledger.contracts.get(crypto.getHash(request.contractKey))
      
      const testRequest = await database.isValidDelRequest(record, contract, keyObject.shardId, request)
      if (!testRequest.valid)  {
        this.requests.respond('del', false, testRequest.reason, keyObject.recordId)
      }
  
      // delete the record send PoD back to client
      await this.database.delRecord(record, keyObject.shardId)
      const proof = record.createPoD()
      await this.request.respond(message.sender, 'del', true, proof, record.key)
    })
  
    this.on('del-reply', (message) => {
      if (!message.data.valid) {
        throw new Error(message.data.data)
      }
  
      const profile = this.wallet.getProfile()
      const contract = this.wallet.getContract()
      const record = await database.getRecord(message.data.key)
  
      // load/validate record and validate PoD
      if (! record.isValidPoD(message.sender, message.data.data))  {
        throw new Error('Host returned invalid proof of deletion')
      }
  
      // remove from pending requests and get size
      const pendingSize = this.requests.size('del', record.key)
      this.requests.remove('del', record.key, message.sender)
      const shardMap = this.database.getShardAndHostsForKey(record.key, contract)
      const hostLength = shardMap.hosts.length()
      
      
      // resolve on first valid response
      if (pendingSize === hostLength) {
        resolve()
      }
  
      // emit event and adjust contract when fully resolved
      if (pendingSize === 1) {
        await this.storage.del(record.key)
        await this.wallet.contract.removeRecord(key, record.value.size)
        this.rev(contract.id, contract)
        const hosts = this.requests.resolve('del', record.key)
        this.emit('del', record.key, hosts)
      }
    })
  }

  // farmer methods

  async startFarmer() {
    if (this.bootstrap) {
      this.ledger.isFarming = true
      await this.ledger.bootstrap()
      
    } else {
      // start downloading the ledger
      // first get the chain array
      // for each block in chain
        // get the block
        // for each tx in block
          // get the tx 

      // on resolve, start farming 
      this.ledger.isFarming = true
    }
  }

  stopFarmer() {
    this.ledger.isFarming = false 
  }

  // host methods

  joinHosts(pledge) {
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
        resolve()
      }
      catch(error) {
        this.emit('error', error)
        reject(errror)
      }
    })
  }

  leaveHosts() {
    // gracefully leave the network as a valid host
  
  }
}
