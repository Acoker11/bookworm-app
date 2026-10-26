import BookCard from './BookCard'
import { Empty, ErrorMessage, Loading } from './Status'

// Shared list UI. layout: "row" (horizontal, Netflix-style) or "grid".
export default function BookListView({ list, layout = 'grid', emptyText }) {
  const { items, loading, loadingMore, error, hasMore, loadMore, retry } = list

  if (loading) return <Loading />
  if (error && items.length === 0) return <ErrorMessage error={error} onRetry={retry} />
  if (items.length === 0) return <Empty text={emptyText} />

  return (
    <>
      <div className={layout === 'row' ? 'row' : 'grid'}>
        {items.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
        {layout === 'row' && hasMore && (
          <button className="load-more row-end" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load More'}
          </button>
        )}
      </div>
      {error && <ErrorMessage error={error} onRetry={loadMore} />}
      {layout === 'grid' && hasMore && (
        <button className="load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load More'}
        </button>
      )}
    </>
  )
}
