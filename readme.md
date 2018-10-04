# Subspace Core Library

## Overview

Subspace is ...

TOC Links

## Full Node Example

```javascript

const Subspace = require('@subspace/subspace')

let options = {
  bootstrap: false, // optional 
  gateway_nodes: [], // optional, overirde the default gateways
  gateway_count: 1, // optional, default is 1
  storage_adapter: 'node', // default is node (rocks db)
  profile: null, // if not provided, a new profile will be created
  delegated: true // will delegate put/get of replicas to a first host
}

const subspace = new Subspace(options)

const startOptions = {
  name: 'Jeremiah Wagstaff',
  email: 'jeremiah@subspace.network',
  passphrase: 'somePassphrase',
  pledge: 10, // space pledge in GB
  interval: 30, // payment interval in days
}

const start = async () => {
  try {

    const profileOptions = { 
      name: startOptions.name, 
      email: startOptions.email, 
      passphrase: startOptions.passphrase
    }

    // creates a new profile in the wallet and saves to disk
    await subspace.createProfile(profileOptions)

    // creates a new proof of space based on pledge size
    await subspace.createPledge(startOptions.pledge)

    // joins the network as a peer
    await subspace.join()

    // starts farming the ledger (using proof of space)
    await subspace.farm()

    // pledges proof of space for hosting records
    await subspace.pledgeSpace(startOptions.interval)

    // joins host network by connecting to neighbors
    await subspace.joinHosts()

    // do useful work and earn subspace credits!

    // ...........

    // create a database contract
    await node.reserveSpace(options)

    // send credits 
    await node.send(to_address, amount)

    // put and get a new record to the network
    const record = await subspace.put('hello subspace')
    console.log('put a new record to remote host')
    const value = await subspace.get(record.key)
    assert(record.value === value)
    console.log('got same record back from remote host ')

    // leave the host network
    await node.leaveHosts()

    // leave the subspace network
    await node.leave()
  }
  catch (error) {
    console.log('Error starting up full node')
    console.log(error)
    return(error)
  }
}

```

## Light Client Examples

### Setup

```javascript

const Subspace = require('subspace')


let options = {
  bootstrap: false, // optional 
  gateway_nodes: [], // optional, overirde the default gateways
  gateway_count: 1, // optional, default is 1
  storage_adapter: 'browser', // default is node (rocks db)
  profile: null, // if not provided, a new profile will be created
  delegated: true // will delegate put/get of replicas to a first host
}

const subspace = new Subspace(options)

```

### Using Callbacks

```javascript

subspace.connect(error => {
  if (error) {
    console.log(error)
    return
  }

  console.log('connected to subspace network')
  subspace.put('hello subspace', (error, record) => {
    if (error) {
      console.log(error)
      return
    }

    console.log('put a new record to remote host')
    subspace.get(key, (error, value) => {
      if (error) {
        console.log(error)
        return
      }

      assert(record.value === value)
      console.log('got same record back from remote host ')
      return record
    })
  })
})

```

### Using Promises

```javascript

subspace.connect()
  .then(() => {
    console.log('connected to subspace network')
    subspace.put('hello subspace')
  })
  .then(record => {
    console.log('put a new record to remote host')
    subspace.get(record.key)
  })
  .then(value => {
    assert(record.value === value)
    console.log('got same record back from remote host ')
    return(record)
  })
  .catch(error => {
    console.log('Subspace Error')
    console.log(error)
    return(error)
  })

```

### Using Async/Await

```javascript

const testSubspace = async () => {
  try {
    await subspace.connect()
    console.log('connected to subspace network')

    const record = await subspace.put('hello subspace')
    console.log('put a new record to remote host')

    const value = await subspace.get(record.key)
    assert(record.value === value)
    console.log('got same record back from remote host ')

    return record
  }
  catch (error) {
    console.log('Subspace Error')
    console.log(error)
    return(error)
  }
}

```
## API

### subspace.createProfile( name: string, email: string, passphrase: string) : error
Creates a new profile and ECDSA key pair that is persisted to disk locally

* `name` - Name associated with this profile
* `email` - Email associated with this profile
* `passphrase` - Passphrase associated with this profile

Returns an error if failed.

### subspace.loadProfile(name: string) : error
Loads an existing profile from disk

* `name` - Name associated with this profile

Returns an error if failed.

### subspace.deleteProfile(name: string) : error
Deletes an existing profile from disk

* `name` - Name associated with this profile

Returns an error if failed.

### subspace.join() : error
Joins the subspace network

Returns an error if failed

### subspace.leave()
Leaves the subspace network, disconnecting from all peers gracefully

Returns an error if failed

### subspace.connect(node_id: string) : error
Connects to another node on the network by id.

* `node_id` - 32 byte node as a hex string (currently)

Returns an error if failed

### subspace.disconnect(node_id: string) : error
Disconnects from an existing peer node on the network by id.

* `node_id` - 32 byte node as a hex string (currently)

Returns an error if failed

### subspace.send(node_id: string, message: object) : error
Sends a message to another peer on the network by id, an existing connection to that peer is not required.

* `node_id` - 32 byte node as a hex string (currently)
* `message` - a standard rpc message object as json

Returns an error if failed

### subspace.createPledge(amount: integer) : error
Seeds a plot by creating a new proof of space for hosting and farming. 

* `amount` - space to be pledged in GB, minimum is 10

Returns an error if failed

### subspace.farm() : error
Starts farming the ledger. Will also start to download the ledger locally. Will start after last block is pulled.

Returns an error if failed

### subspace.stopFarming() : error
Stops farming the ledger. 

Returns an error if failed.

### subspace.pledgeSpace(interval: integer) : error
Submits a pledge as a ledger tx to farmers. Resolves once the tx has been published in a valid block.

* `interval` - payment interval in days, default is 30

Returns an error if failed

### subspace.joinHosts() : error
Joins the host network by connecting to all valid neighbors. Requires a valid pledge to the ledger.

Returns an error if failed.

### subspace.leaveHosts(): error
Leaves the host network by gracefully disconnecting from all valid neighbors.

Returns an error if failed.

### subspace.createContract(options: object) : error
Creates a new data contract tx and submits to farmers for inclusion in the ledger. Requires sufficient subspace credits. Resolves once the tx has been published in a valid block.

* `options` - tbd

Returns an error if failed.

### subspace.put(value: boolean | string | number | array | object | Buffer) : error | record: recordObject
Writes some data to the subspace network. Resolves once all replicas have been created. Requires a valid data contract for this profile.

* `value` - the data to be stored, in most evert format possible

Returns the plain text record in encoded format with derived key. Returns an error if failed.

### subspace.get(key: string) : error | value: valueObject
Retrieves some data from the subspace network. Resolves once the first valid record is returned. Does not require a valid data contract for this profile

* `key` - 32 byte record key as a hex string (currently)

Returns the plain text record value in encoded format. Returns an error if failed.

### subspace.sendCredits(address: string, amount: number) error | tx: txObject
Sends subspace credits from your address to a recipient's address. Creates a tx and submits to farmers for includsion in the ledger.

* `address` - 32 byte address of recipient as a hex string (currently)
* `amount` - number of subspace credits to be sent from your account

Returns a pending tx object. Returns an error if failed.

### subspace.getCreditBalance([address: string]) error | amount: number
Retrieve your credit balance (default) or another address balance.

* `address` - optional 32 byte address to query as a hex string (currently)

Returns balance of subspace credits. Returns an error if failed.

## Events

### subspace.on('connected')
Emitted when this node is fully connected to the network.

### subspace.on('connection', connection: connectionObject)
Emitted when this node connects to a new peer.

### subspace.on('disconnection', connection: connectionObject)
Emitted when this node disconnects from an existing peer.

### subspace.on('message', message: messageObject)
Emitted when this node receives a new message from another peer.

### subspace.on('put', request: requestObject)
Emitted when this node receives a new put request.

### subspace.on('get', request: requestObject)
Emitted when this node receives a new get request.

### subspace.on('tx', tx: txObject)
Emitted when this nodes receives a new ledger tx (via gossip)

### subspace.on('block', block: blockObject)
Emitted when this node receives a new ledger block (via gossip)

### subspace.on('error', error)
Emitted when any process on the node encounters an error.

## Old Events (need to refactor)

### Peer
```javascript
  node.on('peer', (peer) => {
    console.log('A new peer has initiated a direct connection')
  })
```

### Peer-Leave
```javascript
node.on('peer-leave', (peer) => {
  console.log('An existing peer has closed a direct connection')
})
```

### Neighbor
```javascript
  node.on('neighbor', (host) => {
    console.log('You have connected to a new host as a direct neighbor')
  })
```

### Neighbor-Leave
```javascript
  node.on('neighbor-leave', (neighbor) => {
    console.log('An existing neighbor has left the network')
  })
```

### Neighbor-Failed
```javascript
  node.on('neighbor-failed', (neighbor) => {
    console.log('An existing neighbor has failed, starting PARSEC consensus')
  })
```

### Join
```javascript
  node.on('join', (host) => {
    console.log('A new host has joined the subspace network')
  })
```

### Leave
```javascript
  node.on('leave', (host) => {
    console.log('An existing host has left the subspace network')
  })
```

### Fail
```javascript
  node.on('fail', (host) => {
    console.log('An existing host has failed and been dropped from the subspace network')
  })
```

### Pledge
```javascript
  node.on('pledge', (proof) => {
    console.log('A new host has seeded a valid plot and pledged to the subspace network')
  })
```

### Contract
```javascript
  node.on('contract', (contract) => {
    console.log('A new database has been created with a valid storage contract')
  })
```

### Reward
```javascript
  node.on('reward', (reward) => {
    console.log('You have farmed the next block in the ledger')
  })
```

