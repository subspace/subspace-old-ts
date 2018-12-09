export declare class Message {
    readonly type: number;
    readonly version: number;
    readonly timestamp: number;
    readonly publicKey: Uint8Array;
    readonly payload: Uint8Array;
    readonly signature: Uint8Array;
    /**
     * @param type      0..255
     * @param version   0..255
     * @param timestamp Unix timestamp in ms
     * @param publicKey X bytes
     * @param payload   0+ bytes
     * @param signature Y bytes signature
     */
    private constructor();
    /**
     * Creates signed message from scratch
     *
     * @param type      0..255
     * @param version   0..255
     * @param timestamp Unix timestamp in ms
     * @param publicKey X bytes
     * @param payload   0+ bytes
     * @param sign      callback function to sign the message
     */
    static create(type: number, version: number, timestamp: number, publicKey: Uint8Array, payload: Uint8Array, sign: (data: Uint8Array) => Promise<Uint8Array>): Promise<Message>;
    /**
     * Reconstructs previously created message from binary blob
     *
     * @param binary
     * @param verify
     *
     * @throws {Error}
     */
    static fromBinary(binary: Uint8Array, verify: (data: Uint8Array, publicKey: Uint8Array, signature: Uint8Array) => Promise<boolean>): Message;
    /**
     * Packs message into binary blob (for instance, for sending via network)
     *
     * It can later be reconstructed with `fromBinary` static method
     */
    toBinary(): Uint8Array;
}
