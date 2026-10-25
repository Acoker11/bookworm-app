// books: the only place Google Books is called. Anonymous-callable (verify_jwt = false in config.toml),
// so every input is validated and only the fields the UI needs are returned.

const GOOGLE_BASE = Deno.env.get('GOOGLE_BOOKS_BASE_URL') ?? 'https://www.googleapis.com/books/v1'
const TIMEOUT_MS = Number(Deno.env.get('BOOKS_TIMEOUT_MS')) || 8000

const MAX_BODY_BYTES = 2048
const MAX_QUERY_LENGTH = 100
const MAX_PAGE = 24
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 40
const LIST_DESCRIPTION_MAX = 300
const ID_PATTERN = /^[A-Za-z0-9_-]{6,32}$/
const QUOTA_REASONS = ['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded', 'quotaExceeded']

const GENRES: Record<string, string> = {
  Adventure: 'subject:adventure',
  Technology: 'subject:technology',
  Horror: 'subject:horror',
  'Sci-Fi': 'subject:"science fiction"',
  Fiction: 'subject:fiction',
  'Non-Fiction': 'subject:nonfiction',
}

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public headers: Record<string, string> = {},
  ) {
    super(message)
  }
}

const bad = (message: string) => new HttpError(400, 'invalid_request', message)

// ---------- CORS ----------

function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean)
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  }
  if (allowed.length === 0) {
    headers['Access-Control-Allow-Origin'] = '*'
  } else {
    headers['Vary'] = 'Origin'
    const origin = req.headers.get('origin')
    if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

function json(req: Request, status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...extra },
  })
}

// ---------- validation ----------

function readPage(body: Record<string, unknown>): number {
  if (body.page === undefined) return 0
  if (!Number.isInteger(body.page) || (body.page as number) < 0 || (body.page as number) > MAX_PAGE) {
    throw bad(`page must be an integer from 0 to ${MAX_PAGE}`)
  }
  return body.page as number
}

function readPageSize(body: Record<string, unknown>): number {
  if (body.pageSize === undefined) return DEFAULT_PAGE_SIZE
  if (!Number.isInteger(body.pageSize) || (body.pageSize as number) < 1 || (body.pageSize as number) > MAX_PAGE_SIZE) {
    throw bad(`pageSize must be an integer from 1 to ${MAX_PAGE_SIZE}`)
  }
  return body.pageSize as number
}

function readTitleQuery(body: Record<string, unknown>): string {
  const raw = body.query
  if (typeof raw !== 'string') throw bad('query is required')
  const trimmed = raw.trim()
  if (trimmed.length === 0) throw bad('query is required')
  if (trimmed.length > MAX_QUERY_LENGTH) throw bad(`query must be at most ${MAX_QUERY_LENGTH} characters`)
  // deno-lint-ignore no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) throw bad('query contains invalid characters')
  // Drop ":" and quotes so users cannot add Google operators (inauthor:, subject:, ...). Search stays title-only.
  const cleaned = trimmed.replace(/[:"]/g, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned.length === 0) throw bad('query is required')
  return cleaned
}

// ---------- response shaping ----------

type GoogleVolume = {
  id?: string
  volumeInfo?: Record<string, unknown> & { imageLinks?: Record<string, string> }
}

function cleanDescription(html: unknown, max?: number): string {
  if (typeof html !== 'string') return 'No description available.'
  const text = html
    .replace(/<\s*(br|\/p|\/li)\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return 'No description available.'
  return max && text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

function cleanCover(links: Record<string, string> | undefined, zoom?: number): string | null {
  const url = links?.thumbnail ?? links?.smallThumbnail
  if (typeof url !== 'string' || !url) return null
  let out = url.replace(/^http:\/\//i, 'https://').replace(/&edge=curl/g, '')
  if (zoom) out = out.replace(/zoom=\d/, `zoom=${zoom}`)
  return out
}

const stringList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
const orNull = <T>(v: unknown, type: 'string' | 'number'): T | null => (typeof v === type ? (v as T) : null)

function shapeBook(v: GoogleVolume, details = false) {
  const info = v.volumeInfo ?? {}
  const base = {
    id: v.id as string,
    title: typeof info.title === 'string' && info.title ? info.title : 'Untitled',
    authors: stringList(info.authors),
    cover: cleanCover(info.imageLinks, details ? 2 : undefined),
    description: cleanDescription(info.description, details ? undefined : LIST_DESCRIPTION_MAX),
  }
  if (!details) return base
  return {
    ...base,
    subtitle: orNull<string>(info.subtitle, 'string'),
    publisher: orNull<string>(info.publisher, 'string'),
    publishedDate: orNull<string>(info.publishedDate, 'string'),
    pageCount: orNull<number>(info.pageCount, 'number'),
    categories: stringList(info.categories),
    language: orNull<string>(info.language, 'string'),
    averageRating: orNull<number>(info.averageRating, 'number'),
    ratingsCount: orNull<number>(info.ratingsCount, 'number'),
  }
}

// ---------- upstream ----------

async function googleFetch(url: string, apiKey: string, isDetails: boolean) {
  let res: Response
  let data: unknown
  try {
    res = await fetch(url, {
      headers: { 'x-goog-api-key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.ok) data = await res.json()
    else data = await res.json().catch(() => null)
  } catch (err) {
    const name = (err as Error)?.name
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new HttpError(504, 'upstream_timeout', 'The book service took too long to respond. Please try again.')
    }
    throw new HttpError(502, 'upstream_error', 'The book service is unavailable right now. Please try again.')
  }

  if (res.ok) return data

  console.error(`books: upstream status ${res.status}`)
  if (res.status === 404 && isDetails) throw new HttpError(404, 'not_found', 'That book could not be found.')
  const reason = (data as { error?: { errors?: { reason?: string }[] } } | null)?.error?.errors?.[0]?.reason
  if (res.status === 429 || (res.status === 403 && reason && QUOTA_REASONS.includes(reason))) {
    const retryAfter = res.headers.get('retry-after')
    throw new HttpError(
      429,
      'rate_limited',
      'Too many requests to the book service. Please wait a moment and try again.',
      retryAfter ? { 'Retry-After': retryAfter } : {},
    )
  }
  throw new HttpError(502, 'upstream_error', 'The book service had a problem. Please try again.')
}

async function listBooks(q: string, page: number, pageSize: number, apiKey: string) {
  const startIndex = page * pageSize
  const params = new URLSearchParams({
    q,
    startIndex: String(startIndex),
    maxResults: String(pageSize),
    printType: 'books',
    orderBy: 'relevance',
    fields: 'totalItems,items(id,volumeInfo(title,authors,description,imageLinks))',
  })
  const data = (await googleFetch(`${GOOGLE_BASE}/volumes?${params}`, apiKey, false)) as {
    totalItems?: number
    items?: GoogleVolume[]
  }
  const raw = Array.isArray(data?.items) ? data.items : []
  const seen = new Set<string>()
  const items = []
  for (const v of raw) {
    if (typeof v?.id !== 'string' || seen.has(v.id)) continue
    seen.add(v.id)
    items.push(shapeBook(v))
  }
  const totalItems = typeof data?.totalItems === 'number' ? data.totalItems : 0
  return {
    items,
    page,
    pageSize,
    totalItems,
    hasMore: raw.length > 0 && page < MAX_PAGE && startIndex + raw.length < totalItems,
  }
}

async function bookDetails(id: string, apiKey: string) {
  const data = (await googleFetch(`${GOOGLE_BASE}/volumes/${encodeURIComponent(id)}`, apiKey, true)) as GoogleVolume
  if (typeof data?.id !== 'string') throw new HttpError(502, 'upstream_error', 'The book service had a problem. Please try again.')
  return shapeBook(data, true)
}

// ---------- handler ----------

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('content-length'))
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'payload_too_large', 'Request is too large.')
  const text = await req.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new HttpError(413, 'payload_too_large', 'Request is too large.')
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw bad('Body must be valid JSON')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw bad('Body must be a JSON object')
  return body as Record<string, unknown>
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) })
  if (req.method !== 'POST') {
    throw new HttpError(405, 'method_not_allowed', 'Use POST.', { Allow: 'POST, OPTIONS' })
  }

  const body = await readBody(req)
  const type = body.type
  if (type !== 'home' && type !== 'search' && type !== 'genre' && type !== 'details') {
    throw bad('type must be one of: home, search, genre, details')
  }

  // Validate everything before touching the secret or the network.
  let run: (apiKey: string) => Promise<unknown>
  if (type === 'details') {
    if (typeof body.id !== 'string' || !ID_PATTERN.test(body.id)) throw bad('id is not a valid book id')
    const id = body.id
    run = (key) => bookDetails(id, key)
  } else {
    let q: string
    if (type === 'home') q = GENRES.Technology
    else if (type === 'search') q = `intitle:${readTitleQuery(body)}`
    else {
      if (typeof body.genre !== 'string' || !Object.hasOwn(GENRES, body.genre)) {
        throw bad(`genre must be one of: ${Object.keys(GENRES).join(', ')}`)
      }
      q = GENRES[body.genre]
    }
    const page = readPage(body)
    const pageSize = readPageSize(body)
    run = (key) => listBooks(q, page, pageSize, key)
  }

  const apiKey = Deno.env.get('GOOGLE_BOOKS_API_KEY')
  if (!apiKey) {
    console.error('books: GOOGLE_BOOKS_API_KEY is not set')
    throw new HttpError(500, 'server_error', 'Something went wrong on our side. Please try again later.')
  }
  return json(req, 200, await run(apiKey))
}

function handler(req: Request): Promise<Response> {
  return handle(req).catch((err) => {
    if (err instanceof HttpError) {
      return json(req, err.status, { error: { code: err.code, message: err.message } }, err.headers)
    }
    console.error('books: unexpected error', (err as Error)?.name)
    return json(req, 500, {
      error: { code: 'server_error', message: 'Something went wrong on our side. Please try again later.' },
    })
  })
}

// PORT is only set for local `deno run`; on Supabase the runtime picks the port.
const port = Number(Deno.env.get('PORT'))
if (port) Deno.serve({ port }, handler)
else Deno.serve(handler)
