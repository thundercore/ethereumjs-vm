import { Sender } from './sender'
import type Connection from '../../../../../node_modules/libp2p-interfaces/dist/src/connection/connection'
import { bufferToInt, rlp } from 'ethereumjs-util'
import pushable, { Pushable } from 'pull-pushable'
import pull from 'pull-stream'
import catcher from 'pull-catch'

/**
 * Libp2p protocol sender
 * @emits message
 * @emits status
 * @memberof module:net/protocol
 */
export class Libp2pSender extends Sender {
  private connection: Connection
  private pushableStream: Pushable
  /**
   * Creates a new Libp2p protocol sender
   * @param {Connection} connection  connection to libp2p peer
   */
  constructor(connection: Connection) {
    super()

    this.connection = connection
    this.pushableStream = pushable()
    this.init()
  }

  init() {
    // outgoing stream
    pull(
      this.pushableStream,
      catcher((e: Error) => this.error(e)),
      this.connection
    )

    // incoming stream
    pull(
      this.connection,
      catcher((e: Error) => this.error(e)),
      pull.drain((message: any) => {
        // eslint-disable-next-line prefer-const
        let [code, payload]: any = rlp.decode(message)
        code = bufferToInt(code)
        if (code === 0) {
          const status: any = {}
          payload.forEach(([k, v]: any) => {
            status[k.toString()] = v
          })
          this.status = status
        } else {
          this.emit('message', { code, payload })
        }
      })
    )
  }

  /**
   * Send a status to peer
   * @param  {Object} status
   */
  sendStatus(status: any) {
    const payload: any = Object.entries(status).map(([k, v]) => [k, v])
    this.pushableStream.push(rlp.encode([0, payload]))
  }

  /**
   * Send a message to peer
   * @param  {number} code message code
   * @param  {*}      data message payload
   */
  sendMessage(code: number, data: any) {
    this.pushableStream.push(rlp.encode([code, data]))
  }

  /**
   * Handle pull stream errors
   * @param  error error
   */
  error(error: Error) {
    this.emit('error', error)
  }
}
