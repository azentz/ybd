import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadProfile, saveProfile } from '../lib/profile'
import { createJoinUrl, createRoomCode } from '../lib/room'

function HostLobbyPage() {
  const existingName = loadProfile()?.name ?? ''
  const [hostName, setHostName] = useState(existingName)
  const [roomCode, setRoomCode] = useState('')
  const [joinUrl, setJoinUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const navigate = useNavigate()

  const canStart = useMemo(() => hostName.trim().length > 0, [hostName])

  function handleStart(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    const playerName = hostName.trim()
    saveProfile({ name: playerName, updatedAt: new Date().toISOString() })

    const nextRoomCode = createRoomCode()
    const url = createJoinUrl(nextRoomCode)

    setRoomCode(nextRoomCode)
    setJoinUrl(url)
    setCopied(false)
  }

  async function handleCopy(): Promise<void> {
    if (!joinUrl) {
      return
    }

    await navigator.clipboard.writeText(joinUrl)
    setCopied(true)
  }

  function handleGoToGame(): void {
    if (!roomCode) {
      return
    }

    navigate(`/game?room=${encodeURIComponent(roomCode)}&name=${encodeURIComponent(hostName.trim())}&role=host`)
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="kicker">Host Lobby</p>
        <h1>Start A Game</h1>
        <p className="lead">Create a room and share a join URL with players.</p>
      </header>

      <section className="card" aria-labelledby="host-form-title">
        <h2 id="host-form-title">Host Setup</h2>
        <form onSubmit={handleStart} className="profile-form">
          <label htmlFor="host-name">Host Name</label>
          <input
            id="host-name"
            value={hostName}
            onChange={(event) => setHostName(event.target.value)}
            placeholder="Enter host name"
            maxLength={30}
          />

          <div className="button-row">
            <button type="submit" disabled={!canStart}>
              Start Game
            </button>
            <Link className="button-link ghost-link" to="/">
              Back Home
            </Link>
          </div>
        </form>
      </section>

      {roomCode ? (
        <section className="card" aria-labelledby="share-title">
          <h2 id="share-title">Share This URL</h2>
          <p className="saved-data">Room Code: <strong>{roomCode}</strong></p>
          <p className="join-url" title={joinUrl}>{joinUrl}</p>
          <div className="button-row">
            <button type="button" onClick={handleCopy}>Copy URL</button>
            <button type="button" className="ghost" onClick={handleGoToGame}>
              Continue To Game Screen
            </button>
          </div>
          {copied ? <p className="status-text">Join URL copied to clipboard.</p> : null}
        </section>
      ) : null}
    </main>
  )
}

export default HostLobbyPage
