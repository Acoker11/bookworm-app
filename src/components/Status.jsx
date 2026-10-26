export function Loading({ text = 'Loading…' }) {
  return <p className="status" role="status">{text}</p>
}

export function ErrorMessage({ error, onRetry }) {
  return (
    <div className="status error" role="alert">
      <p>{error?.message || 'Something went wrong. Please try again.'}</p>
      {onRetry && <button onClick={onRetry}>Try again</button>}
    </div>
  )
}

export function Empty({ text = 'No books found.' }) {
  return <p className="status">{text}</p>
}
