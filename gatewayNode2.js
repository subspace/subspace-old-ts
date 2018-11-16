const Subspace = require('./dist/subspace')

const init = async () => {
  
  try {
    const subspace = new Subspace.default(false, ['127.0.0.1:8125'], 3)

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

    subspace.on('block', block => {
      // console.log(block)
    })

    await subspace.init('gateway', true, 'gw2')   
    
    await subspace.deleteProfile()

    console.log('deleted profile')

    await subspace.createProfile()

    console.log('recreated profile')

    await subspace.seedPlot()

    console.log('seeded plot')

    await subspace.join(8127, '127.0.0.1')


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



