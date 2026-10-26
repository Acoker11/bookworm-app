import { useCallback, useEffect, useState } from 'react'
import { fetchBooks } from '../lib/booksApi'

const PAGE_SIZE = 20

// Paginated list for type "home" | "search" | "genre".
export function useBookList({ type, query, genre }) {
  const [items, setItems] = useState([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let ignore = false
    setItems([])
    setPage(0)
    setHasMore(false)
    setError(null)
    setLoading(true)
    fetchBooks({ type, query, genre, page: 0, pageSize: PAGE_SIZE })
      .then((res) => {
        if (ignore) return
        setItems(res.items)
        setHasMore(res.hasMore)
      })
      .catch((err) => !ignore && setError(err))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [type, query, genre, attempt])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    setError(null)
    try {
      const res = await fetchBooks({ type, query, genre, page: page + 1, pageSize: PAGE_SIZE })
      setItems((prev) => {
        const seen = new Set(prev.map((b) => b.id))
        return [...prev, ...res.items.filter((b) => !seen.has(b.id))]
      })
      setPage(res.page)
      setHasMore(res.hasMore)
    } catch (err) {
      setError(err)
    } finally {
      setLoadingMore(false)
    }
  }, [type, query, genre, page])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { items, loading, loadingMore, error, hasMore, loadMore, retry }
}
