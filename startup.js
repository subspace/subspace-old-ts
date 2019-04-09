const Subspace = require('./dist/subspace')
const colors = require('colors')

const IP_ADDRESS = '127.0.0.1'
const BASE_TCP_PORT = 8125
const BASE_WS_PORT = 8225
const BLOCK_INTERVAL = 10000

const startGenesisNode = async (blockTime) => {
  console.log('\nBootstrapping the Subspace Network ...'.blue)
  console.log('---------------------------------------\n'.blue)

  const genesisNode = new Subspace.default(true, [])
  console.group('Starting A Genesis Node'.green)

  genesisNode.on('block', block => {
    console.log(`Genesis node received new block solution via gossip: ${block.key} `.green)
  })

  genesisNode.on('block-solution', block => {
    console.log(`Genesis node created new block solution: ${block.key} `.green)
  })
  let oldTime, newTime = 0
  genesisNode.on('applied-block', block => {
    if (genesisNode.ledger.isFarming) {
      console.log(`${getDate()}: BLOCK TIME EXPIRED`.red)
      newTime = block.value.createdAt
      console.log('Last block time was: ', newTime)
      console.log('Elapsed time is: ', (newTime - oldTime)/1000)
      oldTime = newTime
    }
    console.log(`Genesis node applied block: ${block.key}`.green)
    // console.log(colors.green('Ledger Balances: ', genesisNode.ledger.clearedBalances))
  })

  genesisNode.on('joined-hosts', (neighbors, activeHosts, tracker) => {
    console.log(`${getDate()}: Connected to ${neighbors} closests hosts out of ${activeHosts} active hosts`.green)
    // console.log(colors.green('Tracker:', tracker.values()))
  })

  genesisNode.on('message', (sender, type) => {
    console.log(`${getDate()}: Genesis node recieved a ${type} message from ${sender.substring(0,8)}`.green)
  })

  genesisNode.on('host-added', (hostId) => {
    console.log(`${getDate()}: Genesis node added ${hostId.substring(0,8)} to tracker for valid join`.green)
  })

  await genesisNode.init('gateway', true)
  console.log(`${getDate()}: Started new node with id: ${genesisNode.wallet.getProfile().id}`.green)

  await genesisNode.seedPlot(100000000000)
  console.log(`${getDate()}: Genesis node seeded plot`.green)

  await genesisNode.join(BASE_TCP_PORT, IP_ADDRESS, BASE_WS_PORT)
  console.log(`${getDate()}: Bootstrapped the network`.green)

  await genesisNode.startFarmer(blockTime)
  console.log(`${getDate()}: Bootstrapped the ledger and started farming`.green)

  await genesisNode.joinHosts()
  console.log(`Bootstrapped the tracker and joined hosts`.green)
  
  console.groupEnd()
  return genesisNode
}

const getDate = () => {
  const date = new Date()
  return `${date.getMinutes()}:${date.getSeconds()}:${date.getMilliseconds()}`
}

const startGatewayNode = async (number, genesisAddress, myTcpPort, myWsPort, blockTime) => {
  const gatewayNode = new Subspace.default(false,  [genesisAddress], 1)
  await gatewayNode.init('gateway', true, myTcpPort.toString())
  console.log('\n')
  console.group(`Gateway node ${number}`.yellow)
  const gatewayNodeId = gatewayNode.wallet.getProfile().id
  console.log(`${getDate()}: Started new gateway node with id: ${gatewayNodeId}`.yellow)

  gatewayNode.on('joined', () => {
    console.log(`${getDate()}: GW node ${gatewayNodeId.substring(0,8)} joined the Network`.yellow)
  })

  gatewayNode.on('message', (sender, type) => {
    console.log(`${getDate()}: GW node ${gatewayNodeId.substring(0,8)} recieved a ${type} message from ${sender.substring(0,8)}`.yellow)
  })

  gatewayNode.on('block', block => {
    console.log(`${getDate()}: GW node ${gatewayNodeId.substring(0,8)} received a new block solution via gossip: ${block.key} `.yellow)
  })

  gatewayNode.on('block-solution', block => {
    console.log(`${getDate()}: GW node ${gatewayNodeId.substring(0,8)} created a new block solution: ${block.key} `.yellow)
  })

  gatewayNode.on('applied-block', block => {
    if (gatewayNode.ledger.isFarming) {
      console.log(`${getDate()}: BLOCK TIME EXPIRED`.red)
    }
    console.log(`${getDate()}: GW node ${gatewayNodeId.substring(0,8)} applied block: ${block.key}`.yellow)
    // console.log(colors.yellow('Ledger Balances: ', genesisNode.ledger.clearedBalances))
  })

  gatewayNode.on('joined-hosts', (neighbors, activeHosts, tracker) => {
    console.log(`${getDate()}: GW node ${gatewayNodeId.substring(0,8)} has connected to ${neighbors} closests hosts out of ${activeHosts} active hosts`.yellow)
    console.log(colors.yellow('Tracker:', tracker.values()))
  })

  gatewayNode.on('host-added', (hostId) => {
    console.log(`${getDate()}: GW node ${gatewayNodeId.substring(0,8)} added ${hostId.substring(0,8)} to tracker for valid join`.yellow)
  })

  gatewayNode.on('neighbor-added', (neighborId) => {
    console.log(`${getDate()}: GW node ${gatewayNodeId.substring(0,8)} connected to host-neighbor ${neighborId.substring(0,8)} and received proof signature`.yellow)
  })

  await gatewayNode.seedPlot(100000000000)
  console.log(`${getDate()}: GW ${gatewayNodeId.substring(0,8)} node has seeded plot`.yellow)

  await gatewayNode.join(myTcpPort, IP_ADDRESS, myWsPort)

  await gatewayNode.startFarmer(blockTime)
  console.log(`${getDate()}: GW node ${gatewayNodeId.substring(0,8)} has synced the ledger and started farming`.yellow)

  await gatewayNode.pledgeSpace()
  console.log(`${getDate()}: GW node ${gatewayNodeId.substring(0,8)} pledged space`.yellow)

  await gatewayNode.joinHosts()
  console.log(`${getDate()}: GW node ${gatewayNodeId.substring(0,8)} has joined the host network\n`.yellow)

  console.groupEnd()

  return gatewayNode.wallet.getProfile().id
}

const startGatewayNodes = async (genesisAddress, nodeCount, blockTime) => {
  const nodes = new Set()
  let tcpPort = BASE_TCP_PORT 
  let wsPort = BASE_WS_PORT
  for(i=0; i<nodeCount; i++) {
    const gatewayNodeId = await startGatewayNode(i+1, genesisAddress, tcpPort += 1, wsPort += 1, blockTime)
    nodes.add(gatewayNodeId)
  }
  return nodes
}

const testStorage = async (genesisNode) => {
    // call reserve space
    const {txRecord, contractRecord} = await genesisNode.reserveSpace(1000000000, 3600000, 2)
    console.log('\n')
    console.group('Testing storage contract, and put/get worklow'.red)
    console.log(txRecord)
    console.log('\n')
    console.log(contractRecord)

    genesisNode.on('space-reserved', (recordId, hosts) => {
      console.log('\nReserved Space! \n'.red)
      console.log('Contract id', recordId)
      console.log('Hosts', hosts)
    })
    
    // call put
    const content = 'hello subspace'
    const recordId = await genesisNode.put(content, false)

    // call a get
    const record = await genesisNode.get(recordId)

    // check value 
    if (record.value !== content) {
      throw new Error('get request returned inccorect value')
    } else {
      console.log('Succefully got get request')
      console.groupEnd()
    }
} 

const testNetwork = async (nodeCount, blockTime, mode) => {
  try {
    // bootstrap the network with a genesis node
    const genesisNode = await startGenesisNode(blockTime)
    const genesisNodeId = genesisNode.wallet.getProfile().id

    // create x gateway nodes/hosts/farmers
    console.log(`Starting ${nodeCount} gateway nodes`.blue)
    const genesisAddress = `${genesisNodeId}:${IP_ADDRESS}:${BASE_TCP_PORT}:${BASE_WS_PORT}`
    const nodes = await startGatewayNodes(genesisAddress, nodeCount, blockTime)
    
    console.log(colors.green('All gateway nodes have started: ', nodes))

    // have the genesis node create a storage contract and put/get
    if (mode === 'full') {
      await testStorage(genesisNode)
    }
    
  } catch (e) {
    console.log('---SUBSPACE ERROR: ejecting warp core before antimiatter breach occurs---'.red)
    console.error(e)
  }
}

const nodeCount = process.argv[2] || 3
const blockTime = process.argv[3] || BLOCK_INTERVAL
const mode = process.argv[4] || 'full'
testNetwork(nodeCount, blockTime, mode)


// Genesis
  // GW 1
    // pledge space (tx 1)
    // join hosts
  // GW 2
    // pledge space (tx 2)
    // join hosts
  // GW 3
    // pledge space (tx 3)
    // join hosts
    // didn't see tx 2
      // wasn't online when it was gossiped
      // didn't retrieve it from pending block (maybe there wasn't one)
        // a tx has been gossiped before a node comes online, but there is not a pending block yet 
        // how can we ensure he get's the backlog from the memory pool?
        // as a final safeguard, can I just request it if missing
          // a) once the ledger is synced and after checking for pending blocks, check for pending tx
          // b) if a tx is not known, request it from your peers to see if anybody has it (or look up on the network)