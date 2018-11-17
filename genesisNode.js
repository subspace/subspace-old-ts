const Subspace = require('./dist/subspace')

const init = async () => {
  
  try {

    // set my ip address in the constructor
    // figure out what the default port is for tcp to start


    const subspace = new Subspace.default(true, [], 3)

    subspace.on('ready', () => {
      console.log('ready event has fired in full node')
    })

    subspace.on('connection', (connection) => {
      console.log('Connected to a new node:', connection)
    })

    subspace.on('join', () => {
      console.log('Joined the Network')
    })

    subspace.on('block', block => {
      // console.log(block)
    })

    await subspace.init('gateway', true)   
    
    console.log('Started new node with id: ', subspace.wallet.profile.user.id)

    await subspace.seedPlot()
    console.log('seeded plot')

    await subspace.join(8125, '127.0.0.1')

    await subspace.startFarmer(5000)
    console.log('started farming')

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



