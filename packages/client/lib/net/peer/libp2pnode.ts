/**
 * Libp2p Bundle
 * @memberof module:net/peer
 */
import LibP2p from 'libp2p'
import multiaddr from 'multiaddr'
import PeerId from 'peer-id'
import { Bootnode } from '../../types'
// types currently unavailable for below libp2p deps, tracking issue:
// https://github.com/libp2p/js-libp2p/issues/659
const LibP2pTcp = require('libp2p-tcp')
const LibP2pWebsockets = require('libp2p-websockets')
const LibP2pBootstrap = require('libp2p-bootstrap')
const LibP2pKadDht = require('libp2p-kad-dht')
const mplex = require('libp2p-mplex')
const secio = require('libp2p-secio')

export interface Libp2pNodeOptions {
  /* Peer id */
  peerId: PeerId

  /* Addresses */
  addresses?: {
    listen?: string[]
    announce?: string[]
    announceFilter?: (ma: multiaddr[]) => multiaddr[]
  }

  /* Bootnodes */
  bootnodes?: Bootnode[]

  /* Multiaddrs */
  multiaddrs?: multiaddr[]
}

export class Libp2pNode extends LibP2p {
  constructor(options: Libp2pNodeOptions) {
    super({
      peerId: options.peerId,
      addresses: options.addresses,
      modules: {
        transport: [LibP2pTcp, LibP2pWebsockets],
        streamMuxer: [mplex],
        connEncryption: [secio],
        [<any>'peerDiscovery']: [LibP2pBootstrap],
        [<any>'dht']: LibP2pKadDht,
      },
      config: {
        peerDiscovery: {
          autoDial: true,
          [(<any>LibP2pBootstrap).tag]: {
            interval: 2000,
            enabled: options.bootnodes && options.bootnodes.length > 0,
            list: options.bootnodes ?? [],
          },
        },
        dht: {
          kBucketSize: 20,
        },
      },
    })
  }
}
