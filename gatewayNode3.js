const Subspace = require('./dist/subspace')

const init = async () => {
  
  try {
    const subspace = new Subspace.default(false, ['772441c914c75d64a3a7af3b2fd9c367ce6fe5c00450a43efe557c544e479de6:127.0.0.1:8125'], 1)

    subspace.on('connection', (connection) => {
      console.log('\nConnected to a new node: ', connection)
    })

    subspace.on('disconnection', (nodeId) => {
      console.log('Lost connection to node', nodeId)
    })

    subspace.on('join', () => {
      console.log('Joined the Network')
    })
    
    subspace.on('applied-block', block => {
      console.log('Applied block: ', block.key)
      // console.log(subspace.ledger.clearedBalances)
    })

    await subspace.init('gateway', true, 'gw3')   
    console.log('Started new node with id: ', subspace.wallet.profile.user.id)

    await subspace.seedPlot()
    console.log('seeded plot')

    await subspace.join(8128, '127.0.0.1')
    console.log('joined the network')

    await subspace.startFarmer(10000)
    console.log('started farming')

    setTimeout( async () => {

      await subspace.pledgeSpace()
      console.log('pledged space')

      setTimeout( async () => {
        await subspace.joinHosts()
        console.log('Joined Hosts!')

        setTimeout( async() => {
          await subspace.leaveHosts()
          console.log('Left Hosts')

          await subspace.stopFarmer()
          console.log('stopped farming')
        }, 30000)

      }, 10000)

    }, 7000)


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



