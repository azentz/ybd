import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'

export type SessionRole = 'host' | 'guest'

export type Participant = {
  clientId: string
  peerId: string
  name: string
  isHost: boolean
}

export type ChatMessage = {
  id: string
  sender: string
  text: string
  timestamp: number
  kind: 'user' | 'system'
}

type WireMessage =
  | { type: 'join'; clientId: string; name: string }
  | { type: 'chat'; id: string; sender: string; text: string; timestamp: number }
  | { type: 'participants'; participants: Participant[] }
  | { type: 'system'; id: string; text: string; timestamp: number }

type RealtimeEvent =
  | { type: 'status'; value: string }
  | { type: 'participants'; value: Participant[] }
  | { type: 'chat'; value: ChatMessage }
  | { type: 'error'; value: string }

type Listener = (event: RealtimeEvent) => void

const PEER_PREFIX = 'ybd'
const GUEST_CLIENT_ID_KEY = 'ybd.guest-client-id.v1'
const MAX_RECONNECT_ATTEMPTS = 16
const GUEST_CONNECT_TIMEOUT_MS = 2500
const GUEST_FAST_PROBE_ATTEMPTS = 16
const GUEST_PREFERRED_SLOT_ATTEMPTS = 8
const HOST_REBIND_DELAY_MS = 5000
const HOST_MAX_BIND_ATTEMPTS = 6
const HOST_SLOT_COUNT = 24
const HOST_REBIND_JITTER_MS = 1500
const HOST_CANDIDATE_COOLDOWN_MS = 9000
const HOST_PREFERRED_SLOT_RETRY_LIMIT = 3
const PEER_OPEN_TIMEOUT_MS = 12000
const LAST_HOST_PEER_KEY_PREFIX = 'ybd.last-host-peer'

type PeerClientOptions = {
  host: string
  port: number
  path: string
  secure: boolean
  key: string
}

function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toLowerCase()
}

function hostPeerIdFromRoom(roomCode: string): string {
  return `${PEER_PREFIX}-room-${normalizeRoomCode(roomCode)}`
}

function hostPeerIdsFromRoom(roomCode: string): string[] {
  const base = hostPeerIdFromRoom(roomCode)
  const peerIds = [base]

  for (let i = 2; i <= HOST_SLOT_COUNT; i += 1) {
    peerIds.push(`${base}-s${i}`)
  }

  return peerIds
}

function randomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true
  }

  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false
  }

  return undefined
}

function parseIntegerEnv(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function getPeerClientOptions(): PeerClientOptions | undefined {
  const env = import.meta.env
  const host = env.VITE_PEER_HOST?.trim()

  if (!host) {
    return undefined
  }

  return {
    host,
    port: parseIntegerEnv(env.VITE_PEER_PORT) ?? 443,
    path: env.VITE_PEER_PATH?.trim() || '/',
    secure: parseBooleanEnv(env.VITE_PEER_SECURE) ?? true,
    key: env.VITE_PEER_KEY?.trim() || 'peerjs',
  }
}

function getOrCreateGuestClientId(): string {
  const existing = localStorage.getItem(GUEST_CLIENT_ID_KEY)

  if (existing) {
    return existing
  }

  const next = randomId(`${PEER_PREFIX}-client`)
  localStorage.setItem(GUEST_CLIENT_ID_KEY, next)
  return next
}

function roomLastHostPeerIdKey(roomCode: string): string {
  return `${LAST_HOST_PEER_KEY_PREFIX}.${normalizeRoomCode(roomCode)}`
}

function loadLastHostPeerId(roomCode: string): string | null {
  return localStorage.getItem(roomLastHostPeerIdKey(roomCode))
}

function saveLastHostPeerId(roomCode: string, hostPeerId: string): void {
  localStorage.setItem(roomLastHostPeerIdKey(roomCode), hostPeerId)
}

class RealtimeClient {
  private peer: Peer | null = null
  private role: SessionRole | null = null
  private roomCode = ''
  private playerName = ''
  private guestClientId = ''
  private hostPeerCandidates: string[] = []
  private activeHostPeerId = ''
  private preferredHostPeerId = ''
  private preferredHostPeerRetriesLeft = 0
  private guestHostProbeIndex = 0
  private hostConnection: DataConnection | null = null
  private hostConnections: Map<string, DataConnection> = new Map()
  private participantsByClientId: Map<string, Participant> = new Map()
  private peerIdToClientId: Map<string, string> = new Map()
  private listeners: Set<Listener> = new Set()
  private guestReconnectTimer: number | null = null
  private guestReconnectAttempts = 0
  private hostRebindTimer: number | null = null
  private hostBindAttempts = 0
  private hostBindInFlight = false
  private hostAutoRebindPaused = false
  private hostCandidateCooldownUntil: Map<string, number> = new Map()
  private manualDisconnect = false
  private suppressNextPeerCloseEvent = false
  private suppressNextPeerDisconnectedEvent = false

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  async startHost(roomCode: string, playerName: string): Promise<void> {
    this.disconnect()
    this.manualDisconnect = false

    this.role = 'host'
    this.roomCode = roomCode.trim().toUpperCase()
    this.playerName = playerName.trim()
    this.hostPeerCandidates = hostPeerIdsFromRoom(this.roomCode)
    this.activeHostPeerId = ''
    this.preferredHostPeerId = ''
    this.preferredHostPeerRetriesLeft = 0
    this.hostBindAttempts = 0
    this.hostBindInFlight = false
    this.hostAutoRebindPaused = false
    this.hostCandidateCooldownUntil.clear()

    const rememberedHostPeer = loadLastHostPeerId(this.roomCode)
    if (rememberedHostPeer) {
      const foundIndex = this.hostPeerCandidates.indexOf(rememberedHostPeer)
      if (foundIndex > 0) {
        this.hostPeerCandidates.splice(foundIndex, 1)
        this.hostPeerCandidates.unshift(rememberedHostPeer)
      }

      this.preferredHostPeerId = rememberedHostPeer
      this.preferredHostPeerRetriesLeft = HOST_PREFERRED_SLOT_RETRY_LIMIT
    }

    this.emit({ type: 'status', value: 'Starting host session...' })
    await this.bindHostPeer()
  }

  async joinAsGuest(roomCode: string, playerName: string): Promise<void> {
    this.disconnect()
    this.manualDisconnect = false

    this.role = 'guest'
    this.roomCode = roomCode.trim().toUpperCase()
    this.playerName = playerName.trim()
    this.guestClientId = getOrCreateGuestClientId()
    this.hostPeerCandidates = hostPeerIdsFromRoom(this.roomCode)
    this.guestHostProbeIndex = 0
    this.activeHostPeerId = ''

    const rememberedHostPeer = loadLastHostPeerId(this.roomCode)
    if (rememberedHostPeer) {
      const foundIndex = this.hostPeerCandidates.indexOf(rememberedHostPeer)
      if (foundIndex > 0) {
        this.hostPeerCandidates.splice(foundIndex, 1)
        this.hostPeerCandidates.unshift(rememberedHostPeer)
      }
    }

    const guestPeerId = randomId(`${PEER_PREFIX}-guest`)

    this.emit({ type: 'status', value: 'Preparing guest connection...' })

    await this.createPeer(guestPeerId)

    this.connectGuestToHost()
  }

  sendChat(text: string): void {
    const trimmed = text.trim()

    if (!trimmed || !this.role) {
      return
    }

    const message: ChatMessage = {
      id: randomId('chat'),
      sender: this.playerName,
      text: trimmed,
      timestamp: Date.now(),
      kind: 'user',
    }

    if (this.role === 'host') {
      this.emit({ type: 'chat', value: message })
      this.broadcastWire({
        type: 'chat',
        id: message.id,
        sender: message.sender,
        text: message.text,
        timestamp: message.timestamp,
      })
      return
    }

    if (this.hostConnection?.open) {
      this.sendWire(this.hostConnection, {
        type: 'chat',
        id: message.id,
        sender: message.sender,
        text: message.text,
        timestamp: message.timestamp,
      })
      return
    }

    this.emit({ type: 'error', value: 'Not connected to host yet. Please wait or reconnect.' })
  }

  retryConnection(): void {
    if (!this.role) {
      return
    }

    if (this.role === 'host') {
      this.hostBindAttempts = 0
      this.hostAutoRebindPaused = false

      if (this.hostRebindTimer !== null) {
        window.clearTimeout(this.hostRebindTimer)
        this.hostRebindTimer = null
      }

      if (this.hostBindInFlight) {
        this.emit({ type: 'status', value: 'Host bind already in progress...' })
        return
      }

      this.emit({ type: 'status', value: 'Reconnecting host session...' })
      void this.bindHostPeer()
      return
    }

    this.guestReconnectAttempts = 0
    this.connectGuestToHost()
  }

  disconnect(): void {
    this.manualDisconnect = true

    if (this.guestReconnectTimer !== null) {
      window.clearTimeout(this.guestReconnectTimer)
      this.guestReconnectTimer = null
    }

    if (this.hostRebindTimer !== null) {
      window.clearTimeout(this.hostRebindTimer)
      this.hostRebindTimer = null
    }

    this.hostConnection?.close()
    this.hostConnection = null

    for (const conn of this.hostConnections.values()) {
      conn.close()
    }

    this.hostConnections.clear()
    this.participantsByClientId.clear()
    this.peerIdToClientId.clear()

    if (this.peer) {
      this.suppressNextPeerCloseEvent = true
      this.suppressNextPeerDisconnectedEvent = true
      this.peer.destroy()
      this.peer = null
    }

    this.role = null
    this.roomCode = ''
    this.playerName = ''
    this.hostPeerCandidates = []
    this.activeHostPeerId = ''
    this.preferredHostPeerId = ''
    this.preferredHostPeerRetriesLeft = 0
    this.guestHostProbeIndex = 0
    this.guestClientId = ''
    this.guestReconnectAttempts = 0
    this.hostBindAttempts = 0
    this.hostBindInFlight = false
    this.hostAutoRebindPaused = false
    this.hostCandidateCooldownUntil.clear()
  }

  private async createPeer(
    peerId: string,
    quietUnavailableIdError = false,
    scheduleHostRebindOnUnavailableId = true,
  ): Promise<Peer> {
    return await new Promise<Peer>((resolve, reject) => {
      const options = getPeerClientOptions()
      const peer = options ? new Peer(peerId, options) : new Peer(peerId)
      this.peer = peer
      let opened = false
      let settled = false

      const settleResolve = () => {
        if (settled) {
          return
        }

        settled = true
        window.clearTimeout(openTimeout)
        resolve(peer)
      }

      const settleReject = (error: unknown) => {
        if (settled) {
          return
        }

        settled = true
        window.clearTimeout(openTimeout)
        reject(error)
      }

      const openTimeout = window.setTimeout(() => {
        if (settled || this.peer !== peer || opened) {
          return
        }

        this.emit({ type: 'error', value: `Peer error: Timed out opening ${peerId}` })
        settleReject(new Error(`Timed out opening peer ${peerId}`))
      }, PEER_OPEN_TIMEOUT_MS)

      peer.on('disconnected', () => {
        if (this.peer !== peer) {
          return
        }

        if (this.suppressNextPeerDisconnectedEvent) {
          this.suppressNextPeerDisconnectedEvent = false
          return
        }

        if (this.role === 'guest') {
          this.emit({ type: 'status', value: 'Signaling connection lost. Attempting to reconnect...' })
          peer.reconnect()
          return
        }

        if (this.role === 'host' && !this.manualDisconnect) {
          if (this.hostBindInFlight || this.hostRebindTimer !== null || this.hostAutoRebindPaused) {
            return
          }

          this.emit({ type: 'status', value: 'Host signaling lost. Attempting recovery...' })
          // For transient signaling drops, keep the same host peer ID and ask PeerJS to
          // reconnect first. Rebind is still handled by close/error paths if reconnect fails.
          peer.reconnect()
        }
      })

      peer.on('close', () => {
        if (this.peer !== peer) {
          return
        }

        if (this.suppressNextPeerCloseEvent) {
          this.suppressNextPeerCloseEvent = false
          return
        }

        if (!opened) {
          settleReject(new Error(`Peer ${peerId} closed before opening`))
          return
        }

        if (!this.manualDisconnect) {
          if (this.role === 'host') {
            this.emit({ type: 'status', value: 'Host connection dropped. Rebinding room...' })
            this.handleHostPeerClosed()
            this.scheduleHostRebind('Host session closed unexpectedly. Retrying room bind...')
            return
          }

          if (this.role === 'guest') {
            this.emit({ type: 'status', value: 'Peer closed. Attempting to reconnect...' })
            this.scheduleGuestReconnect('Peer closed. Retrying...')
          }
        }
      })

      peer.on('open', () => {
        if (this.peer !== peer) {
          return
        }

        opened = true
        settleResolve()
      })

      peer.on('error', (error) => {
        if (this.peer !== peer) {
          return
        }

        const isUnavailableId = this.isUnavailableIdError(error)
        if (!(quietUnavailableIdError && isUnavailableId)) {
          this.emit({ type: 'error', value: `Peer error: ${error.message}` })
        }

        if (this.role === 'guest' && !this.manualDisconnect) {
          this.scheduleGuestReconnect('Peer error detected, retrying...')
        }

        if (
          this.role === 'host' &&
          !this.manualDisconnect &&
          scheduleHostRebindOnUnavailableId &&
          this.isUnavailableIdError(error)
        ) {
          this.scheduleHostRebind('Room ID still reserved. Waiting before host rebind...')
        }

        if (!opened) {
          settleReject(error)
        }
      })
    })
  }

  private registerHostConnection(conn: DataConnection): void {
    const existing = this.hostConnections.get(conn.peer)
    if (existing && existing !== conn) {
      existing.close()
    }

    this.hostConnections.set(conn.peer, conn)

    conn.on('open', () => {
      this.emit({ type: 'status', value: `Player connected: ${conn.peer}` })
    })

    conn.on('data', (payload) => {
      this.handleHostData(conn, payload)
    })

    conn.on('close', () => {
      this.hostConnections.delete(conn.peer)

      const clientId = this.peerIdToClientId.get(conn.peer)
      this.peerIdToClientId.delete(conn.peer)

      let departedName = ''
      if (clientId) {
        departedName = this.participantsByClientId.get(clientId)?.name ?? ''
        this.participantsByClientId.delete(clientId)
        this.emitParticipants()
      }

      if (departedName) {
        this.broadcastSystem(`${departedName} left the room.`)
      }
    })

    conn.on('error', (error) => {
      this.emit({ type: 'error', value: `Connection error (${conn.peer}): ${error.message}` })
    })
  }

  private handleHostData(conn: DataConnection, payload: unknown): void {
    if (!this.isWireMessage(payload)) {
      return
    }

    if (payload.type === 'join') {
      const playerName = payload.name.trim() || `Player-${conn.peer.slice(-4)}`
      const clientId = payload.clientId.trim() || conn.peer

      const previous = this.participantsByClientId.get(clientId)
      if (previous && previous.peerId !== conn.peer) {
        const staleConn = this.hostConnections.get(previous.peerId)
        staleConn?.close()
        this.hostConnections.delete(previous.peerId)
        this.peerIdToClientId.delete(previous.peerId)
      }

      this.peerIdToClientId.set(conn.peer, clientId)
      this.participantsByClientId.set(clientId, {
        clientId,
        peerId: conn.peer,
        name: playerName,
        isHost: false,
      })
      this.emitParticipants()

      if (!previous) {
        this.broadcastSystem(`${playerName} joined the room.`)
      } else {
        this.broadcastSystem(`${playerName} reconnected.`)
      }
      return
    }

    if (payload.type === 'chat') {
      const message: ChatMessage = {
        id: payload.id,
        sender: payload.sender,
        text: payload.text,
        timestamp: payload.timestamp,
        kind: 'user',
      }

      this.emit({ type: 'chat', value: message })
      this.broadcastWire(payload)
    }
  }

  private handleGuestData(payload: unknown): void {
    if (!this.isWireMessage(payload)) {
      return
    }

    if (payload.type === 'participants') {
      this.emit({ type: 'participants', value: payload.participants })
      return
    }

    if (payload.type === 'chat') {
      this.emit({
        type: 'chat',
        value: {
          id: payload.id,
          sender: payload.sender,
          text: payload.text,
          timestamp: payload.timestamp,
          kind: 'user',
        },
      })
      return
    }

    if (payload.type === 'system') {
      this.emit({
        type: 'chat',
        value: {
          id: payload.id,
          sender: 'System',
          text: payload.text,
          timestamp: payload.timestamp,
          kind: 'system',
        },
      })
    }
  }

  private emitParticipants(): void {
    const participants: Participant[] = Array.from(this.participantsByClientId.values())

    this.emit({ type: 'participants', value: participants })

    this.broadcastWire({
      type: 'participants',
      participants,
    })
  }

  private broadcastSystem(text: string): void {
    const payload = {
      type: 'system' as const,
      id: randomId('sys'),
      text,
      timestamp: Date.now(),
    }

    this.emit({
      type: 'chat',
      value: {
        id: payload.id,
        sender: 'System',
        text: payload.text,
        timestamp: payload.timestamp,
        kind: 'system',
      },
    })

    this.broadcastWire(payload)
  }

  private sendWire(conn: DataConnection, payload: WireMessage): void {
    if (!conn.open) {
      return
    }

    conn.send(payload)
  }

  private broadcastWire(payload: WireMessage): void {
    for (const conn of this.hostConnections.values()) {
      this.sendWire(conn, payload)
    }
  }

  private connectGuestToHost(): void {
    if (!this.peer || this.role !== 'guest' || this.hostPeerCandidates.length === 0) {
      return
    }

    if (this.peer.disconnected) {
      this.emit({ type: 'status', value: 'Signaling connection lost. Reconnecting signaling link...' })
      this.peer.reconnect()
      this.scheduleGuestReconnect('Waiting for signaling to recover...')
      return
    }

    this.hostConnection?.close()

    const preferredHostPeerId = loadLastHostPeerId(this.roomCode)
    const shouldProbePreferred =
      !!preferredHostPeerId &&
      this.hostPeerCandidates.includes(preferredHostPeerId) &&
      (this.guestReconnectAttempts < GUEST_PREFERRED_SLOT_ATTEMPTS ||
        this.guestReconnectAttempts % 3 === 0)

    const candidate = shouldProbePreferred
      ? (preferredHostPeerId as string)
      : this.hostPeerCandidates[this.guestHostProbeIndex % this.hostPeerCandidates.length]

    if (!shouldProbePreferred) {
      this.guestHostProbeIndex += 1
    }

    this.emit({
      type: 'status',
      value: `Connecting to host${this.guestReconnectAttempts > 0 ? ` (attempt ${this.guestReconnectAttempts + 1})` : ''}...`,
    })

    const conn = this.peer.connect(candidate, { reliable: true })
    this.hostConnection = conn
    let opened = false
    const connectTimeout = window.setTimeout(() => {
      if (opened || this.manualDisconnect || this.hostConnection !== conn) {
        return
      }

      conn.close()
      this.scheduleGuestReconnect('Host did not respond. Probing next slot...')
    }, GUEST_CONNECT_TIMEOUT_MS)

    conn.on('open', () => {
      opened = true
      window.clearTimeout(connectTimeout)
      this.guestReconnectAttempts = 0
      this.activeHostPeerId = candidate
      saveLastHostPeerId(this.roomCode, candidate)
      this.emit({ type: 'status', value: `Connected to host in room ${this.roomCode}` })
      this.sendWire(conn, {
        type: 'join',
        clientId: this.guestClientId,
        name: this.playerName,
      })
    })

    conn.on('data', (payload) => {
      this.handleGuestData(payload)
    })

    conn.on('close', () => {
      window.clearTimeout(connectTimeout)

      if (this.manualDisconnect) {
        return
      }

      this.emit({ type: 'status', value: 'Disconnected from host. Retrying...' })
      this.scheduleGuestReconnect('Connection closed. Retrying...')
    })

    conn.on('error', (error) => {
      window.clearTimeout(connectTimeout)
      this.emit({ type: 'error', value: `Guest connection error: ${error.message}` })

      if (!opened && !this.manualDisconnect) {
        this.scheduleGuestReconnect('Unable to reach host. Retrying...')
      }
    })
  }

  private scheduleGuestReconnect(status: string): void {
    if (this.role !== 'guest' || this.manualDisconnect) {
      return
    }

    if (this.guestReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emit({
        type: 'error',
        value: 'Could not reconnect automatically. Please use Reconnect button or return to Join page.',
      })
      return
    }

    if (this.guestReconnectTimer !== null) {
      return
    }

    const delayMs = this.guestReconnectAttempts < GUEST_FAST_PROBE_ATTEMPTS ? 500 : 1500
    this.guestReconnectAttempts += 1
    this.emit({ type: 'status', value: `${status} Next attempt in ${Math.round(delayMs / 1000)}s.` })

    this.guestReconnectTimer = window.setTimeout(() => {
      this.guestReconnectTimer = null

      if (this.role !== 'guest' || this.manualDisconnect) {
        return
      }

      if (!this.peer || this.peer.destroyed || this.peer.disconnected) {
        void this.recreateGuestPeerAndConnect()
        return
      }

      this.connectGuestToHost()
    }, delayMs)
  }

  private async recreateGuestPeerAndConnect(): Promise<void> {
    if (this.role !== 'guest' || this.manualDisconnect) {
      return
    }

    this.hostConnection?.close()
    this.hostConnection = null

    if (this.peer) {
      this.suppressNextPeerCloseEvent = true
      this.suppressNextPeerDisconnectedEvent = true
      this.peer.destroy()
      this.peer = null
    }

    const guestPeerId = randomId(`${PEER_PREFIX}-guest`)

    try {
      await this.createPeer(guestPeerId)
      this.connectGuestToHost()
    } catch {
      if (!this.manualDisconnect) {
        this.scheduleGuestReconnect('Guest signaling restart failed. Retrying...')
      }
    }
  }

  private async bindHostPeer(): Promise<void> {
    if (this.role !== 'host' || this.manualDisconnect) {
      return
    }

    if (this.hostBindInFlight) {
      return
    }

    if (this.hostRebindTimer !== null) {
      window.clearTimeout(this.hostRebindTimer)
      this.hostRebindTimer = null
    }

    if (this.hostPeerCandidates.length === 0) {
      this.emit({ type: 'error', value: 'No host peer IDs available for this room.' })
      return
    }

    this.hostBindInFlight = true

    try {
      if (this.peer) {
        this.suppressNextPeerCloseEvent = true
        this.suppressNextPeerDisconnectedEvent = true
        this.peer.destroy()
        this.peer = null
      }

      let activePeer: Peer | null = null
      let lastError: unknown = null
      let soonestCooldownMs: number | null = null

      const hasPreferredCandidate =
        !!this.preferredHostPeerId && this.hostPeerCandidates.includes(this.preferredHostPeerId)

      const candidateList =
        hasPreferredCandidate && this.preferredHostPeerRetriesLeft > 0
          ? [this.preferredHostPeerId]
          : this.hostPeerCandidates

      for (let offset = 0; offset < candidateList.length; offset += 1) {
        const candidatePeerId = candidateList[offset]
        const index = this.hostPeerCandidates.indexOf(candidatePeerId)
        if (index < 0) {
          continue
        }

        const cooldownUntil = this.hostCandidateCooldownUntil.get(candidatePeerId) ?? 0
        const cooldownMsRemaining = cooldownUntil - Date.now()

        if (cooldownMsRemaining > 0) {
          if (soonestCooldownMs === null || cooldownMsRemaining < soonestCooldownMs) {
            soonestCooldownMs = cooldownMsRemaining
          }

          continue
        }

        try {
          activePeer = await this.createPeer(candidatePeerId, true, false)
          this.activeHostPeerId = candidatePeerId
          this.preferredHostPeerId = candidatePeerId
          this.preferredHostPeerRetriesLeft = HOST_PREFERRED_SLOT_RETRY_LIMIT
          this.hostCandidateCooldownUntil.delete(candidatePeerId)
          saveLastHostPeerId(this.roomCode, candidatePeerId)
          break
        } catch (error) {
          lastError = error
          if (this.isUnavailableIdError(error)) {
            if (hasPreferredCandidate && candidatePeerId === this.preferredHostPeerId) {
              this.preferredHostPeerRetriesLeft = Math.max(0, this.preferredHostPeerRetriesLeft - 1)
            }

            this.hostCandidateCooldownUntil.set(
              candidatePeerId,
              Date.now() + HOST_CANDIDATE_COOLDOWN_MS + Math.floor(Math.random() * 1000),
            )
            continue
          }

          const message = error instanceof Error ? error.message : 'Unknown host bind error'
          this.emit({ type: 'error', value: `Host bind failed: ${message}` })
          this.scheduleHostRebind('Host bind failed. Retrying...')
          return
        }
      }

      if (!activePeer) {
        if (this.manualDisconnect || this.role !== 'host') {
          return
        }

        if (hasPreferredCandidate && this.preferredHostPeerRetriesLeft > 0) {
          this.scheduleHostRebind('Reclaiming previous host slot. Retrying...')
          return
        }

        if (soonestCooldownMs !== null && soonestCooldownMs > 0) {
          this.scheduleHostRebind(
            'All room host slots are cooling down. Retrying...',
            Math.min(Math.max(soonestCooldownMs, 1000), 10000),
          )
          return
        }

        if (this.isUnavailableIdError(lastError)) {
          this.scheduleHostRebind('All room host slots are currently reserved. Retrying...')
          return
        }

        this.scheduleHostRebind('Host bind unavailable. Retrying...')
        return
      }

      this.hostBindAttempts = 0
      this.participantsByClientId.clear()
      this.peerIdToClientId.clear()
      this.participantsByClientId.set('host', {
        clientId: 'host',
        peerId: activePeer.id,
        name: this.playerName,
        isHost: true,
      })
      this.emitParticipants()
      this.emit({
        type: 'status',
        value: `Hosting room ${this.roomCode} (${this.activeHostPeerId})`,
      })

      activePeer.on('connection', (conn: DataConnection) => {
        this.registerHostConnection(conn)
      })
    } catch (error) {
      if (this.manualDisconnect || this.role !== 'host') {
        return
      }

      const message = error instanceof Error ? error.message : 'Unknown host bind error'
      this.emit({ type: 'error', value: `Host bind failed: ${message}` })
      this.scheduleHostRebind('Host bind failed. Retrying...')
    } finally {
      this.hostBindInFlight = false
    }
  }

  private scheduleHostRebind(status: string, requestedDelayMs?: number): void {
    if (this.role !== 'host' || this.manualDisconnect) {
      return
    }

    if (this.hostAutoRebindPaused) {
      return
    }

    if (this.hostBindAttempts >= HOST_MAX_BIND_ATTEMPTS) {
      this.hostAutoRebindPaused = true
      this.emit({
        type: 'error',
        value: 'Could not rebind host room after multiple attempts. Auto-reconnect is paused. Use Rebind Host Room to retry.',
      })
      this.emit({
        type: 'status',
        value: 'Auto-reconnect paused after repeated failures. Click Rebind Host Room to try again.',
      })
      return
    }

    if (this.hostRebindTimer !== null) {
      return
    }

    this.hostBindAttempts += 1
    const exponentialDelayMs = Math.round(HOST_REBIND_DELAY_MS * Math.pow(1.6, this.hostBindAttempts - 1))
    const baseDelayMs = Math.min(requestedDelayMs ?? exponentialDelayMs, 20000)
    const jitterMs = Math.floor(Math.random() * HOST_REBIND_JITTER_MS)
    const totalDelayMs = baseDelayMs + jitterMs
    const waitSeconds = Math.max(1, Math.round(totalDelayMs / 1000))
    this.emit({
      type: 'status',
      value: `${status} Attempt ${this.hostBindAttempts}/${HOST_MAX_BIND_ATTEMPTS} in ${waitSeconds}s.`,
    })

    this.hostRebindTimer = window.setTimeout(() => {
      this.hostRebindTimer = null
      void this.bindHostPeer()
    }, totalDelayMs)
  }

  private handleHostPeerClosed(): void {
    this.hostConnection?.close()
    this.hostConnection = null

    for (const conn of this.hostConnections.values()) {
      conn.close()
    }

    this.hostConnections.clear()
    this.participantsByClientId.clear()
    this.peerIdToClientId.clear()
    this.emitParticipants()
  }

  private isUnavailableIdError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }

    const maybe = error as { type?: string; message?: string }
    return (
      maybe.type === 'unavailable-id' ||
      (typeof maybe.message === 'string' && maybe.message.toLowerCase().includes('is taken'))
    )
  }

  private emit(event: RealtimeEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  private isWireMessage(payload: unknown): payload is WireMessage {
    if (!payload || typeof payload !== 'object') {
      return false
    }

    const maybe = payload as { type?: string }

    return (
      maybe.type === 'join' ||
      maybe.type === 'chat' ||
      maybe.type === 'participants' ||
      maybe.type === 'system'
    )
  }
}

export const realtimeClient = new RealtimeClient()
