import {
  createDartballCommandBusAdapter,
  type DartballBusWireMessage,
  type DartballCommandBusAdapter,
} from './dartballCommandBusAdapter'
import { realtimeClient, type RealtimeGameMessage, type RealtimeEvent, type SessionRole } from './realtime'

const DARTBALL_BUS_CHANNEL = 'dartball-command-bus-v1'

type BridgeOptions = {
  role: SessionRole
  room: string
  name: string
  onStatus?: (message: string) => void
  onError?: (message: string) => void
}

export type DartballRealtimeBridge = {
  dispose: () => void
  adapter: DartballCommandBusAdapter
}

function isBridgeGameMessage(event: RealtimeEvent): event is { type: 'game'; value: RealtimeGameMessage } {
  return event.type === 'game' && event.value.channel === DARTBALL_BUS_CHANNEL
}

export async function createDartballRealtimeBridge(
  options: BridgeOptions,
): Promise<DartballRealtimeBridge> {
  if (options.role === 'host') {
    await realtimeClient.startHost(options.room, options.name)
  } else {
    await realtimeClient.joinAsGuest(options.room, options.name)
  }

  const transport = {
    send: (message: DartballBusWireMessage) => {
      realtimeClient.sendGameMessage(DARTBALL_BUS_CHANNEL, message)
    },
    subscribe: (listener: (message: DartballBusWireMessage) => void) => {
      return realtimeClient.subscribe((event) => {
        if (event.type === 'status') {
          options.onStatus?.(event.value)
          return
        }

        if (event.type === 'error') {
          options.onError?.(event.value)
          return
        }

        if (!isBridgeGameMessage(event)) {
          return
        }

        listener(event.value.payload as DartballBusWireMessage)
      })
    },
  }

  const adapter = createDartballCommandBusAdapter({
    mode: options.role === 'host' ? 'host' : 'client',
    transport,
    onError: options.onError,
  })

  return {
    adapter,
    dispose: () => {
      adapter.dispose()
      realtimeClient.disconnect()
    },
  }
}
