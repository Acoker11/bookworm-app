import { Link } from 'react-router-dom'
import Cover from './Cover'

export default function BookCard({ book }) {
  return (
    <Link to={`/books/${book.id}`} className="card">
      <Cover src={book.cover} title={book.title} />
      <h3>{book.title}</h3>
      <p>{book.authors.length ? book.authors.join(', ') : 'Unknown author'}</p>
    </Link>
  )
}
