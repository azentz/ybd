import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

type StoredProfile = {
  name: string
  updatedAt: string
}

const PROFILE_STORAGE_KEY = 'ybd.profile.v1'

function loadProfile(): StoredProfile | null {
  const raw = localStorage.getItem(PROFILE_STORAGE_KEY)

  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StoredProfile

    if (typeof parsed.name !== 'string' || typeof parsed.updatedAt !== 'string') {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function saveProfile(profile: StoredProfile): void {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
}

function App() {
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
    localStorage.removeItem(PROFILE_STORAGE_KEY)
    setNameInput('')
    setSavedName('')
    setSavedAt('')
    setStatusMessage('Local player profile cleared.')
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="kicker">Release 1</p>
        <h1>Yo Big Dawg</h1>
        <p className="lead">
          Static React + TypeScript Progressive Web App base, ready for GitHub
          Pages deployment.
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

      <section className="card" aria-labelledby="checklist-title">
        <h2 id="checklist-title">Release 1 Validation Checklist</h2>
        <ul className="checklist">
          <li>App loads and routes correctly from GitHub Pages project path.</li>
          <li>PWA install prompt is available on supported browsers.</li>
          <li>Service worker registers and updates correctly.</li>
          <li>Offline fallback page appears without network.</li>
          <li>Player name saves and loads from browser local storage.</li>
        </ul>
      </section>
    </main>
  )
}

export default App
