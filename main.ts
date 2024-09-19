import { VarIntDecoder, VarIntEncoder } from "./varint.ts";

const listener = Deno.listen({ port: 25565 });

console.log("listening on 0.0.0.0:25565");

const textDecoder = new TextDecoder()
const intEncoder = new VarIntEncoder()
const intDecoder = new VarIntDecoder()

async function writePacket(writer: WritableStreamDefaultWriter, packetId: number, data: Uint8Array) {
  await writer.write(intEncoder.encode(data.length + intEncoder.encode(packetId).length))
  await writer.write(intEncoder.encode(packetId))
  await writer.write(data)
}

class PacketDataReader {
  view: DataView
  byteOffset: number = 0;

  constructor(public buffer: ArrayBuffer) {
    this.view = new DataView(buffer)
  }

  readBytes(size: number) {
    const data = this.buffer.slice(this.byteOffset, this.byteOffset + size)
    this.byteOffset += size
    return data
  }

  readU16() {
    const value = this.view.getUint16(this.byteOffset, false)
    this.byteOffset += 2
    return value
  }
  
  readVarInt() {
    const { value, bytesRead } = intDecoder.decode(this.buffer.slice(this.byteOffset), 32)
    this.byteOffset += bytesRead
    return value
  }

  readString() {
    const size = this.readVarInt()
    const data = this.readBytes(size)
    return textDecoder.decode(data)
  }

  readPacket() {
    const size = this.readVarInt()
    const packetId = this.readVarInt()
    const data = this.readBytes(size)

    return {
      size,
      packetId,
      data
    }
  }

  readHandshake() {
    const protocolVersion = this.readVarInt()
    const serverAddress = this.readString()
    const serverPort = this.readU16()

    const nextState = this.readVarInt()

    return {
      protocolVersion,
      serverAddress,
      serverPort,
      nextState
    }
  }
}

for await (const conn of listener) {
  console.log('new connection', conn)
  const reader = conn.readable.getReader({ 'mode': 'byob' })
  const buffer = new ArrayBuffer(1024)

  const initialData = await reader.read(new Uint8Array(buffer))
  
  if(!initialData.value) {
    conn.close()
    continue
  }

  const view = new PacketDataReader(initialData.value.buffer)
  const packet = view.readPacket()
  const dataView = new PacketDataReader(packet.data);
  const handshake = dataView.readHandshake()
  
  // reader.releaseLock()

  const statusResponse = JSON.stringify({
    "version": {
      "name": "1.21.1",
      "protocol": 767
    },
    "players": {
        "max": 20,
        "online": 0,
        "sample": [
        ]
    },
    "description": {
        "text": "Bree's Server"
    },
    "enforcesSecureChat": false
  })

  const textEncoder = new TextEncoder()
  const text = textEncoder.encode(statusResponse)
  const textSize = intEncoder.encode(text.length)
  const data = new Uint8Array(text.length + textSize.length)
  data.set(textSize)
  data.set(text, textSize.length)

  const writer = conn.writable.getWriter();
  await writePacket(writer, 0, data)
  await writer.ready

  // writer.releaseLock()
  // reader.releaseLock()
  // await conn.readable.pipeTo(conn.writable)

  {
    const data = await reader.read(new Uint8Array(1024))
    
    if(!data.value) {
      conn.close()
      continue
    }

    const view = new PacketDataReader(data.value.buffer)
    const packet = view.readPacket()

    await conn.write(data.value)
    await writer.ready

    conn.close()
  }

}

