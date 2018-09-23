# Subspace Core Module

Intended to be used within host and client implementations with a variety of storage and transport adapters.

## Example full node usage

```javascript
  const subspace = require('subspace')
  const node = new subspace()

  // create the node identity (one time only)
  await node.createProfile(options)

  // or load an existing identity
  await node.loadProfile(path)

  // join or bootstrap the network as relay 
  await node.connect()

  // seed a plot with a proof of space (one time only)
  let proof = await node.seedPlot(size)

  // pledge the plot to the network as a host (one time only)
  let pledge = await node.pledgeSpace(proof)

  // upgrade network connection as a host
  node.joinHosts(pledge) 


  // earn some subspace credits .......

  // create a database contract
  let contract = await node.reserve(size, ttl, replication)

  // send credits 
  await node.send(to_address, amount)

  // put a new record to the network

  let value = 'hello subspace'
  let record = await node.put(value)

  // get an existing record from the network
  let record = await node.get(record.key)

  // leave the host network
  await node.leave()

  // leave the subspace network
  await node.disconnect()
  
```

## API

## Events

### Connected
```javascript
  node.on('connected', () => {
    console.log('Connected to the subspace network as a relay node')
  })
```

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

### Tx
```javascript
  node.on('tx', (tx) => {
    console.log('A new tx has been published to the memory pool')
  })
```

### Block
```javascript
  node.on('block', (block) => {
    console.log('A new block has been published for validation')
  })
```

### Reward
```javascript
  node.on('reward', (reward) => {
    console.log('You have farmed the next block in the ledger')
  })
```

## Adapters

### Storage

* RocksDB (node-js full-node, Electron, BitBot)
* Async Storage (react native)
* Local Forage (browser)

### Transport

* UDP
* TCP
* HTTP
* WebSockets
* WebRTC