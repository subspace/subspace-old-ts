const EventEmitter = require('events')
const crypto = require('@subspace/crypto')
const Wallet = require('@subspace/wallet')
const Storage = require('@subspace/storage')
const Network = require('@subspace/network')
const Tracker = require('@subspace/tracker')
const Ledger = require('@subspace/ledger')
const Database = require('@subspace/database')

const DEFAULT_PROFILE_NAME = 'name'
const DEFAULT_PROFILE_EMAIL = 'name@name.com'
const DEFAULT_PROFILE_PASSPHRASE = 'passphrase'
const DEFAULT_HOST_PLEDGE = 10000000000 // 10 GB in bytes
const DEFAULT_HOST_INTERVAL = 2628000000 // 1 month in ms
const DEFAULT_GATEWAY_NODES = []
const DEFAULT_GATEWAY_COUNT = 1
const DEFAULT_CONTRACT_NAME = 'dev'
const DEFAULT_CONTRACT_EMAIL = 'dev@subspace.networ'
const DEFAULT_CONTRACT_PASSPHRASE = 'passphrase'
const DEFAULT_CONTRACT_SIZE = 1000000000  // 1 GB in bytes
const DEFAULT_CONTRACT_TTL = 2628000000   // 1 month in ms
const DEFAULT_CONTRACT_REPLICATION_FACTOR = 2

export default class Subspace extends EventEmitter {

  constructor({
    name = DEFAULT_PROFILE_NAME,
    email = DEFAULT_PROFILE_EMAIL,
    passphrase = DEFAULT_CONTRACT_PASSPHRASE,
    pledge = null,
    interval = null,
    bootstrap = false, 
    gateway_nodes = DEFAULT_GATEWAY_NODES,
    gateway_count = DEFAULT_GATEWAY_COUNT, 
    delegated = false
  }) {
    super()

    this.isInit = false
    this.name = name
    this.email = email 
    this.passphrase = passphrase
    this.pledge = pledge
    this.interval = interval
    this.bootstrap = bootstrap
    this.gateway_nodes = gateway_nodes
    this.gateway_count = gateway_count
    this.delegated = delegated
    this.env = null
    this.storage_adapter = null
    this.requests = new Map()
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

    this.db = new Database(this.storage, this.wallet)
    
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
      // need to validate singature and timestamps on all here first

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
          valid = await this.ledger.onTx(message.data)
          if (valid) {
            const newMessage = this.network.createGenericMessage('tx', message.data)
            this.network.gossip(newMessage)
            this.emit('tx', message.data)
          }
          break
        case('block'):
          valid = await this.ledger.onBlock(message.data)
          if (valid) {
            const newMessage = this.network.createGenericMessage('block', message.data)
            this.network.gossip(newMessage)
            this.emit('block', message.data)
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
    if (this.bootstrap) {
      // Create the tracker
      // Create the ledger 
    }      
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

  async createContract(
    name = DEFAULT_CONTRACT_NAME,
    email = DEFAULT_CONTRACT_EMAIL,
    passphrase = DEFAULT_CONTRACT_PASSPHRASE,
    spaceReserved = DEFAULT_CONTRACT_SIZE,
    ttl = DEFAULT_CONTRACT_TTL,
    replicationFactor = DEFAULT_CONTRACT_REPLICATION_FACTOR
  ) {
    // creates the contract record locally 
    // returns a contract object

  }

  async getMyContract(id) {
    // reads the contract and outputs as a contract object
  }

  reserveSpace({
    name = DEFAULT_CONTRACT_NAME,
    email = DEFAULT_CONTRACT_EMAIL,
    passphrase = DEFAULT_CONTRACT_PASSPHRASE,
    spaceReserved = DEFAULT_CONTRACT_SIZE,
    ttl = DEFAULT_CONTRACT_TTL,
    replicationFactor = DEFAULT_CONTRACT_REPLICATION_FACTOR
  }) {
    return new Promise(async (resolve) => {
      // create a new storage contract and keys locally
      // submit contract tx to farmers
      // encode the contract as a plain text mutable record
      // store the record on the correct hosts for this contract
      
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
      const encodedPublicContractRecord = await this.db.createMutableRecord(contractPublicData, null, false)
      const decodedPublicContractRecord = await this.db.readMutableRecord(encodedPublicContractRecord)
      
      // update the record with correct info 
      const newContent = {...decodedPublicContractRecord.value.content}
      newContent.id = decodedPublicContractRecord.key
      newContent.publicKey = decodedPublicContractRecord.value.publicKey
      newContent.updatedAt = Date.now()
      const finalPublicContractRecord = await this.db.updateMutableRecord(newContent, decodedPublicContractRecord)

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
      const shardMap = this.db.computeShardAndHostsForKey(contract.id, contract.id, contract.spaceReserved, contract.replicationFactor)
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
        const testRequest = await this.db.isValidPutRequest(record, contract)
        if (!testRequest.valid) {
          response.description = testRequest.reason
          await this.createGenericMessage('put-reply', response)
          this.network.send(message.data.nodeId, response)
          break
        }

        // assume valid

        // write the record locally
        await this.db.put(record.key, record.value)

        // create or update shard, then update the shard
        const shardMap = this.db.computeShardAndHostsForKey(record.key, record.value.contract, contract.spaceReserved contract.replicationFactor)
        const shard = await this.db.getOrCreateShard(shardMap.id, contract.id)
        await this.db.addRecordToShard(shard.id, record)

        // return a proof of replication 
        const proof = this.db.createProofOfReplication(record, profile.id)

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
        const value = await this.db.get(message.data.recordId)
        const record = {
          key: message.data.record.id,
          value: value
        }
        const typedRecord = this.db.setRecordType(record)
        const testPOR = this.db.isValidProofOfReplication(message.data.description, typedRecord, message.sender)
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
          let decodedRecord = await this.db.readRecord(typedRecord)

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

  addRequest(type, recordId, data) {
    const key = crypto.getHash(type + recordId)
    this.requests.set(key, data)
    const copyKey = crypto.getHash(recordId + type)
    this.requests.set(key, data)
  }

  getRequest(type, recordId) {
    const key = crypto.getHash(type + recordId)
    return this.requests.get(key)
  }

  deleteHostFromRequest(type, recordId, hostId) {
    const key = crypto.getHash(type + recordId)
    const pending = this.requests.get(key)
    pending.delete(hostId)
    this.requests.set(key, pending)
  }

  deleteRequest(type, recordId) {
    const key = crypto.getHash(type + recordId)
    this.requests.delete(key)
    const copyKey = crypto.getHash(recordId + type)
    const originalHosts = this.requests.get(copyKey)
    this.requests.delete(copyKey)
    return originalHosts
  }

  // core database methods

  put(value, enrypted = true) {
    return new Promise ( async (resolve) => {
      // put a value to SSDB using my default storage contract 

      // encode the record, store locally, and update my local contract
      const contract = this.wallet.getContract()
      const record = await this.db.createRecord(value, contract, encrypted)
      await this.db.put(record.key, record.value)
      await this.wallet.contract.addRecord(record.key, record.value.size)

      // track the requests for all hosts
      const shardMap = await this.db.computeShardAndHostsForKey(record.key, contract.id, contract.size, contract.replicationFactor)
      let puts = new Set(...shardMap.hosts)
      this.addRequest('put', record.key, puts)

      // send the request to each host
      record.key = `${record.key}:${shardMap.id}:${contract.replicationFactor}`
      const message = await this.createGenericMessage('put-request', record)
      for (const hostId of shardMap.hosts) {
        this.network.send(hostId, message)
      }

      // when host receives the put-rquest
      this.on('put-request', (message) => {

        const record = message.data
        const profile = this.wallet.getProfile()
        const contract = this.ledger.contracts.get(record.value.contract)

        // unpack the record address
        const key = this.db.parskey(record.key)
        record.key = key.recordId

        // create the response object
        const response = {
          valid: false,
          description: null,
          recordId: record.key
        }

        const testRequest = await this.db.isValidPutRequest(record, contract)

        if (!testRequest.valid) {
          response.description = testRequest.reason
          await this.createGenericMessage('put-reply', response)
          this.network.send(message.data.nodeId, response)
          break
        }
          
        // validate I am the correct host
        const shardMap = this.db.computeShardAndHostsForKey(record.key, record.value.contract, contract.spaceReserved contract.replicationFactor)
        if (!shardMap.hosts.includes(profile.id)) {
          response.description = 'Incorrect host for shard'
          await this.createGenericMessage('put-reply', response)
          this.network.send(message.data.nodeId, response)
          break
        }

        // otherwise valid

        // write the record locally
        await this.db.put(record.key, record.value)

        // create or update shard, then update the shard
        const shard = await this.db.getOrCreateShard(shardMap.id, contract.id)
        await this.db.addRecordToShard(shard.id, record)

        // return a proof of replication 
        const proof = this.db.createProofOfReplication(record, profile.id)

        // create valid put-reply 
        response.valid = true
        response.description = proof
        
        await this.createGenericMessage('put-reply', response)
        this.network.send(message.data.nodeId, response)
      })

      // when I receive the put-reply
      this.on('put-reply', (message) => {
        if (!message.data.valid) {
          throw new Error(message.data.description)
        }

        // validate the proof of replicaiton
        const value = await this.db.get(message.data.recordId)
        const record = {
          key: message.data.record.id,
          value: value
        }
        const typedRecord = this.db.setRecordType(record)
        const testPOR = this.db.isValidProofOfReplication(message.data.description, typedRecord, message.sender)
        if (!testPOR) {
          throw new Error('Host returned invalid proof of replication')
        }

        // remove the pending put
        const contract = this.wallet.getContract()
        const pendingPuts = this.getRequest('put', message.data.recordId)
        this.deleteHostFromRequest('put', message.data.recordId, message.sender)

        // resolve on the first reply
        if (pendingPuts.size = contract.replicationFactor) {

          // decode the record
          let decodedRecord = await this.db.readRecord(typedRecord)

          // hide schema implementation from developer
          delete decodedRecord.kind
          decodedRecord.value = decodedRecord.value.content
          resolve(record)
        }
        
        // received the final put reply
        if (!pendingPuts.size) {
          // close out the pending requests
          const hosts = this.deleteRequest('put', message.data.recordId)

          // update contract on remote hosts
          this.rev(contract.id, contract)

          // emit the event on final completion
          this.emit('put', message.data.recordId, hosts)
        }
      })
    })
  }

  get(key) {
    return new Promise(async (resolve) => {
      // get a record from the network given a valid key

      // compute the hosts from shard
      let keyObject = this.db.parseKey(key)
      let shards = this.db.computeHostsforShards([keyObject.shardId], keyObject.replicationFactor)
      let hosts = shards[0].hosts

       // track the requests for all hosts
       let gets = new Set(...hosts)
       this.addRequest('get', keyObject.recordId, gets)

      // create and send the message to all hosts
      const data = {
        recordId: keyObject.recordId,
        shardId: keyObject.shardId
      }
      const message = this.network.createGenericMessage('get-request', data)
      for (const hostId of hosts) {
        this.network.send('get-request', hostId, message)
      }

      this.on('get-request', message => {

        const recordId = message.data.key 
        const shardId = message.data.shard

        const response = {
          valid: false,
          description: null,
          recordId: key,
          proof: null
        }

        // am I the valid host for this shard?
        const shard = await this.db.getShard(shardId)
        if (!shard) {
          response.description = 'Incorrect host for shard'
          await this.createGenericMessage('get-reply', response)
          this.network.send(message.data.nodeId, response)
          break
        }

        // is this the valid shard for this key
        if (!shard.records.includes(recordId)) {
          response.description = 'Incorrect shard for key'
          await this.createGenericMessage('get-reply', response)
          this.network.send(message.data.nodeId, response)
          break
        }

        // do I have the record?
        const encodedValue = await this.storage.get(recordId)
        if (!encodedValue) {
          response.description = 'Key not found on host'
          await this.createGenericMessage('get-reply', response)
          this.network.send(message.data.nodeId, response)
          break
        }

        const encodedRecord = {
          key: recordId,
          value: encodedValue
        }

        const typedRecord = this.db.setRecordType(encodedRecord)

        // send the encoded record with proof of replication
        const profile = this.wallet.getProfile()
        response.valid = true
        response.description = typedRecord
        response.proof = this.db.createProofOfReplication(typedRecord, profile.id)
        await this.createGenericMessage('get-reply', response)
        this.network.send(message.data.nodeId, response)
      })


      this.on('get-reply', message => {
        if (!message.data.valid) {
          throw new Error(message.data.description)
        }

        // validate the record schema, will throw errors if invalid
        cosnst typedRecord = message.data.description
        let record = await this.db.readRecord(typedRecord)

        // validate unique encoding for each replica
        const proofTest = this.db.isValidProofOfReplication(message.data.proof, typedRecord, message.sender)
        if (!proofTest) {
          throw new Error(`Invalid proof of replication, for record retrieved from ${message.sender}`)
        }

        // remove the pending get
        const contract = this.wallet.getContract()
        const pendingGets = this.getRequest('get', message.data.recordId)
        this.deleteHostFromRequest('get', message.data.recordId, message.sender)

        // resolve on the first reply
        if (pendingGets.size = contract.replicationFactor) {
          // hide schema implementation from developer
          delete record.kind
          record.value = record.value.content
          resolve(record)
        }

        // emit an event once all requests have resolved
        if (!pendingGets.size) {
          // delete the request
          const hosts = this.deleteRequest('get', message.data.recordId)
          this.emit('get', message.data.recordId, hosts)
        }
      })
    })
  }

  rev(key, value) {
    return new Promise(async (resolve) => {
      // update a mutable value on SSDB that I control

      // fetch the old record and contract
      const contract = this.wallet.getContract()
      const encodedValue = await this.db.get(key)
      const encodedRecord = {
        key: message.data.record.id,
        value: encodedValue
      }

      const typedRecord = this.db.setRecordType(encodedRecord)

      // check if record is immutable
      if (typedRecord.kind === 'immutable') {
        throw new Error('Cannot update an immutable record')
      }

      // decode and mutate the record
      const decodedRecord = await this.db.readRecord(typedRecord)
      const record = await this.db.updateMutableRecord(decodedRecord, value)
      const sizeDelta = Buffer.from(JSON.stringify(record)).bytelength - Buffer.from(JSON.stringify(decodedRecord)).bytelength

      // store locally and update the contract
      await this.db.put(record.key, record.value)
      await this.wallet.contract.updateRecord(record.key, sizeDelta)

      // track the requests for all hosts
      const shardMap = await this.db.computeShardAndHostsForKey(record.key, contract.id, contract.size, contract.replicationFactor)
      let revs = new Set(...shardMap.hosts)
      this.addRequest('rev', record.key, revs)

      // send the request to each host
      record.key = `${record.key}:${shardMap.id}:${contract.replicationFactor}`
      const message = await this.createGenericMessage('rev-request', record)
      for (const hostId of shardMap.hosts) {
        this.network.send(hostId, message)
      }

      this.on('rev-request', message => {
        const record = message.data
        const profile = this.wallet.getProfile()
        const contract = this.ledger.contracts.get(record.value.contract)

        // unpack the record address
        const key = this.db.parskey(record.key)
        record.key = key.recordId

        // create the response object
        const response = {
          valid: false,
          description: null,
          recordId: record.key
        }

        // get the old record and compare
        const oldValue = await this.db.get(record.key)
        if (!oldValue) {
          response.description = 'Old record not found at host'
          await this.createGenericMessage('rev-reply', response)
          this.network.send(message.data.nodeId, response)
          break
        }

        const oldRecord = {
          key: message.data.record.id,
          value: oldValue
        }

        const typedOldRecord = this.db.setRecordType(oldRecord)
        
        const testRequest = await this.db.isValidRevRequest(typedOldRecord, record, contract)
        if (!testRequest.valid) {
          response.description = testRequest.reason
          await this.createGenericMessage('rev-reply', response)
          this.network.send(message.data.nodeId, response)
          break
        }

        // validate I am the correct host
        const shardMap = this.db.computeShardAndHostsForKey(record.key, record.value.contract, contract.spaceReserved contract.replicationFactor)
        if (!shardMap.hosts.includes(profile.id)) {
          response.description = 'Incorrect host for shard'
          await this.createGenericMessage('rev-reply', response)
          this.network.send(message.data.nodeId, response)
          break
        }

        // otherwise valid

        // write the record locally
        await this.db.put(record.key, record.value)

        // update the shard
        await this.db.addRecordToShard(key.shardId, record)

        // return a proof of replication 
        const proof = this.db.createProofOfReplication(record, profile.id)

        // create valid rev-reply 
        response.valid = true
        response.description = proof
        
        await this.createGenericMessage('rev-reply', response)
        this.network.send(message.data.nodeId, response)
      })

      this.on('rev-reply', message => {
        // validate the reply 
        if (!message.data.valid) {
          throw new Error(message.data.description)
        }

        // validate the proof of replicaiton
        const value = await this.db.get(message.data.recordId)
        const record = {
          key: message.data.record.id,
          value: value
        }
        const typedRecord = this.db.setRecordType(record)
        const testPOR = this.db.isValidProofOfReplication(message.data.description, typedRecord, message.sender)
        if (!testPOR) {
          throw new Error('Host returned invalid proof of replication')
        }

        // remove the pending rev
        const contract = this.wallet.getContract()
        const pendingRevs = this.getRequest('rev', message.data.recordId)
        this.deleteHostFromRequest('rev', message.data.recordId, message.sender)

        // resolve on the first reply
        if (pendingRevs.size = contract.replicationFactor) {

          // get and decode the record
          const encodedValue = await this.db.get(message.data.recordId)
          const encodedRecord = {
            key: message.data.record.id,
            value: encodedValue
          }
          const typedRecord = this.db.setRecordType(encodedRecord)
          let decodedRecord = await this.db.readRecord(typedRecord)

          // hide schema implementation from developer
          delete decodedRecord.kind
          decodedRecord.value = decodedRecord.value.content
          resolve(record)
        }

        // received the final rev reply
        if (!pendingRevs.size) {
          const hosts = this.deleteRequest('rev', message.data.recordId)

          // update contract on remote hosts
          this.rev(contract.id, contract)

          // emit the event on final completion
          this.emit('rev', message.data.recordId, hosts)
        }
      }) 
    })
  }

  del(key) {
    return new Promise(async (resolve, reject) => {
      // delete a record from SSDB that I control

      // get the record, delete it, and update local contract
      const contract = this.wallet.getContract()
      const value = await this.db.get(key)
      const record = { key, value }
      await this.db.del(key)
      await this.wallet.contract.removeRecord(record.key, record.value.size)

      // track the requests for all hosts
      const shardMap = await this.db.computeShardAndHostsForKey(record.key, contract.id, contract.size, contract.replicationFactor)
      let dels = new Set(...shardMap.hosts)
      this.addRequest('del', record.key, dels)

      // create a del request signed by contract key
      const proof = {
        key: `${record.key}:${shardMap.id}:${contract.replicationFactor}`,
        contract: contract.id,
        timestamp: Date.now(),
        signature: null
      }
      proof.signature = await crypto.sign(JSON.stringify(proof), contract.privateKeyObject)
      const message = await this.createGenericMessage('del-request', proof)
      for (const hostId of shardMap.hosts) {
        this.network.send(hostId, message)
      }

      this.on('del-request', message => {
 
        const proof = message.data
        const profile = this.wallet.getProfile()
        const contract = this.ledger.contracts.get(record.value.contract)

        // unpack the record address
        const key = this.db.parskey(proof.key)

        // create the response object
        const response = {
          valid: false,
          description: null,
          recordId: key.recordId
        }

        // validate I have the record
        const encodedValue = await this.db.get(key.recordId)

        if (!encodedValue) {
          response.description = 'Host does not have key for del request'
          await this.createGenericMessage('del-reply', response)
          this.network.send(message.data.nodeId, response)
          break
        }

        const record = {
          key: key.recordId,
          value: encodedValue
        }
        const typedRecord = this.db.setRecordType(record)

        // validate  delete request
        const testDelete = await this.db.isValidDelRequest(proof, typedRecord, contract)
        if (!testDelete) {
          response.description = testDelete.reason
          await this.createGenericMessage('del-reply', response)
          this.network.send(message.data.nodeId, response)
          break
        }

        // validate I am the correct host
        const shardMap = this.db.computeShardAndHostsForKey(key.recordId, contract.id, contract.spaceReserved contract.replicationFactor)
        if (!shardMap.hosts.includes(profile.id)) {
          response.description = 'Incorrect host for shard'
          await this.createGenericMessage('del-reply', response)
          this.network.send(message.data.nodeId, response)
          break
        }

        // otherwise valid

        // delete the record locally
        await this.db.del(record.key)

        // update the shard
        await this.db.removeRecordFromShard(key.shardId, record)

        // send the reply
        response.valid = true
        await this.createGenericMessage('del-reply', response)
        this.network.send(message.data.nodeId, response)
      })

      this.on('del-reply', message => {
        // validate the reply
        if (!message.data.valid) {
          throw new Error(message.data.description)
        }

        // remove the pending del
        const contract = this.wallet.getContract()
        const pendingDels = this.getRequest('del', message.data.recordId)
        this.deleteHostFromRequest('del', message.data.recordId, message.sender)

        // resolve on first reply
        if (pendingDels.size = contract.replicationFactor) {          
          resolve()
        }

        // received the final del reply
        if (!pendingDels.size) {
          // close out the pending requests
          const hosts = this.deleteRequest('del', message.data.recordId)

          // update contract on remote hosts
          this.rev(contract.id, contract)

          // emit the event on final completion
          this.emit('del', message.data.recordId, hosts)
        }
      })
    })
  }


  // core ledger methods

  createProofOfSpace(space) {
    return new Promise(async (resolve, reject) => {
      try {
        // seed a plot on disk by generating a proof of space
        // don't await this call, it could take a while!
        await this.init()
        const proof = await this.ledger.createProofOfSpace(space)
        await this.storage.put(proof.id, JSON.stringify(proof))
        this.wallet.profile.proof = proof
        resolve(proof)
      }
      catch(error) {
        this.emit('error', error)
        reject(errror)
      }
    })
  }

  sendCredits(amount, address) {
    // send subspace credits to another address
    return new Promise(async (resolve, reject) => {
      try {
        await this.init()
        // send a valid tx request to farmers mem pool as a host
        let tx = await this.ledger.createTx('credit', address, amount)
        this.network.gossip('tx', tx)
        resolve(tx)

        // corresponding code for on('tx')
        // need to also be notified when this tx has been confirmed
      }
      catch(error) {
        this.emit('error', error)
        reject(errror)
      }
    })
  }

  farm() {
    return new Promise(async (resolve, reject) => {
      try {
        if (this.bootstrap) {
          await this.ledger.bootstrap()
        }
    
        this.ledger.on('proposed-block', block => {
          const message = await this.network.createGenericMessage('block', block)
          this.network.gossip(message)
          this.emit('proposed-block', block)
        })

        resolve()
      }
      catch(error) {
        this.emit('error', error)
        reject(errror)
      }
    })    
  }

  stopFarming() {
    return new Promise(async (resolve, reject) => {
      try {
        resolve()
      }
      catch(error) {
        this.emit('error', error)
        reject(errror)
      }
    })
  }


  // core host methods

  pledgeSpace(interval) {
    // creates and submits a pledges as a proof of space to the ledger as a host
    return new Promise(async (resolve, reject) => {
      try {
        await this.init()
        let tx = await this.ledger.createPledgeTx(interval)
        this.wallet.profile.pledge = tx.value.script
        this.network.gossip('tx', tx)
        resolve(tx)

        // corresponding code for on('pledge')
        // need to also be notified when this pledge has been confirmed
      }
      catch(error) {
        this.emit('error', error)
        reject(errror)
      }
    })
  }

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
