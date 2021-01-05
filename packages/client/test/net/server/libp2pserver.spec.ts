import { EventEmitter } from 'events'
import tape from 'tape-catch'
import td from 'testdouble'
import multiaddr from 'multiaddr'
import { Config } from '../../../lib/config'

tape('[Libp2pServer]', async (t) => {
  const PeerId = td.replace('peer-id')

  const Libp2pPeer = td.replace('../../../lib/net/peer/libp2ppeer')
  Libp2pPeer.id = 'id0'

  class Libp2pNode extends EventEmitter {
    handle(_: any, _2: Function) {}
    start() {}
    stop() {}
    addressManager = {
      getListenAddrs() {
        return ['ma0']
      },
    }
  }
  Libp2pNode.prototype.handle = td.func<any>()
  Libp2pNode.prototype.start = td.func<any>()
  Libp2pNode.prototype.stop = td.func<any>()
  td.replace('../../../lib/net/peer/libp2pnode', { Libp2pNode })

  const conn0 = 'conn0' as any
  const conn1 = 'conn1' as any
  td.when(Libp2pNode.prototype.handle('/proto/1', td.callback)).thenCallback(
    { connection: conn0 },
    null
  )
  td.when(Libp2pNode.prototype.handle('/proto/2', td.callback)).thenCallback(
    { connection: conn1 },
    null
  )
  td.when(Libp2pNode.prototype.start()).thenResolve()
  td.when(Libp2pNode.prototype.stop()).thenResolve()

  td.when(PeerId.create()).thenResolve('id0')
  td.when(PeerId.createFromPrivKey(Buffer.from('1'))).thenResolve('id1')
  td.when(PeerId.createFromPrivKey(Buffer.from('2'))).thenResolve('id2')
  td.when(PeerId.createFromPrivKey(Buffer.from('3'))).thenReject(new Error('err0'))

  const { Libp2pServer } = await import('../../../lib/net/server/libp2pserver')

  t.test('should initialize correctly', async (t) => {
    const config = new Config({ transports: [] })
    const multiaddrs = [
      multiaddr('/ip4/192.0.2.1/tcp/12345'),
      multiaddr('/ip4/192.0.2.1/tcp/23456'),
    ]
    const server = new Libp2pServer({
      config,
      multiaddrs,
      bootnodes: ['0.0.0.0:3030', '1.1.1.1:3031'],
      key: Buffer.from('abcd'),
    })
    t.deepEquals((server as any).multiaddrs, multiaddrs, 'multiaddrs correct')
    t.deepEquals(
      server.bootnodes,
      [
        { ip: '0.0.0.0', port: 3030 },
        { ip: '1.1.1.1', port: 3031 },
      ],
      'bootnodes split'
    )
    t.equals(server.key!.toString(), 'abcd', 'key is correct')
    t.equals(server.name, 'libp2p', 'get name')
    t.end()
  })

  t.test('should create peer id', async (t) => {
    const config = new Config({ transports: [] })
    const multiaddrs = [multiaddr('/ip4/6.6.6.6')]
    let server = new Libp2pServer({ config, multiaddrs })
    t.equals(await server.createPeerId(), 'id0', 'created')
    server = new Libp2pServer({ config, multiaddrs, key: Buffer.from('1') })
    t.equals(await server.createPeerId(), 'id1', 'created with id')
    server = new Libp2pServer({ config, multiaddrs, key: Buffer.from('2') })
    t.equals(await server.createPeerId(), 'id2', 'created with id')
    server = new Libp2pServer({ config, multiaddrs, key: Buffer.from('3') })
    try {
      await server.createPeerId()
    } catch (err) {
      t.equals(err.message, 'err0', 'handle error')
    }
    t.end()
  })

  t.test('should get peer info', async (t) => {
    const config = new Config({ transports: [] })
    const server = new Libp2pServer({ config })
    const connection = td.object<any>()
    connection.remotePeer = 'id0'
    t.equals(await server.getPeerId(connection), 'id0', 'got id')
    td.when(server.getPeerId(td.matchers.anything())).thenReject(new Error('err0'))
    try {
      await server.getPeerId(connection)
    } catch (err) {
      t.equals(err.message, 'err0', 'got error')
    }
    t.end()
  })

  t.test('should create peer', async (t) => {
    const config = new Config({ transports: [] })
    const multiaddrs = [multiaddr('/ip4/6.6.6.6')]
    const server = new Libp2pServer({ config, multiaddrs })
    const peerId = {
      toB58String() {
        return 'id'
      },
    } as any
    const peer = server.createPeer(peerId, [])
    t.equals(peer.constructor.name, 'Libp2pPeer', 'created peer')
    t.equals((server as any).peers.get(peer.id), peer, 'has peer')
    t.end()
  })

  t.test('should start/stop server and test banning', async (t) => {
    t.plan(11)
    const config = new Config({ transports: [], loglevel: 'off' })
    const multiaddrs = [multiaddr('/ip4/6.6.6.6')]
    const server = new Libp2pServer({ config, multiaddrs })
    const protos: any = [
      { name: 'proto', versions: [1] },
      { name: 'proto', versions: [2] },
    ]
    const peer = td.object<any>()
    const peer2 = td.object({ id: 'id2', bindProtocols: td.func() }) as any
    protos.forEach((p: any) => {
      p.open = td.func()
      td.when(p.open()).thenResolve(null)
    })
    server.createPeer = td.func<typeof server['createPeer']>()
    server.getPeerId = td.func<typeof server['getPeerId']>()
    const peerId = {
      toB58String() {
        return 'id'
      },
    } as any
    const peerId2 = {
      toB58String() {
        return 'id2'
      },
    } as any
    const peerId3 = {
      toB58String() {
        return 'id3'
      },
    } as any
    td.when(server.getPeerId(conn0)).thenResolve(peerId)
    td.when(server.getPeerId(conn1)).thenReject(new Error('err0'))
    td.when(server.createPeer(peerId2)).thenReturn(peer2)
    td.when(peer.accept(protos[0], 'conn0', server)).thenResolve(null)
    ;(server as any).peers.set('id', peer)
    server.addProtocols(protos)
    server.on('listening', (info: any) =>
      t.deepEquals(info, { transport: 'libp2p', url: 'ma0' }, 'listening')
    )
    server.once('connected', (p: any) => t.equals(p, peer, 'peer connected'))
    server.on('error', (err: Error) => t.equals(err.message, 'err0', 'got err0'))
    t.notOk(server.ban('peer'), 'unbannable')
    t.notOk(await server.stop(), 'not started')
    await server.start()
    t.notOk(server.addProtocols([]), 'cannot add protocols after start')
    server.ban('peer0', 10)
    t.ok(server.isBanned('peer0'), 'banned')
    setTimeout(() => {
      t.notOk(server.isBanned('peer0'), 'ban expired')
    }, 20)
    const { node } = server as any
    t.equals(node.constructor.name, 'Libp2pNode', 'libp2p node created')
    node.emit('peer:discovery', peerId)
    td.when(peer2.bindProtocols(node, 'id2', server)).thenResolve(null)
    server.once('connected', () => t.ok('peer2 connected'))
    node.emit('peer:discovery', peerId2)
    node.emit('peer:connect', peerId3)
    td.verify(server.createPeer(peerId3))
    await server.stop()
    t.notOk(server.running, 'stopped')
  })

  t.test('should reset td', (t) => {
    td.reset()
    t.end()
  })
})
