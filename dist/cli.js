(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "commander", "fs"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const program = require("commander");
    const fs = require("fs");
    program
        .version(JSON.parse(fs.readFileSync(__dirname + '/../package.json', 'utf8')).version, '-v, --version')
        .parse(process.argv);
});
//# sourceMappingURL=cli.js.map