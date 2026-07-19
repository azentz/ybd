import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { loadProfile, saveProfile } from '../lib/profile'

function JoinGamePage() {
  const [searchParams] = useSearchParams()
  const prefilledRoom = searchParams.get('room') ?? ''
  const existingName = loadProfile()?.name ?? ''

  const [roomCode, setRoomCode] = useState(prefilledRoom)
  const [playerName, setPlayerName] = useState(existingName)
  const navigate = useNavigate()

  const canJoin = useMemo(
    () => roomCode.trim().length > 0 && playerName.trim().length > 0,
    [roomCode, playerName],
  )

  function handleJoin(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    const normalizedName = playerName.trim()
    const normalizedRoom = roomCode.trim().toUpperCase()
    saveProfile({ name: normalizedName, updatedAt: new Date().toISOString() })

    navigate(`/game?room=${encodeURIComponent(normalizedRoom)}&name=${encodeURIComponent(normalizedName)}&role=guest`)
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="kicker">Join Game</p>
        <h1>Enter Room Details</h1>
        <p className="lead">Paste a shared room URL or enter room code and player name.</p>
      </header>

      <section className="card" aria-labelledby="join-form-title">
        <h2 id="join-form-title">Join Form</h2>
        <form onSubmit={handleJoin} className="profile-form">
          <label htmlFor="room-code">Room Code</label>
          <input
            id="room-code"
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value)}
            placeholder="e.g. 7KD3PZ"
            maxLength={10}
          />

          <label htmlFor="player-name">Player Name</label>
          <input
            id="player-name"
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="Enter your name"
            maxLength={30}
          />

          <div className="button-row">
            <button type="submit" disabled={!canJoin}>
              Join Game
            </button>
            <Link className="button-link ghost-link" to="/">
              Back Home
            </Link>
          </div>
        </form>
      </section>
    </main>
  )
}

export default JoinGamePage
