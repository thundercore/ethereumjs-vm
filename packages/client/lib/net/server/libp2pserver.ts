import PeerId from 'peer-id'
import multiaddr from 'multiaddr'
import type Connection from '../../../../../node_modules/libp2p-interfaces/dist/src/connection/connection'
import { Libp2pNode } from '../peer/libp2pnode'
import { Libp2pPeer } from '../peer'
import { Server, ServerOptions } from './server'

export interface Libp2pServerOptions extends ServerOptions {
  /* Multiaddrs to listen on */
  multiaddrs?: multiaddr[]
}

/**
 * Libp2p server
 * @emits connected
 * @emits disconnected
 * @emits error
 * @memberof module:net/server
 */
export class Libp2pServer extends Server {
  private peers: Map<string, Libp2pPeer> = new Map()
  private banned: Map<string, number> = new Map()
  private multiaddrs: multiaddr[]
  private node: Libp2pNode | null

  /**
   * Create new DevP2P/RLPx server
   * @param {Libp2pServerOptions}
   */
  constructor(options: Libp2pServerOptions) {
    super(options)

    this.multiaddrs = options.multiaddrs ?? [multiaddr('/ip4/127.0.0.1/tcp/50580/ws')]

    this.node = null
    this.banned = new Map()
  }

  /**
   * Server name
   * @type {string}
   */
  get name() {
    return 'libp2p'
  }

  /**
   * Start Libp2p server. Returns a promise that resolves once server has been started.
   * @return Resolves with true if server successfully started
   */
  async start(): Promise<boolean> {
    if (this.started) {
      return false
    }
    await super.start()
    if (!this.node) {
      const peerId = await this.createPeerId()
      this.node = new Libp2pNode({
        peerId,
        bootnodes: this.bootnodes,
      })
      this.protocols.forEach(async (p) => {
        const protocol = `/${p.name}/${p.versions[0]}`
        this.node!.handle(protocol, async ({ connection }) => {
          try {
            const peerId = await this.getPeerId(connection)
            const peer = this.peers.get(peerId.toB58String())
            if (peer) {
              await peer.accept(p, connection, this)
              this.emit('connected', peer)
            }
          } catch (e) {
            this.error(e)
          }
        })
      })
    }
    this.node.on('peer:discovery', async (peerId: PeerId) => {
      try {
        const id = peerId.toB58String()
        if (this.peers.get(id) || this.isBanned(id)) {
          return
        }
        const peer = this.createPeer(peerId)
        await peer.bindProtocols(this.node as Libp2pNode, peerId, this)
        this.config.logger.debug(`Peer discovered: ${peer}`)
        this.emit('connected', peer)
      } catch (e) {
        this.error(e)
      }
    })
    this.node.on('peer:connect', (peerId: PeerId) => {
      try {
        const peer = this.createPeer(peerId)
        this.config.logger.debug(`Peer connected: ${peer}`)
      } catch (e) {
        this.error(e)
      }
    })
    await this.node.start()
    this.node.addressManager.getListenAddrs().map((ma) => {
      this.emit('listening', {
        transport: this.name,
        url: ma.toString(),
      })
    })
    this.started = true
    return true
  }

  /**
   * Stop Libp2p server. Returns a promise that resolves once server has been stopped.
   */
  async stop(): Promise<boolean> {
    if (this.started) {
      await this.node!.stop()
      await super.stop()
      this.started = false
    }
    return this.started
  }

  /**
   * Ban peer for a specified time
   * @param peerId id of peer
   * @param maxAge how long to ban peer (default: 60s)
   */
  ban(peerId: string, maxAge = 60000): boolean {
    if (!this.started) {
      return false
    }
    this.banned.set(peerId, Date.now() + maxAge)
    return true
  }

  /**
   * Check if peer is currently banned
   * @param  peerId id of peer
   * @return true if banned
   */
  isBanned(peerId: string): boolean {
    const expireTime = this.banned.get(peerId)
    if (expireTime && expireTime > Date.now()) {
      return true
    }
    this.banned.delete(peerId)
    return false
  }

  /**
   * Handles errors from server and peers
   * @private
   * @param  error
   * @emits  error
   */
  error(error: Error) {
    this.emit('error', error)
  }

  async createPeerId() {
    return this.key ? PeerId.createFromPrivKey(this.key) : PeerId.create()
  }

  async getPeerId(connection: Connection) {
    return connection.remotePeer
  }

  createPeer(peerId: PeerId, multiaddrs?: multiaddr[]) {
    const peer = new Libp2pPeer({
      config: this.config,
      id: peerId.toB58String(),
      multiaddrs,
      protocols: Array.from(this.protocols),
    })
    this.peers.set(peer.id, peer)
    return peer
  }
}
