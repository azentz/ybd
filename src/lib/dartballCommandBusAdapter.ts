type CommandBusMode = 'host' | 'client'

type Point = {
  x: number
  y: number
}

type ThrowCommand = {
  commandId: string
  source: 'local' | 'client'
  clientId: string | null
  createdAt: number
  rawImpact: Point
  impact: Point
  qualitySummary: string
}

type ReplayState = unknown

type ThrowHistoryState = {
  entries: unknown[]
  cursor: number
}

type CommandBusOutboundEvent =
  | { type: 'throw-command'; command: ThrowCommand }
  | { type: 'undo-request' }
  | { type: 'redo-request' }
  | { type: 'state-updated'; snapshot: ReplayState; history: ThrowHistoryState }

type ThrowCommandBus = {
  setMode: (mode: CommandBusMode) => void
  getMode: () => CommandBusMode
  submitThrowCommand: (command: ThrowCommand) => void
  requestUndo: () => void
  requestRedo: () => void
  applyHostSnapshot: (snapshot: ReplayState, history: ThrowHistoryState) => void
  subscribe: (listener: (event: CommandBusOutboundEvent) => void) => () => void
}

export type DartballBusWireMessage =
  | { type: 'throw-command'; command: ThrowCommand }
  | { type: 'undo-request' }
  | { type: 'redo-request' }
  | { type: 'state-updated'; snapshot: ReplayState; history: ThrowHistoryState }

export type DartballBusTransport = {
  send: (message: DartballBusWireMessage) => void
  subscribe: (listener: (message: DartballBusWireMessage) => void) => () => void
}

export type DartballCommandBusAdapterOptions = {
  mode: CommandBusMode
  transport: DartballBusTransport
  onError?: (message: string) => void
}

export type DartballCommandBusAdapter = {
  dispose: () => void
  sendThrowCommand: (command: ThrowCommand) => void
  requestUndo: () => void
  requestRedo: () => void
  applySnapshot: (snapshot: ReplayState, history: ThrowHistoryState) => void
}

function hasCommandBus(): ThrowCommandBus | null {
  const globalWindow = window as Window & { dartballCommandBus?: ThrowCommandBus }
  return globalWindow.dartballCommandBus ?? null
}

function isThrowCommandMessage(message: DartballBusWireMessage): message is { type: 'throw-command'; command: ThrowCommand } {
  return message.type === 'throw-command'
}

function isStateUpdatedMessage(
  message: DartballBusWireMessage,
): message is { type: 'state-updated'; snapshot: ReplayState; history: ThrowHistoryState } {
  return message.type === 'state-updated'
}

export function createDartballCommandBusAdapter(
  options: DartballCommandBusAdapterOptions,
): DartballCommandBusAdapter {
  const bus = hasCommandBus()

  if (!bus) {
    throw new Error('dartball command bus is not available on window.dartballCommandBus')
  }

  bus.setMode(options.mode)

  const unsubBus = bus.subscribe((event) => {
    if (event.type === 'throw-command' || event.type === 'undo-request' || event.type === 'redo-request') {
      options.transport.send(event)
      return
    }

    // Host pushes authoritative state snapshots to connected clients.
    if (options.mode === 'host' && event.type === 'state-updated') {
      options.transport.send({
        type: 'state-updated',
        snapshot: event.snapshot,
        history: event.history,
      })
    }
  })

  const unsubTransport = options.transport.subscribe((message) => {
    const currentBus = hasCommandBus()
    if (!currentBus) {
      options.onError?.('dartball command bus missing while handling inbound transport message')
      return
    }

    if (options.mode === 'host') {
      if (isThrowCommandMessage(message)) {
        currentBus.submitThrowCommand({
          ...message.command,
          source: message.command.source === 'local' ? 'client' : message.command.source,
        })
        return
      }

      if (message.type === 'undo-request') {
        currentBus.requestUndo()
        return
      }

      if (message.type === 'redo-request') {
        currentBus.requestRedo()
      }
      return
    }

    if (isStateUpdatedMessage(message)) {
      currentBus.applyHostSnapshot(message.snapshot, message.history)
    }
  })

  return {
    dispose: () => {
      unsubBus()
      unsubTransport()
    },
    sendThrowCommand: (command) => {
      const currentBus = hasCommandBus()
      if (!currentBus) {
        options.onError?.('cannot send throw command: command bus missing')
        return
      }

      currentBus.submitThrowCommand({
        ...command,
        source: options.mode === 'client' ? 'client' : command.source,
      })
    },
    requestUndo: () => {
      const currentBus = hasCommandBus()
      if (!currentBus) {
        options.onError?.('cannot request undo: command bus missing')
        return
      }

      currentBus.requestUndo()
    },
    requestRedo: () => {
      const currentBus = hasCommandBus()
      if (!currentBus) {
        options.onError?.('cannot request redo: command bus missing')
        return
      }

      currentBus.requestRedo()
    },
    applySnapshot: (snapshot, history) => {
      const currentBus = hasCommandBus()
      if (!currentBus) {
        options.onError?.('cannot apply snapshot: command bus missing')
        return
      }

      currentBus.applyHostSnapshot(snapshot, history)
    },
  }
}
