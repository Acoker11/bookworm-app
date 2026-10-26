import { useParams } from 'react-router-dom'
import BookListView from '../components/BookListView'
import { Empty } from '../components/Status'
import { useBookList } from '../hooks/useBookList'
import { GENRES } from '../lib/genres'

export default function Genre() {
  const { genre } = useParams()
  if (!GENRES.includes(genre)) return <Empty text="That genre does not exist." />
  return <GenreResults genre={genre} />
}

function GenreResults({ genre }) {
  const list = useBookList({ type: 'genre', genre })
  return (
    <section>
      <h1>{genre}</h1>
      <BookListView list={list} emptyText={`No ${genre} books found.`} />
    </section>
  )
}
