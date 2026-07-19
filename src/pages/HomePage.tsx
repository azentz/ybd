import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { clearProfile, loadProfile, saveProfile } from '../lib/profile'

function HomePage() {
  const [nameInput, setNameInput] = useState('')
  const [savedName, setSavedName] = useState('')
  const [savedAt, setSavedAt] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    const profile = loadProfile()

    if (!profile) {
      return
    }

    setSavedName(profile.name)
    setSavedAt(profile.updatedAt)
    setNameInput(profile.name)
  }, [])

  const canSave = useMemo(() => nameInput.trim().length > 0, [nameInput])

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    const name = nameInput.trim()
    const updatedAt = new Date().toISOString()

    saveProfile({ name, updatedAt })
    setSavedName(name)
    setSavedAt(updatedAt)
    setStatusMessage('Player profile saved locally in this browser.')
  }

  function handleReset(): void {
    clearProfile()
    setNameInput('')
    setSavedName('')
    setSavedAt('')
    setStatusMessage('Local player profile cleared.')
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="kicker">Release 2 - Step 1</p>
        <h1>Yo Big Dawg</h1>
        <p className="lead">
          Lobby and join-game routing shell for manual testing before networking.
        </p>
      </header>

      <section className="card" aria-labelledby="profile-title">
        <h2 id="profile-title">Player Profile (Local Browser Storage)</h2>
        <form onSubmit={handleSubmit} className="profile-form">
          <label htmlFor="player-name">Player Name</label>
          <input
            id="player-name"
            name="player-name"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder="Enter your name"
            autoComplete="nickname"
            maxLength={30}
          />

          <div className="button-row">
            <button type="submit" disabled={!canSave}>
              Save Profile
            </button>
            <button type="button" className="ghost" onClick={handleReset}>
              Reset Local Data
            </button>
          </div>
        </form>

        {savedName ? (
          <p className="saved-data">
            Current local player: <strong>{savedName}</strong>
            {savedAt ? ` (saved ${new Date(savedAt).toLocaleString()})` : ''}
          </p>
        ) : (
          <p className="saved-data">No local player profile saved yet.</p>
        )}

        {statusMessage ? <p className="status-text">{statusMessage}</p> : null}
      </section>

      <section className="card" aria-labelledby="lobby-title">
        <h2 id="lobby-title">Game Lobby Routing</h2>
        <p className="lead-tight">
          Use one of these routes to test host/join/game page flow.
        </p>
        <div className="button-row route-links">
          <Link className="button-link" to="/host">
            Host A Game
          </Link>
          <Link className="button-link ghost-link" to="/join">
            Join A Game
          </Link>
        </div>
      </section>

      <section className="card" aria-labelledby="demo-title">
        <h2 id="demo-title">Single Player Throw Demo</h2>
        <p className="lead-tight">
          Practice dart throw feel and scoring without realtime networking.
        </p>
        <div className="button-row route-links">
          <Link className="button-link" to="/demo">
            Open Dart Demo
          </Link>
        </div>
      </section>
    </main>
  )
}

export default HomePage
