import { Link } from 'react-router-dom'

function NotFoundPage() {
  return (
    <main className="app-shell">
      <header className="hero">
        <p className="kicker">Not Found</p>
        <h1>Page Not Found</h1>
        <p className="lead">This route does not exist in the current release.</p>
      </header>

      <section className="card">
        <Link className="button-link" to="/">
          Back Home
        </Link>
      </section>
    </main>
  )
}

export default NotFoundPage
