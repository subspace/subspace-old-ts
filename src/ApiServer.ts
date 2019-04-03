import Subspace from "./subspace"
import jayson = require("jayson")

export class ApiServer {
  private readonly server: jayson.Server;

  constructor(subspace: Subspace) {
    this.server = new jayson.Server({
      'records/get': async ([key]: [string], callback: Function) => {
        console.log(`records/get ${key}`)
        try {
          const value = await subspace.get(key);
          this.replyJson(callback, value, 200)
          return
        } catch (e) {
          console.error(e && e.stack)
          this.replyError(callback, e.message)
          return
        }
      },
      'records/put': async ([value]: [any], callback: Function) => {
        console.log(`records/put`)
        try {
          const key = await subspace.put(value, false)
          this.replyJson(callback, key, 201)
          return
        } catch (e) {
          console.error(e && e.stack)
          this.replyError(callback, e.message)
          return
        }
      }
    })
  }

  listen(ip: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.http()
        .listen(port, ip)
        .on('listening', resolve)
        .on('error', reject)
    })
  }

  // noinspection JSMethodCanBeStatic
  private replyJson(callback: Function, payload: any, code: number = 200) {
    callback(null, {payload, code})
  }

  // noinspection JSMethodCanBeStatic
  private replyError(callback: Function, message: string = 'Internal Server Error', code: number = 500) {
    callback({code, message})
  }

}
