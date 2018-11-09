const Subspace = require('./dist/subspace')

const init = async () => {
  
  try {
    const subspace = new Subspace.default(false, ['localhost:8125'], 1)

    subspace.on('ready', () => {
      console.log('ready event has fired in full node')
    })

    subspace.on('connection', (connection) => {
      console.log('Connected to a new node:')
      console.log(connection)
    })

    subspace.on('join', () => {
      console.log('Joined the Network')
    })

    await subspace.init('gateway', true, 'gw1')   
    
    await subspace.deleteProfile()

    console.log('deleted profile')

    await subspace.createProfile()

    console.log('recreated profile')

    await subspace.seedPlot()

    console.log('seeded plot')

    await subspace.join(8126, 'localhost')

    // bootstrap gateway with no gateway nodes, listen on localhost

    // bootstrap second node with gateway ip/port passed in 

    // bootstrap -> fetch the ledger

    // bootstrap -> fetch the tracker

    // send ledger tx

    // join/leave the tracker 

    // should their be a simple UI/dashboard?
      // ledger
      // tracker
      // records

    // how would you connect from a client? 
    // maybe easier to just do this as a light client that holds the ledger 

    // subspace.on('block', block => {
    //   console.log(block)
    //   // console.log(subspace.tracker.lht)
    // })

    // await subspace.network.join()
    // console.log('joined')

    // await subspace.startFarmer(100)
    // console.log('started farming')

    // join hosts 

    // await subspace.joinHosts()
    // console.log('joined hosts')
   
    // setTimeout(async () => {

    //   // leave hosts 

    //   await subspace.leaveHosts()
    //   console.log('left host')

    //   await subspace.stopFarmer()
    //   console.log('stopped farming')

    //   await subspace.network.leave()
    //   console.log('left')
    // }, 60000)  

  }
  catch (error) {
    throw(error)
  }
}

init()



