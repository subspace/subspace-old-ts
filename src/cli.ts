import Subspace from "./subspace"
import * as program from "commander"
import * as fs from "fs"
import {ApiServer} from "./ApiServer"
import jayson = require("jayson/promise");

interface SubspaceGatewayCommand extends program.Command {
  bootstrap?: boolean
  gatewayCount: number
  ip: string
  tcpPort: number
  wsPort?: number
  storagePrefix?: string
  rpc?: boolean
  rpcPort: number
  rpcIp: string
}

interface SubspaceClientCommand extends program.Command {
  url: string
}

interface JRPCSuccess<T> {
  jsonrpc: '2.0'
  id: string
  result: T
}

interface JRPCError {
  jsonrpc: '2.0'
  id: string
  error: {
    code: number
    message: string
  }
}

type JRPCResult<T> = JRPCSuccess<T> | JRPCError

const version = JSON.parse(fs.readFileSync(__dirname + '/../package.json', 'utf8')).version
const title = `Subspace CLI version ${version}`
const defaultHttpApiIp = '127.0.0.1'
const defaultHttpApiPort = 8229

program
  .command('gateway [gatewayNodes...]')
  .description('Run gateway node for Subspace protocol')
  .option('-b, --bootstrap', 'Bootstrap network (run Genesis node)', false)
  .option('-g, --gateway-count <count>', 'TODO', Number, 1)
  .option('-i, --ip <ip>', 'IP on which to listen ("0.0.0.0" for all)', String, '127.0.0.1')
  .option('-t, --tcp-port <port>', 'Port on which to listen for TCP connections', Number, 8225)
  .option('-w, --ws-port <port>', 'Port on which to listen for WebSocket connections', Number)
  .option('-s, --storage-prefix <port>', 'Storage prefix in case of multiple instances running on the same host', String)
  .option('--rpc', 'Run JSON-RPC server')
  .option('--rpc-ip <ip>', 'IP address on which to listen for JSON-RPC requests ("0.0.0.0" for all)', String, defaultHttpApiIp)
  .option('--rpc-port <port>', 'Port number on which to listen for JSON-RPC requests', Number, defaultHttpApiPort)
  .action(async (gatewayNodes: string[], cmd: SubspaceGatewayCommand) => {
    console.log(title)

    const subspace = new Subspace(Boolean(cmd.bootstrap), gatewayNodes, 1)

    // subspace.on('ready', () => {
    //   console.log('ready event has fired in full node')
    // })

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

    await subspace.init('gateway', true, cmd.storagePrefix)
    console.log('Started new node with id: ', subspace.wallet.profile.user.id)

    await subspace.seedPlot()
    console.log('seeded plot')

    await subspace.join(cmd.tcpPort, cmd.ip, cmd.wsPort)
    if (cmd.bootstrap) {
      console.log('Bootstrapped the network')
    } else {
      console.log('Initiated joining the network')
    }

    await subspace.startFarmer(10000)
    console.log('Started farming')

    if (cmd.bootstrap) {
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

      setTimeout(async () => {
        await subspace.joinHosts()
        console.log('Bootstrapped the tracker and joined hosts')
      }, 6000)
    } else {
      setTimeout(async () => {

        await subspace.pledgeSpace()
        console.log('pledged space')

        setTimeout(async () => {
          await subspace.joinHosts()
          console.log('Joined Hosts!')

          // setTimeout( async() => {
          //   await subspace.leaveHosts()
          //   console.log('Left Hosts')

          //   await subspace.stopFarmer()
          //   console.log('stopped farming')
          // }, 30000)

        }, 10000)

      }, 7000)


      // await subspace.leave()
      // console.log('left the network')

      // join hosts

      // await subspace.joinHosts()
      // console.log('joined hosts')
    }

    // setTimeout(async () => {

    //   // leave hosts

    //   await subspace.leaveHosts()
    //   console.log('left host')

    //   await subspace.stopFarmer()
    //   console.log('stopped farming')

    //   await subspace.network.leave()
    //   console.log('left')
    // }, 60000)

    if (cmd.rpc) {
      console.log('Running JSON-RPC server')

      const rpcServer = new ApiServer(subspace)
      await rpcServer.listen(cmd.rpcIp, cmd.rpcPort)

      console.log('JSON-RPC server is ready to accept requests')
    }
  })

program.command('client <action=get|put> [arguments...]')
  .description('Run command-line client for JSON-RPC')
  .on('--help', () => {
    console.log(`
Usage examples:
  client get <key>
  client get --url http://127.0.0.1:1234 <key>
  client put <value>
`)
  })
  .option('-u, --url <url>', 'URL of JSON-RPC server', String, `http://${defaultHttpApiIp}:${defaultHttpApiPort}`)
  .action(async (action: string, ...args) => {
    const cmd: SubspaceClientCommand = args[args.length - 1]
    // @ts-ignore .http() and .https() accept strings as argument, but library's type information is not complete yet
    const client = cmd.url.startsWith('https://') ? jayson.Client.https(cmd.url) : jayson.Client.http(cmd.url)
    switch (action) {
      case 'get':
        const key = args[0];
        try {
          const result: JRPCResult<any> = await client.request('records/get', [key])
          if ('error' in result) {
            console.error(result.error.message)
            console.error(`Error code ${result.error.code}`)
            process.exit(result.error.code % 255)
          } else {
            process.stdout.write(JSON.stringify(result.result))
          }
        } catch (e) {
          console.error(e && e.message && e.stack)
          process.exit(2)
        }
        break;
      case 'put':
        const value = args[0];
        try {
          const result: JRPCResult<string> = await client.request('records/put', [value])
          if ('error' in result) {
            console.error(result.error.message)
            console.error(`Error code ${result.error.code}`)
            process.exit(result.error.code % 255)
          } else {
            process.stdout.write(JSON.stringify(result.result))
          }
        } catch (e) {
          console.error(e && e.message && e.stack)
          process.exit(2)
        }
        break
      default:
        console.error(`Unsupported action ${action}`)
        process.exit(1)
    }
  })

program
  .version(version, '-v, --version')
  .parse(process.argv)
