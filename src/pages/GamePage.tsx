import { Link, useSearchParams } from 'react-router-dom'

type PlayerRow = {
  name: string
  rounds: number[]
  total: number
}

function buildSampleRows(currentPlayer: string): PlayerRow[] {
  const safeName = currentPlayer || 'Player 1'

  return [
    { name: safeName, rounds: [0, 0, 0], total: 0 },
    { name: 'Waiting For Player 2', rounds: [0, 0, 0], total: 0 },
  ]
}

function GamePage() {
  const [searchParams] = useSearchParams()
  const room = searchParams.get('room') ?? 'UNKNOWN'
  const playerName = searchParams.get('name') ?? ''
  const role = searchParams.get('role') ?? 'guest'
  const isHost = role === 'host'
  const players = buildSampleRows(playerName)

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="kicker">Game Screen (UI Shell)</p>
        <h1>Room {room}</h1>
        <p className="lead">
          Signed in as <strong>{playerName || 'Unnamed Player'}</strong> ({isHost ? 'Host' : 'Guest'})
        </p>
      </header>

      <section className="card" aria-labelledby="scoreboard-title">
        <h2 id="scoreboard-title">Scoreboard (Placeholder)</h2>
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
        <h2 id="chat-title">Chat Board (Placeholder)</h2>
        <div className="placeholder-box">Realtime chat will be added with WebRTC in the next step.</div>
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
