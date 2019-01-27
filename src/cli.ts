import * as program from "commander"
import * as fs from "fs";

program
  .version(
    JSON.parse(fs.readFileSync(__dirname + '/../package.json', 'utf8')).version,
    '-v, --version'
  )
  .parse(process.argv)
