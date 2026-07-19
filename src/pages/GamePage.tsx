import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { realtimeClient } from '../lib/realtime'
import type { ChatMessage, Participant, SessionRole } from '../lib/realtime'

type PlayerRow = {
  name: string
  rounds: number[]
  total: number
}

function toScoreRows(participants: Participant[]): PlayerRow[] {
  if (participants.length === 0) {
    return [{ name: 'Waiting For Players', rounds: [0, 0, 0], total: 0 }]
  }

  return participants.map((participant) => ({
    name: participant.name,
    rounds: [0, 0, 0],
    total: 0,
  }))
}

function GamePage() {
  const [searchParams] = useSearchParams()
  const room = searchParams.get('room') ?? 'UNKNOWN'
  const playerName = searchParams.get('name') ?? ''
  const role = (searchParams.get('role') ?? 'guest') as SessionRole
  const isHost = role === 'host'

  const [connectionStatus, setConnectionStatus] = useState('Connecting...')
  const [participants, setParticipants] = useState<Participant[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [connectionError, setConnectionError] = useState('')

  const players = useMemo(() => toScoreRows(participants), [participants])

  useEffect(() => {
    let active = true

    const unsubscribe = realtimeClient.subscribe((event) => {
      if (!active) {
        return
      }

      if (event.type === 'status') {
        setConnectionStatus(event.value)
        setConnectionError('')
        return
      }

      if (event.type === 'participants') {
        setParticipants(event.value)
        return
      }

      if (event.type === 'chat') {
        setChatMessages((prev) => [...prev.slice(-99), event.value])
        return
      }

      if (event.type === 'error') {
        setConnectionError(event.value)
      }
    })

    async function connect(): Promise<void> {
      try {
        if (!playerName.trim()) {
          setConnectionError('Player name missing. Return to host/join page and retry.')
          return
        }

        if (!room.trim() || room === 'UNKNOWN') {
          setConnectionError('Room code missing. Return to host/join page and retry.')
          return
        }

        if (isHost) {
          await realtimeClient.startHost(room, playerName)
          return
        }

        await realtimeClient.joinAsGuest(room, playerName)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown realtime connection error'
        setConnectionError(message)
      }
    }

    void connect()

    return () => {
      active = false
      unsubscribe()
      realtimeClient.disconnect()
    }
  }, [isHost, playerName, room])

  function handleSendChat(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    if (!chatInput.trim()) {
      return
    }

    realtimeClient.sendChat(chatInput)
    setChatInput('')
  }

  function handleReconnect(): void {
    setConnectionError('')
    realtimeClient.retryConnection()
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="kicker">Release 2 - Realtime Step</p>
        <h1>Room {room}</h1>
        <p className="lead">
          Signed in as <strong>{playerName || 'Unnamed Player'}</strong> ({isHost ? 'Host' : 'Guest'})
        </p>
        <p className="saved-data" data-testid="connection-status">Status: {connectionStatus}</p>
        {connectionError ? <p className="error-text" data-testid="connection-error">{connectionError}</p> : null}
        <div className="button-row reconnect-row">
          <button type="button" className="ghost" data-testid="reconnect-button" onClick={handleReconnect}>
            {isHost ? 'Rebind Host Room' : 'Reconnect'}
          </button>
        </div>
      </header>

      <section className="card" aria-labelledby="scoreboard-title">
        <h2 id="scoreboard-title">Scoreboard Shell</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>R1</th>
                <th>R2</th>
                <th>R3</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.name}>
                  <td>{player.name}</td>
                  <td>{player.rounds[0]}</td>
                  <td>{player.rounds[1]}</td>
                  <td>{player.rounds[2]}</td>
                  <td>{player.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isHost ? (
          <button type="button" className="host-start-button">Start Game (Host Only)</button>
        ) : (
          <p className="saved-data">Waiting for host to start the game.</p>
        )}
      </section>

      <section className="card" aria-labelledby="dart-title">
        <h2 id="dart-title">Dart Board Area (Placeholder)</h2>
        <div className="placeholder-box">Dart interaction UI comes in the next release step.</div>
      </section>

      <section className="card" aria-labelledby="chat-title">
        <h2 id="chat-title">Chat Board (WebRTC)</h2>
        <div className="chat-box" aria-live="polite">
          {chatMessages.length === 0 ? (
            <p className="saved-data">No messages yet.</p>
          ) : (
            chatMessages.map((message) => (
              <p key={message.id} className={message.kind === 'system' ? 'chat-system' : 'chat-user'}>
                <strong>{message.sender}:</strong> {message.text}
              </p>
            ))
          )}
        </div>

        <form className="chat-form" onSubmit={handleSendChat}>
          <label htmlFor="chat-input">Message</label>
          <input
            id="chat-input"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="Send message to room"
            maxLength={300}
          />
          <div className="button-row">
            <button type="submit" disabled={!chatInput.trim()}>
              Send
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="button-row">
          <Link className="button-link ghost-link" to="/host">
            Host Lobby
          </Link>
          <Link className="button-link ghost-link" to="/join">
            Join Lobby
          </Link>
        </div>
      </section>
    </main>
  )
}

export default GamePage
