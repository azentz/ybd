import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import GamePage from './pages/GamePage'
import HomePage from './pages/HomePage'
import HostLobbyPage from './pages/HostLobbyPage'
import JoinGamePage from './pages/JoinGamePage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/host" element={<HostLobbyPage />} />
        <Route path="/join" element={<JoinGamePage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
  )
}

export default App
