const MAX_32_BIT = 2 ** 32;

/**
 * @param number 64-bit unsigned integer
 *
 * @return 8-byte Uint8Array (64-bit big-endian unsigned integer)
 */
function number64ToUint8Array(number: number): Uint8Array {
  const binary = new Uint8Array(8);
  const binaryView = new DataView(binary.buffer);
  const timestampLower = number % MAX_32_BIT;
  binaryView.setUint32(0, (number - timestampLower) / MAX_32_BIT, false);
  binaryView.setUint32(0, timestampLower, false);
  return binary;
}

/**
 * @param binary 8-byte Uint8Array (64-bit big-endian unsigned integer)
 *
 * @return 64-bit unsigned integer
 */
function Uint8ArrayToNumber64(binary: Uint8Array): number {
  const binaryView = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  return (
    binaryView.getUint32(0, false) * MAX_32_BIT +
    binaryView.getUint32(4, false)
  );
}

export class Message {
  /**
   * @param type      0..255
   * @param version   0..255
   * @param timestamp Unix timestamp in ms
   * @param publicKey X bytes
   * @param payload   0+ bytes
   * @param signature Y bytes signature
   */
  private constructor(
    public readonly type: number,
    public readonly version: number,
    public readonly timestamp: number,
    public readonly publicKey: Uint8Array,
    public readonly payload: Uint8Array,
    public readonly signature: Uint8Array
  ) {
  }

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
  public static async create(
    type: number,
    version: number,
    timestamp: number,
    publicKey: Uint8Array,
    payload: Uint8Array,
    sign: (data: Uint8Array) => Promise<Uint8Array>
  ): Promise<Message> {
    const publicKeyLength = publicKey.length;
    const dataToSign = new Uint8Array(1 + 1 + 8 + 2 + publicKeyLength + payload.length);
    const dataToSignView = new DataView(dataToSign.buffer);
    dataToSign.set([type, version]);
    dataToSign.set(number64ToUint8Array(timestamp), 1 + 1);
    dataToSignView.setUint16(1 + 1 + 8, publicKeyLength, false);
    dataToSign.set(publicKey, 1 + 1 + 8 + 2);
    dataToSign.set(payload, 1 + 1 + 8 + 2 + publicKeyLength);
    const signature = await sign(dataToSign);

    return new Message(
      type,
      version,
      timestamp,
      publicKey,
      payload,
      signature
    );
  }

  /**
   * Reconstructs previously created message from binary blob
   *
   * @param binary
   * @param verify
   *
   * @throws {Error}
   */
  public static fromBinary(
    binary: Uint8Array,
    verify: (data: Uint8Array, publicKey: Uint8Array, signature: Uint8Array) => Promise<boolean>
  ): Message {
    const binaryView = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    const binaryLength = binary.length;
    const type = binary[0];
    const version = binary[1];
    const timestamp = Uint8ArrayToNumber64(
      binary.subarray(
        1 + 1,
        1 + 1 + 8
      )
    );
    const publicKeyLength = binaryView.getUint16(1 + 1 + 8, false);
    const publicKey = binary.slice(
      1 + 1 + 8 + 2,
      1 + 1 + 8 + + 2 + publicKeyLength
    );
    const signatureLength = binaryView.getUint16(binary.length - 2, false);
    const payload = binary.slice(
      1 + 1 + 8 + 2 + publicKeyLength,
      binaryLength - signatureLength - 2
    );
    const signature = binary.slice(
      binaryLength - signatureLength - 2,
      -2
    );

    const dataToSign = binary.subarray(0, binaryLength - signatureLength - 2);
    if (!verify(dataToSign, publicKey, signature)) {
      throw new Error('Bad message signature')
    }

    return new Message(type, version, timestamp, publicKey, payload, signature);
  }

  /**
   * Packs message into binary blob (for instance, for sending via network)
   *
   * It can later be reconstructed with `fromBinary` static method
   */
  public toBinary(): Uint8Array {
    const publicKeyLength = this.publicKey.length;
    const payloadLength = this.payload.length;
    const signatureLength = this.signature.length;
    const binary = new Uint8Array(1 + 1 + 8 + 2 + publicKeyLength + payloadLength + signatureLength + 2);
    const binaryView = new DataView(binary.buffer);

    binary.set([this.type, this.version]);
    binary.set(number64ToUint8Array(this.timestamp), 1 + 1);
    binaryView.setUint16(1 + 1 + 8, publicKeyLength, false);
    binary.set(this.publicKey, 1 + 1 + 8 + 2);
    binary.set(this.payload, 1 + 1 + 8 + 2 + publicKeyLength);
    binary.set(this.signature, 1 + 1 + 8 + 2 + publicKeyLength + payloadLength);
    binaryView.setUint16(1 + 1 + 8 + 2 + publicKeyLength + payloadLength + signatureLength, signatureLength, false);
    return binary;
  }
}
