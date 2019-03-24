(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "jayson"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const jayson = require("jayson");
    class ApiServer {
        constructor(subspace) {
            this.server = new jayson.Server({
                'records/get': async ([key], callback) => {
                    console.log(`records/get ${key}`);
                    try {
                        const value = await subspace.get(key);
                        this.replyJson(callback, value, 200);
                        return;
                    }
                    catch (e) {
                        console.error(e && e.stack);
                        this.replyError(callback, e.message);
                        return;
                    }
                },
                'records/put': async ([value], callback) => {
                    console.log(`records/put`);
                    try {
                        const key = await subspace.put(value, false);
                        this.replyJson(callback, key, 201);
                        return;
                    }
                    catch (e) {
                        console.error(e && e.stack);
                        this.replyError(callback, e.message);
                        return;
                    }
                }
            });
        }
        listen(ip, port) {
            return new Promise((resolve, reject) => {
                this.server.http()
                    .listen(port, ip)
                    .on('listening', resolve)
                    .on('error', reject);
            });
        }
        // noinspection JSMethodCanBeStatic
        replyJson(callback, payload, code = 200) {
            callback(null, { payload, code });
        }
        // noinspection JSMethodCanBeStatic
        replyError(callback, message = 'Internal Server Error', code = 500) {
            callback({ code, message });
        }
    }
    exports.ApiServer = ApiServer;
});
//# sourceMappingURL=ApiServer.js.map