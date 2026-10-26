import { supabase } from './supabase'

const FRIENDLY = {
  not_found: 'We could not find that book.',
  rate_limited: 'Too many requests right now. Please try again shortly.',
  upstream_timeout: 'The book service took too long to respond. Please try again.',
}

export class BooksError extends Error {
  constructor(code, message) {
    super(FRIENDLY[code] || message || 'Something went wrong. Please try again.')
    this.code = code
  }
}

// Calls the "books" Edge Function and throws BooksError on any failure.
export async function fetchBooks(body) {
  const { data, error } = await supabase.functions.invoke('books', { body })

  if (error) {
    let payload = null
    try {
      payload = await error.context.json()
    } catch {
      // network error or non-JSON response
    }
    throw new BooksError(payload?.error?.code || 'network_error', payload?.error?.message)
  }
  if (data?.error) throw new BooksError(data.error.code, data.error.message)
  return data
}
