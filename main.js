const EventEmitter = require('events')
const crypto = require('@subspace/crypto')
const profile = require('@subspace/profile')
const Storage = require('@subspace/storage')
const Network = require('@subspace/network')
const Tracker = require('@subspace/tracker')
const Ledger = require('@subspace/ledger')
const Database = require('@subspace/db')


export default class Subspace extends EventEmitter {

  constructor({
    name = 'name',
    email = 'name@email.com',
    passphrase = 'passphrase',
    pledge = null,
    interval = null,
    bootstrap = false, 
    gateway_nodes = [],
    gateway_count = 1, 
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
    
  }

  async getEnv() {
    try {
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
      return
    }
    catch (error) {
      console.log('Error getting env')
      console.log(error)
      this.emit('error', error)
      return error
    }
  }

  async init() {
    try {

      if (this.init) {
        return
      }

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

      this.profile = new profile()
      await this.profile.init({
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

      this.ledger = new Ledger(this.storage, this.profile)

      // database

      this.db = new Database(this.storage, this.profile)
      
      // network
      this.network = new Network(
        bootstrap = this.bootstrap, 
        gateway_nodes = this.gateway_nodes, 
        gateway_count = this.gateway_count, 
        delegated = this.delegated, 
        profile = this.profile,
        tracker = this.tracker,
        env = this.env
      )

      this.network.on('connected', () => {
        this.emit('connected')
      })
  
      this.network.on('disconnected', () => {
        this.emit('disconnected')
      })
      
      this.network.on('connection', connection => {
        // fired when a new active connection is opened over any TCP, WS, or WRTC socket
        this.emit('connection', connection.node_id)
      })
  
      this.network.on('disconnection', connection => {
        // fired when an existing active conneciton is close
        this.emit('disconnection', connection.node_id)
      })  
  
      this.network.on('message', message => {
        // fired when any new message is received 
        this.emit('message', message)
      })
  
      this.network.on('error', error => {
        // fired when any error is received
        this.emit('error', error)
      })

      this.network.on('put-request', (record, node_id) => {
        // emitted when this node receives a put request from another node
        await this.db.put(record)
        // should use the same tcp connection that is still open ...
        this.network.send('put-response', node_id)
        this.emit('put', record, node_id)
      })
      
      this.network.on('get-request', key => {
        // emitted when this node receives a get request from another node
        let record = await this.db.get(key)
        this.network.send('get-response', record, node_id)
        this.emit('get', record, node_id)
      })
  
      this.network.on('new-block', block => {
        // emmited when a new block is received via gossip
        // check if you already have the block, if not rebroadcast to unique neighbors
        // validate the block
        // if valid, add to the ledger
        // update balances
        // emit the event 
      })
  
      this.network.on('new-tx', tx => {
        // emitted when a new tx is received via gossip
        // could be credit tx, pledge, or new contract 
        // send to the ledger for validation
        // announce the event-type
        // re-gossip if needed to appropriate neighbors 
      })

      this.init = true
      this.emit('ready')
      return
    }
    catch (error) {
      console.log('Error creating new subspace identity')
      console.log(error)
      this.emit('error', error)
      return(error)
    }
  }

  async createProfile(options) {
    // create a new subspace identity 
    try {
      this.profie = await profile.create(options)
      await this.profile.saveProfile()
      return
    }
    catch (error) {
      console.log('Error creating new subspace identity')
      console.log(error)
      this.emit('error', error)
      return(error)
    }
  }

  async loadProfile(name='profile') {
    // opens an existing profile from disk
    try {
      await this.profile.loadProfile(name)
      return
    } 
    catch (error) {
      console.log('Error loading profile from disk')
      console.log(error)
      this.emit('error', error)
      return(error)
    }
  }

  async deleteProfile(name = 'profile') {
    // deletes the existing profile on disk
    try {
      await this.profile.deleteProfile(name)
      return
    }
    catch (error) {
      console.log('Error clearing profile')
      console.log(error)
      this.emit('error', error)
      return(error)
    }
  }

  async join() {  
    try {
      await this.init()

      const joined = await this.network.join()
      if (joined) {
        if (this.bootstrap) {
          // Create the tracker
          // Create the ledger 
        }
    
      } else {
        console.log('Could not join the network, trackers are out of sync')
      }

      return

    }
    catch (error) {
      console.log('Error connecting to the subspace network')
      console.log(error)
      return error
    }
  }

  async leave() {
    // disconnect from the subspace network gracefully as a node
    try {
      this.network.leave()
      return
    }
    catch (error) {
      console.log('Error disconnecting from the subspance network')
      console.log(error)
      return error
    }
  }

  async connect(node_id) {
    try { 
      // call the init funciton 
      // everywhere else if not init, call the init function 

      if (!this.isInit) {
        await this.init()
      }

      await this.network.connect(node_id)
    }
    catch (error) {
      console.log('Error connecting to node')
      console.log(error)
      return
    }
  }

  async discconnect(node_id) {
    try {
      this.network.discconnect(node_id)
      return
    }
    catch (error) {
      console.log('Error disconnecting from node')
      console.log(error)
      return
    }
  }

  async send(node_id, message) {
    try {
      return await this.network.send(node_id, message)
    }
    catch (error) {
      console.log('Error sending message')
      console.log(error)
      return error
    }
  }

  async put(value) {
    // put a valid record to the network given a vaild contract
    // value can be of type
      // string 
      // number
      // boolean
      // array
      // object
      // buffer 

    // key will be created from the value and returned 
    try {
      let record = await this.db.encode(value)
      let key = record.key 
      let contract = this.profile.contracts[0] // object 
      let shard_id = await this.db.computeShard(contract.contract_id, key)
      let hosts = await this.tracker.computeHosts(shard_id) // -> []
      // connect to each host and send them the request
      for (let host in hosts) {
        this.network.send('put-request', host, record)
      }
      // connect to lead host and send them a delegated request

      // write corresponding code for on('put') 

    }
    catch (error) {
      console.log('Error putting record to network')
      console.log(errror)
    }
  }

  async get(key) {
    // get a record from the network given a valid key
    // key will be in the format shard_id:record_id
    try {
      let key_object = this.db.unpack(key)
      let hosts = await this.tracker.computeHosts(key_object.shard_id)
      let closest_host = this.network.getClosestHost(hosts)
      let record = await this.network.send('get-request', closest_host, key)
      return record
      // write corresponding code for on('get')
      // alternatively could fetch from all four hosts and merge the set

    }
    catch (error) {
      console.log('Error getting record from network')
      console.log(error)
    }
  }

  async createPledge(key, space) {
    // seed a plot on disk by generating a proof of space
    // don't await this call, it could take a while!
    try {
      await this.init()
      const proof = await this.ledger.createProof(key, space)
      this.profile.proof = proof
      return proof
    }
    catch (error) {
      console.log('Error seeding plot')
      console.log(error)
    }
  }

  async submitPledge() {
    // pledge a proof of space to the ledger as a host
    try {
      await this.init()
      let tx = await this.ledger.createPledge(this.profile.proof)
      this.network.gossip('tx', tx)
      return tx

      // corresponding code for on('pledge')
      // need to also be notified when this pledge has been confirmed

    }
    catch (error) {
      console.log('Error pledging space to ledger')
      console.log(error)
    }
  }

  async sendCredits(amount, address) {
    // send subspace credits to another address
    try {
      await this.init()
      // send a valid tx request to farmers mem pool as a host
      let tx = await this.ledger.sendCredits(amount, address)
      this.network.gossip('tx', tx)
      return tx

      // corresponding code for on('tx')
      // need to also be notified when this tx has been confirmed

    }
    catch (error) {
      console.log('Error sending credit tx to the network')
      console.log(error)
    }
  }

  async reserveSpace(size, ttl, replication) {
    // create a storage contract on the ledger
    try {
      // keypair is created in ledger and added to contract
      let contract = await this.ledger.createContract(size, ttl, replication)
      this.profile.contract = contract
      this.network.gossip('tx', contract.tx)
      return contract

      // corresponding code for on('reservation')
      // need to also be notified when this contract has been confirmed

    }
    catch (error) {
      console.log('Error reserving space on the network')
      console.log(error)
    }
  }

  async joinHosts(pledge) {
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
    catch (error) {

    }
  }

  async leaveHosts() {
    // gracefully leave the network as a valid host
    try {

      // corresponding code for on('leave-request')

    }
    catch (error) {

    }
  }
}
