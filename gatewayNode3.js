const Subspace = require('./dist/subspace')

const init = async () => {
  
  try {
    const subspace = new Subspace.default(false, ['772441c914c75d64a3a7af3b2fd9c367ce6fe5c00450a43efe557c544e479de6:127.0.0.1:8125'], 3)

    subspace.on('ready', () => {
      console.log('ready event has fired in full node')
    })

    subspace.on('connection', (connection) => {
      console.log('Connected to a new node: ', connection)
    })

    subspace.on('join', () => {
      console.log('Joined the Network')
    })

    subspace.on('block', block => {
      // console.log(block)
    })

    await subspace.init('gateway', true, 'gw3')   
    
    console.log('Started new node with id: ', subspace.wallet.profile.user.id)

    await subspace.seedPlot()

    console.log('seeded plot')

    await subspace.join(8128, '127.0.0.1')


    await subspace.startFarmer(5000)
    console.log('started farming')


    // await subspace.leave()
    // console.log('left the network')

    


    

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



