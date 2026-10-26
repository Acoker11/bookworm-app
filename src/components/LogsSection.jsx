import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Empty, ErrorMessage, Loading } from './Status'

const RATINGS = [1, 2, 3, 4, 5]

function LogForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [body, setBody] = useState(initial?.body ?? '')
  const [rating, setRating] = useState(initial?.rating ? String(initial.rating) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSubmit({ body: body.trim(), rating: rating ? Number(rating) : null })
      if (!initial) {
        setBody('')
        setRating('')
      }
    } catch {
      setError('Could not save your log. Please try again.')
    }
    setBusy(false)
  }

  return (
    <form className="log-form" onSubmit={handleSubmit}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a log…"
        required
        maxLength={5000}
        rows={3}
        aria-label="Log text"
      />
      <div className="log-form-row">
        <select value={rating} onChange={(e) => setRating(e.target.value)} aria-label="Rating">
          <option value="">No rating</option>
          {RATINGS.map((r) => (
            <option key={r} value={r}>{r} / 5</option>
          ))}
        </select>
        <button type="submit" disabled={busy || !body.trim()}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
      </div>
      {error && <p className="status error" role="alert">{error}</p>}
    </form>
  )
}

export default function LogsSection({ volumeId, inLibrary }) {
  const { user } = useAuth()
  const [logs, setLogs] = useState(null)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let ignore = false
    setLogs(null)
    setError(null)
    supabase
      .from('logs')
      .select('id, body, rating, created_at, user_id, profiles(display_name)')
      .eq('volume_id', volumeId)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (ignore) return
        if (err) setError(new Error('Could not load logs. Please try again.'))
        else setLogs(data)
      })
    return () => {
      ignore = true
    }
  }, [volumeId, attempt, inLibrary])

  const reload = () => setAttempt((n) => n + 1)

  async function create(values) {
    const { error: err } = await supabase.from('logs').insert({ user_id: user.id, volume_id: volumeId, ...values })
    if (err) throw err
    reload()
  }

  async function update(id, values) {
    const { error: err } = await supabase.from('logs').update(values).eq('id', id)
    if (err) throw err
    setEditingId(null)
    reload()
  }

  async function remove(id) {
    setActionError('')
    const { error: err } = await supabase.from('logs').delete().eq('id', id)
    if (err) return setActionError('Could not delete the log. Please try again.')
    reload()
  }

  return (
    <section className="logs">
      <h2>Logs</h2>
      {user && inLibrary && <LogForm submitLabel="Add log" onSubmit={create} />}
      {user && !inLibrary && <p className="muted">Add this book to your library to write a log.</p>}
      {actionError && <p className="status error" role="alert">{actionError}</p>}
      {error && <ErrorMessage error={error} onRetry={reload} />}
      {!error && !logs && <Loading />}
      {logs && logs.length === 0 && <Empty text="No logs yet." />}
      <ul>
        {logs?.map((log) => (
          <li key={log.id} className="log">
            <div className="log-meta">
              <strong>{log.profiles?.display_name ?? 'Reader'}</strong>
              <span className="muted">{new Date(log.created_at).toLocaleDateString()}</span>
              {log.rating && <span aria-label={`Rated ${log.rating} out of 5`}>{'★'.repeat(log.rating)}</span>}
            </div>
            {editingId === log.id ? (
              <LogForm
                initial={log}
                submitLabel="Save"
                onSubmit={(values) => update(log.id, values)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <p className="log-body">{log.body}</p>
                {user?.id === log.user_id && (
                  <div className="log-actions">
                    <button onClick={() => setEditingId(log.id)}>Edit</button>
                    <button onClick={() => remove(log.id)}>Delete</button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
