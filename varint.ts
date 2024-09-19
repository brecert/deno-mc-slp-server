const SEGMENT_BITS = 0x7F;
const CONTINUE_BIT = 0x80;

export class VarIntEncoder {
  #encodeInto(input: number, dest: { [n: number]: number }) {
    let position = 0;
    while (true) {
        if ((input & ~SEGMENT_BITS) == 0) {
            dest[position] = input;
            return position;
        }
  
        dest[position++] = ((input & SEGMENT_BITS) | CONTINUE_BIT);
  
        // Note: >>> means that the sign bit is shifted with the rest of the number rather than being left alone
        input >>>= 7;
    }
  }

  encodeInto(input: number, dest: Uint8Array) {
    this.#encodeInto(input, dest)
  }

  encode(input: number) {
    const array: number[] = []
    this.#encodeInto(input, array)
    return new Uint8Array(array)
  }
}

export class VarIntDecoder {
  decode(input: BufferSource, maxSize: number) {
    const buffer = input instanceof ArrayBuffer ? input : input.buffer
    const bytes = new Uint8Array(buffer)

    let value = 0;
    let position = 0;
    let bytesRead = 0;

    while (true) {
        const currentByte = bytes[bytesRead++];
        value |= (currentByte & SEGMENT_BITS) << position;
        if ((currentByte & CONTINUE_BIT) == 0) break;

        position += 7;

        if (position >= maxSize) throw new Error("VarInt is too big");
    }

    return {
      bytesRead,
      value
    }
  }
}