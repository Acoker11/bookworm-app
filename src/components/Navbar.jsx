import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { GENRES } from '../lib/genres'

export default function Navbar() {
  const [text, setText] = useState('')
  const navigate = useNavigate()

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
    </header>
  )
}
