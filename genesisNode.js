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
      console.log('\nConnected to a new node:', connection)
    })

    subspace.on('join', () => {
      console.log('Joined the Network')
    })

    subspace.on('applied-block', block => {
      console.log('Applied block: ', block.key)
      // console.log(subspace.ledger.clearedBalances)
    })

    await subspace.init('gateway', true)   
    
    console.log('Started new node with id: ', subspace.wallet.profile.user.id)

    await subspace.seedPlot()
    console.log('seeded plot')

    await subspace.join(8125, '127.0.0.1')

    await subspace.startFarmer(10000)
    console.log('started farming')

    // start interval

    // create block and gossip

    // create tx and gossip 

    // apply block 

    // setTimeout(() => {
    //   console.log('sending test credits')
    //   subspace.sendCredits(10, 'e527dc91388f3dfee3aeb2c13808b3adfae9d2bb57b8f25b3c7333fb5d8b6e7f')
    // }, 15000)

    // send credits test

    // after timeout, send credits to another host
    // then show balances 

    // join hosts 

    setTimeout( async () => {
      await subspace.joinHosts(0)
      console.log('joined hosts')
      console.log('\n Joined ! \n')
    }, 7000)

    
   
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



