const Subspace = require('./dist/subspace')
const colors = require('colors')

const IP_ADDRESS = '127.0.0.1'
const BASE_TCP_PORT = 8125
const BASE_WS_PORT = 8225
const BLOCK_INTERVAL = 10000

const startGenesisNode = async () => {

  const genesisNode = new Subspace.default(true, [])
  await genesisNode.init('gateway', true)
  console.group('Genesis Startup'.green)
  console.log(`Started new node with id: ${genesisNode.wallet.getProfile().id}`.green)

  await genesisNode.seedPlot(100000000000)
  console.log('Genesis node seeded plot'.green)

  await genesisNode.join(BASE_TCP_PORT, IP_ADDRESS, BASE_WS_PORT)
  console.log('Bootstrapped the network'.green)

  await genesisNode.startFarmer(BLOCK_INTERVAL)
  console.log('Bootstrapped the ledger and started farming'.green)

  await genesisNode.joinHosts()
  console.log('Bootstrapped the tracker and joined hosts'.green)
  console.groupEnd()

  genesisNode.on('join', () => {
    console.log('Genesis node joined the Network'.green)
  })

  genesisNode.on('applied-block', block => {

    console.log(`Genesis node applied block: ${block.key}`.green)
    console.log(genesisNode.ledger.clearedBalances.green)
  })

  return genesisNode
}

const startGatewayNode = async (genesisAddress, myTcpPort, myWsPort) => {

  
  const gatewayNode = new Subspace.default(false,  [genesisAddress], 1)
  await gatewayNode.init('gateway', true, myTcpPort.toString())
  console.log('\n')
  console.group(`Gateway node`.yellow)
  console.log(`Started new gateway node with id: ${gatewayNode.wallet.getProfile().id}`.green)

  await gatewayNode.seedPlot(100000000000)
  console.log('Gateway node has seeded plot'.yellow)

  await gatewayNode.join(myTcpPort, IP_ADDRESS, myWsPort)
  console.log('Gateway node has joined the network'.yellow)

  await gatewayNode.startFarmer(BLOCK_INTERVAL)
  console.log('Gateway node has synced the ledger and started farming'.yellow)

  await gatewayNode.pledgeSpace()
  console.log('Gateway node pledged space'.green)

  await gatewayNode.joinHosts()
  console.log('Gateway node has joined the host network'.yellow)

  console.groupEnd()

  gatewayNode.on('join', () => {
    console.log('Gateway node joined the Network'.green)
  })

  return gatewayNode.wallet.getProfile().id
}

const startGatewayNodes = async (genesisAddress, nodeCount) => {
  const nodes = new Set()
  let tcpPort = BASE_TCP_PORT 
  let wsPort = BASE_WS_PORT
  for(i=0; i<nodeCount; i++) {
    const gatewayNodeId = await startGatewayNode(genesisAddress, tcpPort += 1, wsPort += 1)
    nodes.add(gatewayNodeId)
  }
  return nodes
}



const testNetwork = async (nodeCount) => {

  try {
    // bootstrap the network with a genesis node
    const genesisNode = await startGenesisNode()
    const genesisNodeId = genesisNode.wallet.getProfile().id


    // create x gateway nodes/hosts/farmers
    const genesisAddress = `${genesisNodeId}:${IP_ADDRESS}:${BASE_TCP_PORT}:${BASE_WS_PORT}`
    const nodes = await startGatewayNodes(genesisAddress, nodeCount)
    
    console.log(`All gateway nodes have started: ${nodes}`.white)
    
    // have the genesis node create a storage contract and put/get
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
  } catch (e) {
    throw e
  }
}

testNetwork(3)