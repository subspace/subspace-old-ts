import Subspace from "./subspace";
export declare class ApiServer {
    private readonly server;
    constructor(subspace: Subspace);
    listen(ip: string, port: number): Promise<void>;
    private replyJson;
    private replyError;
}
