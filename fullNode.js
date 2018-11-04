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
    })

    await subspace.startFarmer(10000)

    setTimeout(() => {
      subspace.stopFarmer()
      console.log('Stopped farmer')
    }, 60000)

  }
  catch (error) {
    // console.log(subspace)
    throw(error)
  }
}

init()



