const EventEmitter = require('events')
const crypto = require('subspace-crypto').default
const profile = require('subspace-profile').default
const Storage = require('subspace-storage').default
// const transport = require('subspace-transport').default
// const rpc = require('subspace-rpc').default
// const tracker = require('subspace-tracker').default
// const ledger = require('subspace-ledger').default
// const db = require('subspace-db').default
// const gateway = require('subspace-gateway-server').default
// const jch = require('subspace-jump-consistent-hashing').default
// const hrw = require('subspace-rendezvous-hash').default

class Subspace extends EventEmitter {

  // class constructor
  constructor(storage, profile) {
    super()
    this.storage = new Storage(adapter = 'rocks')
    this.profile = profile 
    this.transport = null
    this.tracker = null 
    this.ledger =  null 
    this.rpc = null 

    // listen for sub-module events and emit corresponding module level events
    
    this.rpc.on('put', (record) => {
      // emitted when this node receives a put request
      this.emit('put', record)
    })
    
    this.rpc.on('get', (record) => {
      // emitted when this node receives a get request
      this.emit('get', record)
    })
    
    this.tracker.on('join', (node) => {
      // emitted when this node detects a new host has joined the network
      this.emit('join', node)
    })
    
    this.tracker.on('leave', (node) => {
      // emitted when this node detects an existing host has left the network
      this.emit('leave', node)
    })
    
    this.tracker.on('failure', (node) => {
      // emitted when this node detects that an exisiting node has failed
      this.emit('failure', node)
    })
    
    this.transport.on('neighbor', (node) => {
      // emitted when this node connects to a new neighboring host
      this.emit('neighbor', node)
    })
    
    this.ledger.on('block', (block) => {
      // emitted when a new block is received 
      this.emit('block', block)
    })
    
    this.ledger.on('tx', (tx) => {
      // emitted when tx is received into the memory pool
      this.emit('tx', tx)
    })
  }

  // class methods
  async create(options) {
    // create a new subspace identity 
    try {
      await this.profile.create(options)
      await this.profile.save(this.storage)
      return
    }
    catch (error) {
      console.log('Error creating new subspace identity')
      console.log(error)
    }
  }

  async connect() {
    // connect to the subspace network as a node
    try {
      await this.transport.connect()
      this.emit('connected')
      return
    }
    catch (error) {
      console.log('Error connecting to the subspace network')
      console.log(error)
    }
  }

  async disconnect() {
    // disconnect from the subspace network gracefully as a node
    try {
      await this.transport.disconnect()
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

    }
    catch {

    }
  }

  async get(key) {
    // get a record from the network given a valid key
    try {

    }
    catch {

    }
  }

  async send() {
    // send subspace credits to another address
    try {

    }
    catch {

    }
  }

  async reserve() {
    // create a storage contract on the ledger
    try {

    }
    catch {

    }
  }

  async seed() {
    // seed a plot on disk by generating a proof of space
    try {

    }
    catch {

    }
  }

  async pledge() {
    // pledge a proof of space to the ledger as a host
    try {

    }
    catch {

    }
  }

  async join() {
    // join the network as a valid host
    try {

    }
    catch {

    }
  }

  async leave() {
    // gracefully leave the network as a valid host
    try {

    }
    catch {

    }
  }
}

module.exports = Subspace

