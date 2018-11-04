const Subspace = require('./dist/subspace')

const init = async () => {
  
  try {
    const subspace = new Subspace.default(true)

    subspace.on('ready', () => {
      console.log('ready event has fired in full node')
    })

    await subspace.init('gateway')   
    
    await subspace.deleteProfile()

    console.log('deleted profile')

    await subspace.createProfile()

    console.log('recreated profile')

    await subspace.seedPlot()

    console.log('seeded plot')

    subspace.on('block', block => {
      console.log(block)
      // console.log(subspace.tracker.lht)
    })

    await subspace.network.join()
    console.log('joined')

    await subspace.startFarmer(10000)
    console.log('started farming')

    // join hosts 

    await subspace.joinHosts()
    console.log('joined hosts')
   
    setTimeout(async () => {

      // leave hosts 

      await subspace.leaveHosts()
      console.log('left host')

      await subspace.stopFarmer()
      console.log('stopped farming')

      await subspace.network.leave()
      console.log('left')
    }, 60000)

    
    





  }
  catch (error) {
    // console.log(subspace)
    throw(error)
  }
}

init()



