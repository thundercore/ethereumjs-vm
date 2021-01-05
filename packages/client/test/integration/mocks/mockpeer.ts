import { Peer, PeerOptions } from '../../../lib/net/peer'
import MockServer from './mockserver'
import MockSender from './mocksender'
import * as network from './network'
import { EventEmitter } from 'events'
import Pushable from 'pull-pushable'
import pull from 'pull-stream'

interface MockPeerOptions extends PeerOptions {
  location: string
}

export default class MockPeer extends Peer {
  public location: string
  public connected: boolean

  constructor(options: MockPeerOptions) {
    super({ ...options, transport: 'mock', address: options.location })
    this.location = options.location
    this.connected = false
  }

  async connect() {
    if (this.connected) {
      return
    }
    await this.createConnection(this.location)
    this.emit('connected')
  }

  async accept(server: MockServer) {
    if (this.connected) {
      return
    }
    await this.createConnection(server.location)
    this.server = server
    this.inbound = true
  }

  async createConnection(location: string) {
    const protocols = this.protocols.map((p) => `${p.name}/${p.versions[0]}`)
    const connection = network.createConnection(this.id, location, protocols)
    await this.bindProtocols(connection)
  }

  async bindProtocols(connection: any) {
    const receiver = new EventEmitter()
    const pushable = Pushable()
    pull(pushable, connection)
    pull(
      connection,
      pull.drain((data: any) => receiver.emit('data', data))
    )
    await Promise.all(
      this.protocols.map(async (p) => {
        if (!connection.protocols.includes(`${p.name}/${p.versions[0]}`)) return
        await p.open()
        await this.bindProtocol(p, new MockSender(p.name, pushable, receiver))
      })
    )
    this.connected = true
  }
}
