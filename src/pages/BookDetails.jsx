import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Cover from '../components/Cover'
import { ErrorMessage, Loading } from '../components/Status'
import { fetchBooks } from '../lib/booksApi'

export default function BookDetails() {
  const { id } = useParams()
  const [book, setBook] = useState(null)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

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

  if (error) return <ErrorMessage error={error} onRetry={() => setAttempt((n) => n + 1)} />
  if (!book) return <Loading />

  const facts = [
    ['Publisher', book.publisher],
    ['Pages', book.pageCount],
    ['Published', book.publishedDate],
  ].filter(([, value]) => value)

  return (
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
        <p className="description">{book.description}</p>
      </div>
    </article>
  )
}
