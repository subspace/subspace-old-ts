(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./subspace", "commander", "fs"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const subspace_1 = require("./subspace");
    const program = require("commander");
    const fs = require("fs");
    const version = JSON.parse(fs.readFileSync(__dirname + '/../package.json', 'utf8')).version;
    const title = `Subspace CLI version ${version}`;
    program
        .command('gateway [gatewayNodes...]')
        .option('-b, --bootstrap', 'Bootstrap network (run Genesis node)', false)
        .option('-g, --gateway-count <count>', 'TODO', Number, 1)
        .option('-i, --ip <ip>', 'IP on which to listen ("0.0.0.0" for all)', '127.0.0.1')
        .option('-t, --tcp-port <port>', 'Port on which to listen for TCP connections', Number, 8225)
        .option('-w, --ws-port <port>', 'Port on which to listen for WebSocket connections', Number)
        .option('-s, --storage-prefix <port>', 'Storage prefix in case of multiple instances running on the same host', String)
        .action(async (gatewayNodes, cmd) => {
        console.log(title);
        const subspace = new subspace_1.default(Boolean(cmd.bootstrap), gatewayNodes, 1);
        // subspace.on('ready', () => {
        //   console.log('ready event has fired in full node')
        // })
        subspace.on('connection', (connection) => {
            console.log('\nConnected to a new node: ', connection);
        });
        subspace.on('disconnection', (nodeId) => {
            console.log('Lost connection to node', nodeId);
        });
        subspace.on('join', () => {
            console.log('Joined the Network');
        });
        subspace.on('applied-block', block => {
            console.log('Applied block: ', block.key);
            // console.log(subspace.ledger.clearedBalances)
        });
        await subspace.init('gateway', true, cmd.storagePrefix);
        console.log('Started new node with id: ', subspace.wallet.profile.user.id);
        await subspace.seedPlot();
        console.log('seeded plot');
        await subspace.join(cmd.tcpPort, cmd.ip, cmd.wsPort);
        if (cmd.bootstrap) {
            console.log('Bootstrapped the network');
        }
        else {
            console.log('Initiated joining the network');
        }
        await subspace.startFarmer(10000);
        console.log('Started farming');
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
                await subspace.joinHosts();
                console.log('Bootstrapped the tracker and joined hosts');
            }, 6000);
        }
        else {
            setTimeout(async () => {
                await subspace.pledgeSpace();
                console.log('pledged space');
                setTimeout(async () => {
                    await subspace.joinHosts();
                    console.log('Joined Hosts!');
                    // setTimeout( async() => {
                    //   await subspace.leaveHosts()
                    //   console.log('Left Hosts')
                    //   await subspace.stopFarmer()
                    //   console.log('stopped farming')
                    // }, 30000)
                }, 10000);
            }, 7000);
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
    });
    program
        .version(version, '-v, --version')
        .parse(process.argv);
});
//# sourceMappingURL=cli.js.map