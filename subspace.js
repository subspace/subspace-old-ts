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

  // small change

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

  requests: {
    pending: new Map(),
    async add(type, recordId, data, hosts) {
      // generate and send the request
      const message = await this.network.createGenericMessage(`${type}-request`, data)
      for (host of hosts) {
        this.network.send(host, message)
      }

      // add the requests and copy to pending
      this.requests.pending.set(crypto.getHash(type + recordId), hosts)
      this.requests.pending.set(crypto.getHash(recordId + type), hosts)
    },
    remove(type, recordId, host) {
      const key = cyrpto.getHash(type + recordId)
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
      return this.requests.pending.get(crypto.getHash(type + recordId)).size
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
    await this.initEnv()

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
      this.bootstrap,
      this.gateway_nodes,
      this.gateway_count,
      this.delegated,
      this.wallet,
      this.tracker,
      this.env
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

  reserveSpace({
    name = DEFAULT_CONTRACT_NAME,
    email = DEFAULT_CONTRACT_EMAIL,
    passphrase = DEFAULT_CONTRACT_PASSPHRASE,
    spaceReserved = DEFAULT_CONTRACT_SIZE,
    ttl = DEFAULT_CONTRACT_TTL,
    replicationFactor = DEFAULT_CONTRACT_REPLICATION_FACTOR
  }) {
    return new Promise(async (resolve, reject) => {
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
      this.on('contract-request', async message => {

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
          return
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
      this.network.on('contract-reply', async message => {
        // throw error if invalid response
        if (!message.data.valid) {
          reject(new Error(message.data.description))
          return
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
          reject(new Error('Host returned invalid proof of replication'))
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


  // core database methods
  put(content, encrypted) {
    return new Promise(async (resolve, reject) => {
      // create the record, get hosts, and send requests
      const contract = this.wallet.getContract()
      const record = await this.db.createRecord(content, encrypted)
      this.wallet.contract.addRecord(record.key, record.value.size)
      const hosts = this.db.getHosts(record.key, contract)
      await this.requests.add('put', record.key, record, hosts)

      this.on('put-request', async (message) => {
        // load and validate the record
        const record = this.db.loadRecord(message.data)
        const testValid = await record.isValid(message.sender)
        if (!testValid.valid)  {
          this.requests.respond('put', false, testValid.reason, record.key)
        }
        const contract = this.ledger.contracts.get(crypto.getHash(record.value.contractKey))
        const testRequest = db.isValidPutRequest(record, contract)
        if (!testRequest.valid)  {
          this.requests.respond('put', false, testRequest.reason, record.key)
        }

        // store the record, create PoR, and send reply
        await db.saveRecord(record, contract)
        const proof = record.createPoR(this.wallet.profile.options.id)
        await this.requests.respond(message.sender, 'put', true, proof, record.key)
      })

      this.on('put-reply', async (message) => {
        if (!message.data.valid) {
          reject(new Error(message.data.data))
          return
        }

        const profile = this.wallet.getProfile()
        const contract = this.wallet.getContract()

        // validate PoR
        const record = await db.getRecord(message.data.key)
        if (! record.isValidPoR(message.sender, message.data.data))  {
          reject(new Error('Host returned invalid proof of replication'))
          return
        }

        // remove from pending requests and get size
        const pendingSize = this.requests.size('put', record.key)
        this.requests.remove('put', record.key, message.sender)
        const shardMap = this.db.getShardAndHostsForKey(record.key, contract)
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
	})
  }

  get(key) {
    return new Promise(async (resolve, reject) => {
      // get hosts and send requests
      const keyObject = this.db.parseKey(key)
      const contract = this.wallet.getContract()
      const hosts = db.getHosts(keyObject.recordId, contract)
      await this.requests.add('get', keyObject.recordId, keyObject, hosts)

      this.on('get-request', async (message) => {
        // unpack key and validate request
        const keyObject = db.parseKey(message.data)
        const record = await this.db.getRecord(keyObject.recordId)
        const contract = this.ledger.contracts.get(crypto.getHash(record.value.contractKey))
        const testRequest = db.isValidGetRequest(record, contract, keyObject.shardId)
        if (!testRequest.valid)  {
          this.requests.respond('get', false, testRequest.reason, keyObject.recordId)
        }

        // send the record and PoR back to client
        const proof = record.createPoR(this.wallet.profile.options.id)
        const data = { record, proof }
        await this.requests.respond(message.sender, 'get', true, data, record.key)
      })

      this.on('get-reply', async (message) => {
        if (!message.data.valid) {
          reject(new Error(message.data.data))
          return
        }

        const profile = this.wallet.getProfile()
        const contract = this.wallet.getContract()

        // load/validate record and validate PoR
        const record = await db.loadRecord(message.data.data.record)
        if (! record.isValidPoR(message.sender, message.data.data.proof))  {
          reject(new Error('Host returned invalid proof of replication'))
          return
        }

        // remove from pending requests and get size
        const pendingSize = this.requests.size('get', record.key)
        this.requests.remove('get', record.key, message.sender)
        const shardMap = this.db.getShardAndHostsForKey(record.key, contract)
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
    })
  }

  rev (key, value) {
    return new Promise(async (resolve, reject) => {
      const keyObject = this.db.parseKey(key)
      const contract = this.wallet.getContract()

      // get the old record and update
      const oldRecord = await this.db.getRecord(key.recordId)
      if (oldRecord.value.immutable) {
        throw new Error('Cannot update an immutable record')
      }
      const newRecord = await this.db.revRecord(key, value)
      const sizeDelta = oldRecord.size() - newRecord.size()
      await this.wallet.contract.updateRecord(key, sizeDelta)

      // get hosts and send update requests
      const hosts = this.db.getHosts(record.key, contract)
      await this.requests.add('rev', newRecord.key, newRecord, hosts)

      this.on('rev-request', async (message) => {

        // load the new record and validate the request
        const record = this.db.loadRecord(message.data)
        const testValid = await record.isValid(message.sender)
        if (!testValid.valid)  {
          this.requests.respond('rev', false, testValid.reason, record.key)
        }

        const contract = this.ledger.contracts.get(crypto.getHash(record.value.contractKey))
        const testRequest = db.isValidRevRequest(record, contract)
        if (!testRequest.valid)  {
          this.requests.respond('rev', false, testRequest.reason, record.key)
        }

        // update the record, create PoR and send reply
        await db.saveRecord(record, contract, true, testRequest.data)
        const proof = record.createPoR(this.wallet.profile.options.id)
        await this.requests.respond(message.sender, 'rev', true, proof, record.key)
      })

      this.on('rev-reply', async (message) => {
        if (!message.data.valid) {
          reject(new Error(message.data.data))
          return
        }

        const profile = this.wallet.getProfile()
        const contract = this.wallet.getContract()

        // validate PoR
        const record = await db.getRecord(message.data.key)
        if (! record.isValidPoR(message.sender, message.data.data))  {
          reject(new Error('Host returned invalid proof of replication'))
          return
        }

        // remove from pending requests and get size
        const pendingSize = this.requests.size('rev', record.key)
        this.requests.remove('rev', record.key, message.sender)
        const shardMap = this.db.getShardAndHostsForKey(record.key, contract)
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
    })
  }

  del(key) {
    return new Promise(async (resolve, reject) => {
      // get hosts and send requests
      const keyObject = this.db.parseKey(key)
      const contract = this.wallet.getContract()
      const hosts = db.getHostsFromKey(keyObject.recordId, contract)

      // create a del request signed by contract key
      const proof = {
        key: keyObject,
        contract: contract.publicKey,
        timestamp: Date.now(),
        signature: null
      }
      proof.signature = await crypto.sign(JSON.stringify(proof), contract.privateKeyObject)

      await this.requests.add('del', keyObject.recordId, proof, hosts)

      this.on('del-request', async (message) => {
        // unpack key and validate request
        const keyObject = db.parseKey(message.data)

        const record = await this.db.getRecord(keyObject.recordId)
        const contract = this.ledger.contracts.get(crypto.getHash(record.value.contractKey))

        const testRequest = await db.isValidDelRequest(message.data.proof, record, contract, keyObject.shardId)
        if (!testRequest.valid)  {
          this.requests.respond('del', false, testRequest.reason, keyObject.recordId)
        }

        // delete the record send PoD back to client
        await this.db.delRecord(record, keyObject.shardId)
        const proof = record.createPoD()
        await this.request.respond(message.sender, 'del', true, proof, record.key)
      })

      this.on('del-reply', async (message) => {
        if (!message.data.valid) {
          reject(new Error(message.data.data))
          return
        }

        const profile = this.wallet.getProfile()
        const contract = this.wallet.getContract()
        const record = await db.getRecord(message.data.key)

        // load/validate record and validate PoD
        if (! record.isValidPoD(message.sender, message.data.data))  {
          reject(new Error('Host returned invalid proof of deletion'))
          return
        }

        // remove from pending requests and get size
        const pendingSize = this.requests.size('del', record.key)
        this.requests.remove('del', record.key, message.sender)
        const shardMap = this.db.getShardAndHostsForKey(record.key, contract)
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
    })
  }


  // core ledger methods

  async createProofOfSpace(space) {
    try {
      // seed a plot on disk by generating a proof of space
      // don't await this call, it could take a while!
      await this.init()
      const proof = await this.ledger.createProofOfSpace(space)
      await this.storage.put(proof.id, JSON.stringify(proof))
      this.wallet.profile.proof = proof
      return proof
    }
    catch(error) {
      this.emit('error', error)
      throw error
    }
  }

  async sendCredits(amount, address) {
    // send subspace credits to another address
    try {
      await this.init()
      // send a valid tx request to farmers mem pool as a host
      let tx = await this.ledger.createTx('credit', address, amount)
      this.network.gossip('tx', tx)
      return tx

      // corresponding code for on('tx')
      // need to also be notified when this tx has been confirmed
    }
    catch(error) {
      this.emit('error', error)
      throw error
    }
  }

  async farm() {
    try {
      if (this.bootstrap) {
        await this.ledger.bootstrap()
      }

      this.ledger.on('proposed-block', async block => {
        const message = await this.network.createGenericMessage('block', block)
        this.network.gossip(message)
        this.emit('proposed-block', block)
      })
    }
    catch(error) {
      this.emit('error', error)
      throw error
    }
  }

  async stopFarming() {
    try {
      // TODO
    }
    catch(error) {
      this.emit('error', error)
      throw error
    }
  }


  // core host methods

  async pledgeSpace(interval) {
    // creates and submits a pledges as a proof of space to the ledger as a host
    try {
      await this.init()
      let tx = await this.ledger.createPledgeTx(interval)
      this.wallet.profile.pledge = tx.value.script
      this.network.gossip('tx', tx)
      return tx

      // corresponding code for on('pledge')
      // need to also be notified when this pledge has been confirmed
    }
    catch(error) {
      this.emit('error', error)
      throw error
    }
  }

  async joinHosts(pledge) {
    // requirements
      // created a pledge
      // submitted the pledge tx to the chain
      //
    // join the network as a valid host with a pledge
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
    }
    catch(error) {
      this.emit('error', error)
      throw error
    }
  }

  leaveHosts() {
    // gracefully leave the network as a valid host

  }



}
