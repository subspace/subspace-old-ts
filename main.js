const EventEmitter = require('events')
const crypto = require('@subspace/crypto')
const profile = require('@subspace/profile')
const Storage = require('@subspace/storage')
const Network = require('@subspace/network')
const Tracker = require('@subspace/tracker')
const Ledger = require('@subspace/ledger')
const Database = require('@subspace/db')


class Subspace extends EventEmitter {

  constructor({
    bootstrap = false, 
    gateway_nodes = [],
    gateway_count = 1, 
    delegated = false, 
    storage_adapter = 'rocks', 
    profile = null
  }) {
    super()

    this.bootstrap = bootstrap,
    this.gateway_nodes = gateway_nodes
    this.gateway_count = gateway_count
    this.delegated = delegated
    this.storage = Storage.open(storage_adapter)
    this.profile = profile
    this.tracker = new Tracker(this.storage)
    
    this.db = null
    this.ledger =  null 
    this.env = null

    this.getEnv().then(() => {
      this.network = new Network(
        bootstrap = this.bootstrap, 
        gateway_nodes = this.gateway_nodes, 
        gateway_count = this.gateway_count, 
        delegated = this.delegated, 
        profile = this.profile,
        tracker = this.tracker,
        env = this.env
      )
    })



    // listen for sub-module events and emit corresponding module level events
    
    this.network.on('connection', info => {
      // fired when a new connection is opened over any TCP, WS, or WRTC socket
      // may be a neighbor, client wishing to get/put data, or gateway sync 
      if (info.type === 'peer') {
        this.emit('peer', info)
      } else if (info.type === 'neighbor') {
        this.emit('neighbor', info)
      }
    })

    this.network.on('disconnect', info => {
      // fired when an existing connection is lost 
      if (info.type === 'peer') {
        this.emit('peer-leave', info)
        // may need to connect to another peer (if was gateway?)

      } else if (info.type === 'neighbor') {
        if (info.reason === 'leave') {
          this.emit('neighbor-leave', info)
          // gossip leave
          this.network.gossip()
          // recalculate neighbors

        } else if (info.reason === 'failure') {
          this.emit('neighbor-failed', info)
          // start parsec

        }
      }
    })



    this.network.on('message', msg => {
      // switch cases
      switch(msg.code) {
        case 0:
          name = 'put'
          break
        case 1: 
          name ='get'
          break
        case 2:
          name = ''
      }
    })

    this.network.on('gossip', msg => {
      // switch cases
      switch(msg.code) {
        case 0:
          name = 'tracker'
          break
        case 1:
          name = 'block'
          break
        case 2: 
          name = 'tx'
      }
    })

    this.network.on('tracker-update', updates => {
      // emmited when a tracker-update is received via gossip
      // may contain one or more pending join, full join, leave, or failure
      // validate each and update the tracker
      this.tracker.validate(updates)
      for (let message in updates) {

      }
      // emit the appropriate event 
      // regossip to neighbors as needed
      this.network.gossip(updates)
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
    // these are for proosed txs, what about valid txs for blocks?
  }

  // class methods
  async createProfile(options) {
    // create a new subspace identity 
    try {
      this.profie = await profile.create(options)
      await this.profile.save(this.storage)
      return
    }
    catch (error) {
      console.log('Error creating new subspace identity')
      console.log(error)
    }
  }

  async loadProfile() {
    // opens an existing profile from disk
    try {
      await this.profile.load(this.storage)
      return
    } 
    catch (error) {
      console.log('Error loading profile from disk')
      console.log(error)
    }
  }

  async clearProfile() {
    // deletes the existing profile on disk
    try {
      await this.profile.clear(this.storage)
    }
    catch (error) {
      console.log('Error clearing profile')
      console.log(error)
    }
  }

  async getEnv() {
    if (typeof window !== 'undefined') {
      console.log('Browser env detected')
      return this.env = 'browser' 
    } 
  
    if (await this.network.checkPublicIP()) {
      console.log('Gateway env detected')
      return this.env = 'gateway'
    }

    // else 'node' | 'bitbot' | 'desktop' | 'mobile'
    console.log('Private host env detected')
    return this.env = 'private-host'
  }

  async join() {  
    try {

      await this.network.join()

      if (this.bootstrap) {
        // Create the tracker
        // Create the ledger 
      }
    
      this.emit('connected')
      return
    }
    catch (error) {
      console.log('Error connecting to the subspace network')
      console.log(error)
    }
  }

  async leave() {
    // disconnect from the subspace network gracefully as a node
    try {
      await this.network.leave()
      this.emit('disconnected')
      return
    }
    catch (error) {
      console.log('Error disconnecting from the subspance network')
      console.log(error)
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
      // binary 

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

  async seedPlot(key, space) {
    // seed a plot on disk by generating a proof of space
    // don't await this call, it could take a while!
    try {
      const proof = await this.ledger.createProof(key, space)
      this.profile.proof = proof
      return proof
    }
    catch (error) {
      console.log('Error seeding plot')
      console.log(error)
    }
  }

  async pledgeSpace() {
    // pledge a proof of space to the ledger as a host
    try {
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

module.exports = Subspace

