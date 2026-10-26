import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Cover from '../components/Cover'
import { Empty, ErrorMessage, Loading } from '../components/Status'
import { fetchBooks } from '../lib/booksApi'
import { supabase } from '../lib/supabase'

const STATUSES = ['want to read', 'reading', 'finished']

export default function Library() {
  const [items, setItems] = useState(null)
  const [books, setBooks] = useState({})
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let ignore = false
    setItems(null)
    setError(null)
    async function load() {
      const { data, error: err } = await supabase
        .from('library_items')
        .select('id, volume_id, status, created_at')
        .order('created_at', { ascending: false })
      if (err) throw new Error('Could not load your library. Please try again.')
      const results = await Promise.allSettled(data.map((i) => fetchBooks({ type: 'details', id: i.volume_id })))
      if (ignore) return
      const map = {}
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') map[data[idx].volume_id] = r.value
      })
      setBooks(map)
      setItems(data)
    }
    load().catch((err) => !ignore && setError(err))
    return () => {
      ignore = true
    }
  }, [attempt])

  async function changeStatus(item, status) {
    setActionError('')
    const { error: err } = await supabase.from('library_items').update({ status }).eq('id', item.id)
    if (err) return setActionError('Could not update the status. Please try again.')
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, status } : i)))
  }

  async function remove(item) {
    setActionError('')
    const { error: err } = await supabase.from('library_items').delete().eq('id', item.id)
    if (err) return setActionError('Could not remove the book. Please try again.')
    setItems((list) => list.filter((i) => i.id !== item.id))
  }

  if (error) return <ErrorMessage error={error} onRetry={() => setAttempt((n) => n + 1)} />
  if (!items) return <Loading />

  return (
    <section className="library">
      <h1>My Library</h1>
      {actionError && <p className="status error" role="alert">{actionError}</p>}
      {items.length === 0 && <Empty text="Your library is empty. Find a book and add it." />}
      <ul>
        {items.map((item) => {
          const book = books[item.volume_id]
          return (
            <li key={item.id} className="library-item">
              <Link to={`/books/${item.volume_id}`} className="library-cover">
                <Cover src={book?.cover} title={book?.title ?? 'Book'} />
              </Link>
              <div className="library-info">
                <Link to={`/books/${item.volume_id}`}>
                  <strong>{book?.title ?? 'Book details unavailable'}</strong>
                </Link>
                {book?.authors?.length > 0 && <span className="muted">{book.authors.join(', ')}</span>}
                <div className="library-actions">
                  <select
                    value={item.status}
                    onChange={(e) => changeStatus(item, e.target.value)}
                    aria-label="Reading status"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button onClick={() => remove(item)}>Remove</button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
