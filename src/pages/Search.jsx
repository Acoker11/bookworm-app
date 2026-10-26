import { useSearchParams } from 'react-router-dom'
import BookListView from '../components/BookListView'
import { Empty } from '../components/Status'
import { useBookList } from '../hooks/useBookList'

export default function Search() {
  const [params] = useSearchParams()
  const q = (params.get('q') || '').trim()
  if (!q) return <Empty text="Type a title in the search box to find books." />
  return <SearchResults q={q} />
}

function SearchResults({ q }) {
  const list = useBookList({ type: 'search', query: q })
  return (
    <section>
      <h1>Results for “{q}”</h1>
      <BookListView list={list} emptyText={`No books found with “${q}” in the title.`} />
    </section>
  )
}
