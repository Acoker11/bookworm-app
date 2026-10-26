import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GENRES } from '../lib/genres'

export default function Navbar() {
  const [text, setText] = useState('')
  const navigate = useNavigate()
  const { user, displayName, logOut } = useAuth()

  async function onLogOut() {
    await logOut().catch(() => {})
    navigate('/')
  }

  function onSubmit(e) {
    e.preventDefault()
    const q = text.trim()
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <header className="navbar">
      <Link to="/" className="brand">BookWorm</Link>
      <nav>
        {GENRES.map((g) => (
          <NavLink key={g} to={`/genre/${encodeURIComponent(g)}`}>{g}</NavLink>
        ))}
      </nav>
      <form onSubmit={onSubmit} role="search">
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search titles…"
          maxLength={100}
          aria-label="Search books by title"
        />
        <button type="submit">Search</button>
      </form>
      <div className="auth-links">
        {user ? (
          <>
            <span>{displayName}</span>
            <NavLink to="/library">My Library</NavLink>
            <button onClick={onLogOut}>Log out</button>
          </>
        ) : (
          <>
            <NavLink to="/login">Log in</NavLink>
            <NavLink to="/signup">Sign up</NavLink>
          </>
        )}
      </div>
    </header>
  )
}
