import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Cover from '../components/Cover'
import LogsSection from '../components/LogsSection'
import { ErrorMessage, Loading } from '../components/Status'
import { useAuth } from '../context/AuthContext'
import { fetchBooks } from '../lib/booksApi'
import { supabase } from '../lib/supabase'

export default function BookDetails() {
  const { id } = useParams()
  const [book, setBook] = useState(null)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const { user } = useAuth()
  const [inLibrary, setInLibrary] = useState(false)
  const [libraryBusy, setLibraryBusy] = useState(false)
  const [libraryError, setLibraryError] = useState('')

  useEffect(() => {
    let ignore = false
    setBook(null)
    setError(null)
    fetchBooks({ type: 'details', id })
      .then((res) => !ignore && setBook(res))
      .catch((err) => !ignore && setError(err))
    return () => {
      ignore = true
    }
  }, [id, attempt])

  const userId = user?.id
  useEffect(() => {
    setInLibrary(false)
    setLibraryError('')
    if (!userId) return
    let ignore = false
    supabase
      .from('library_items')
      .select('id')
      .eq('volume_id', id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (ignore) return
        if (err) setLibraryError('Could not check your library.')
        else setInLibrary(Boolean(data))
      })
    return () => {
      ignore = true
    }
  }, [id, userId])

  async function addToLibrary() {
    setLibraryBusy(true)
    setLibraryError('')
    const { error: err } = await supabase.from('library_items').insert({ user_id: userId, volume_id: id })
    if (err) setLibraryError('Could not add this book. Please try again.')
    else setInLibrary(true)
    setLibraryBusy(false)
  }

  if (error) return <ErrorMessage error={error} onRetry={() => setAttempt((n) => n + 1)} />
  if (!book) return <Loading />

  const facts = [
    ['Publisher', book.publisher],
    ['Pages', book.pageCount],
    ['Published', book.publishedDate],
  ].filter(([, value]) => value)

  return (
    <>
    <article className="details">
      <Cover src={book.cover} title={book.title} />
      <div>
        <h1>{book.title}</h1>
        {book.subtitle && <h2>{book.subtitle}</h2>}
        <p className="authors">{book.authors.length ? book.authors.join(', ') : 'Unknown author'}</p>
        <dl>
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {user && (
          <p>
            {inLibrary ? (
              <span className="muted">✓ In your library</span>
            ) : (
              <button onClick={addToLibrary} disabled={libraryBusy}>
                {libraryBusy ? 'Adding…' : 'Add to Library'}
              </button>
            )}
          </p>
        )}
        {libraryError && <p className="status error" role="alert">{libraryError}</p>}
        <p className="description">{book.description}</p>
      </div>
    </article>
    <LogsSection volumeId={id} inLibrary={inLibrary} />
    </>
  )
}
