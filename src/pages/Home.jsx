import BookListView from '../components/BookListView'
import { useBookList } from '../hooks/useBookList'

export default function Home() {
  const list = useBookList({ type: 'home' })
  return (
    <section>
      <h1>Technology</h1>
      <BookListView list={list} layout="row" emptyText="No technology books found right now." />
    </section>
  )
}
