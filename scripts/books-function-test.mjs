// books Edge Function test: runs the function locally with Deno against a mock Google Books server.
// Needs Deno installed, no Docker, no real key. Run: npm run test:books
import { spawn } from 'node:child_process'
import http from 'node:http'

const FN_PATH = 'supabase/functions/books/index.ts'
const FN_PORT = 54399
const FN_PORT_NOKEY = 54398
const MOCK_PORT = 54397
const DUMMY_KEY = 'TESTKEY-leak-canary-9f3a'

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`)
}

// ---------- mock Google Books ----------
const mockRequests = []
const volume = (id, info) => ({ id, volumeInfo: info })
const mock = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://mock')
  mockRequests.push({ path: url.pathname, params: url.searchParams, headers: req.headers, rawUrl: req.url })
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
    res.end(typeof body === 'string' ? body : JSON.stringify(body))
  }
  const q = url.searchParams.get('q') ?? ''
  const id = url.pathname.split('/').pop()
  const trigger = url.pathname === '/volumes' ? q : id
  if (trigger.includes('mock429') || id === 'ratelimit00') return send(429, { error: {} }, { 'Retry-After': '7' })
  if (trigger.includes('mockquota') || id === 'quota00000')
    return send(403, { error: { errors: [{ reason: 'rateLimitExceeded' }] } })
  if (trigger.includes('mock403key')) return send(403, { error: { errors: [{ reason: 'forbidden' }] } })
  if (trigger.includes('mock500') || id === 'server5xx0') return send(500, { error: {} })
  if (trigger.includes('mocknonjson') || id === 'notjson000') return send(200, '<html>nope</html>')
  if (trigger.includes('mockdrop') || id === 'dropconn00') return req.socket.destroy()
  if (trigger.includes('mockslow') || id === 'slowslow00') return setTimeout(() => send(200, {}), 3000)
  if (id === 'notfound00') return send(404, { error: {} })
  if (id === 'volumeOK000') {
    return send(
      200,
      volume('volumeOK000', {
        title: 'Full Book',
        subtitle: 'A Subtitle',
        authors: ['Ada L'],
        description: '<p>Long <b>text</b> &amp; more</p>',
        publisher: 'Pub',
        publishedDate: '2020',
        pageCount: 321,
        categories: ['Computers'],
        language: 'en',
        averageRating: 4.5,
        ratingsCount: 12,
        industryIdentifiers: [{ identifier: 'x' }],
        imageLinks: { thumbnail: 'http://books.google.com/x?id=1&zoom=1&edge=curl' },
      }),
    )
  }
  if (url.pathname.startsWith('/volumes/')) return send(404, { error: {} })
  // list
  const start = Number(url.searchParams.get('startIndex'))
  const empty = q.includes('mockempty')
  return send(200, {
    kind: 'books#volumes',
    totalItems: empty ? 0 : 100,
    items: empty
      ? undefined
      : [
          {
            ...volume('aaaaaa111', {
              title: 'With Cover',
              authors: ['A One', 'A Two'],
              description: `<p>${'x'.repeat(400)}</p>`,
              imageLinks: { thumbnail: 'http://books.google.com/a?id=1&zoom=1&edge=curl' },
            }),
            etag: 'e1',
            selfLink: 'https://x',
          },
          volume('bbbbbb222', { title: 'Bare' }),
          volume('aaaaaa111', { title: 'Duplicate' }),
          { volumeInfo: { title: 'No id' } },
        ],
    start,
  })
})

// ---------- spawn the function with deno ----------
const procs = []
const logs = { out: '' }
function startFn(port, { key }) {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    PORT: String(port),
    GOOGLE_BOOKS_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
    BOOKS_TIMEOUT_MS: '1000',
  }
  if (key) env.GOOGLE_BOOKS_API_KEY = key
  const p = spawn('deno', ['run', '--no-config', '--allow-net', '--allow-env', FN_PATH], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  p.stdout.on('data', (d) => (logs.out += d))
  p.stderr.on('data', (d) => (logs.out += d))
  procs.push(p)
  return p
}
async function waitUp(port) {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}`, { method: 'OPTIONS' })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  throw new Error(`function did not start on ${port}`)
}

const responses = [] // every response, scanned for the key at the end
async function call(port, body, { method = 'POST', raw, headers = {} } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: method === 'GET' ? undefined : (raw ?? JSON.stringify(body)),
  })
  const text = await res.text()
  responses.push(text + JSON.stringify([...res.headers]))
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    /* empty body */
  }
  return { status: res.status, data, headers: res.headers, text }
}

const U = (b) => call(FN_PORT, b)
function expectErr(name, res, status, code) {
  check(
    name,
    res.status === status && res.data?.error?.code === code && res.headers.get('access-control-allow-origin') === '*',
    `got ${res.status} ${JSON.stringify(res.data)}`,
  )
}
const lastReq = () => mockRequests[mockRequests.length - 1]

async function main() {
  await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r))
  startFn(FN_PORT, { key: DUMMY_KEY })
  startFn(FN_PORT_NOKEY, { key: null })
  await Promise.all([waitUp(FN_PORT), waitUp(FN_PORT_NOKEY)])

  // CORS / method / body
  const pre = await call(FN_PORT, null, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } })
  check(
    'OPTIONS preflight -> 204 + CORS headers',
    pre.status === 204 &&
      pre.headers.get('access-control-allow-origin') === '*' &&
      /content-type/.test(pre.headers.get('access-control-allow-headers') ?? '') &&
      /POST/.test(pre.headers.get('access-control-allow-methods') ?? ''),
    `${pre.status}`,
  )
  expectErr('GET -> 405', await call(FN_PORT, null, { method: 'GET' }), 405, 'method_not_allowed')
  expectErr('invalid JSON -> 400', await call(FN_PORT, null, { raw: '{nope' }), 400, 'invalid_request')
  expectErr('JSON array body -> 400', await call(FN_PORT, null, { raw: '[]' }), 400, 'invalid_request')
  expectErr('3 KB body -> 413', await U({ type: 'search', query: 'a', pad: 'x'.repeat(3000) }), 413, 'payload_too_large')
  expectErr('missing type -> 400', await U({}), 400, 'invalid_request')
  expectErr('unknown type -> 400', await U({ type: 'author' }), 400, 'invalid_request')

  // search query
  for (const [name, query] of [
    ['missing', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['101 chars', 'a'.repeat(101)],
    ['only : and "', ':":"'],
    ['control char', 'abc\u0007def'],
    ['number', 42],
  ]) {
    expectErr(`search query ${name} -> 400`, await U({ type: 'search', query }), 400, 'invalid_request')
  }
  let r = await U({ type: 'search', query: 'a'.repeat(100) })
  check('search query 100 chars -> 200', r.status === 200, `${r.status}`)
  r = await U({ type: 'search', query: 'x inauthor:foo "bar"' })
  check(
    'operator injection stripped (q = x inauthor foo bar, no operators)',
    r.status === 200 && lastReq().params.get('q') === 'x inauthor foo bar',
    lastReq().params.get('q'),
  )

  // genre
  for (const genre of ['horror', 'Romance', '', 7, undefined, '__proto__', 'toString']) {
    expectErr(`bad genre ${JSON.stringify(genre)} -> 400`, await U({ type: 'genre', genre }), 400, 'invalid_request')
  }
  const expected = {
    Adventure: 'adventure',
    Technology: 'technology',
    Horror: 'horror',
    'Sci-Fi': 'science fiction',
    Fiction: 'fiction',
    'Non-Fiction': 'nonfiction',
  }
  for (const [genre, q] of Object.entries(expected)) {
    r = await U({ type: 'genre', genre })
    check(`genre ${genre} -> 200, q=${q}`, r.status === 200 && lastReq().params.get('q') === q, lastReq().params.get('q'))
  }
  r = await U({ type: 'home' })
  check('home -> q=technology', r.status === 200 && lastReq().params.get('q') === 'technology')

  // page / pageSize
  for (const page of [-1, 25, 1.5, '2', null]) {
    expectErr(`bad page ${JSON.stringify(page)} -> 400`, await U({ type: 'home', page }), 400, 'invalid_request')
  }
  for (const page of [0, 24]) {
    r = await U({ type: 'home', page })
    check(`page ${page} -> 200`, r.status === 200, `${r.status}`)
  }
  r = await U({ type: 'home', page: 3, pageSize: 10 })
  check(
    'startIndex = page*pageSize, maxResults = pageSize',
    lastReq().params.get('startIndex') === '30' && lastReq().params.get('maxResults') === '10',
  )
  r = await U({ type: 'home' })
  check('default maxResults = 20', lastReq().params.get('maxResults') === '20')
  for (const pageSize of [0, 41, 1.5, '10']) {
    expectErr(`bad pageSize ${JSON.stringify(pageSize)} -> 400`, await U({ type: 'home', pageSize }), 400, 'invalid_request')
  }
  r = await U({ type: 'home', pageSize: 40 })
  check('pageSize 40 -> 200', r.status === 200)

  // details id
  for (const id of ['a/b/cdef', '../x1234', 'abc', 'a'.repeat(33), 'a?b12345', '%2e%2e%2e', undefined, 12345678]) {
    expectErr(`bad id ${JSON.stringify(id)} -> 400`, await U({ type: 'details', id }), 400, 'invalid_request')
  }

  // happy paths + shaping
  r = await U({ type: 'home' })
  const items = r.data?.items ?? []
  check('list: envelope keys', ['items', 'page', 'pageSize', 'totalItems', 'hasMore'].every((k) => k in (r.data ?? {})))
  check('list: duplicate + id-less volumes dropped', items.length === 2, `${items.length}`)
  check(
    'list: cover is https, edge=curl removed',
    items[0]?.cover === 'https://books.google.com/a?id=1&zoom=1',
    items[0]?.cover,
  )
  check('list: missing cover -> null', items[1]?.cover === null)
  check('list: missing description -> default', items[1]?.description === 'No description available.')
  check('list: missing authors -> []', Array.isArray(items[1]?.authors) && items[1].authors.length === 0)
  check('list: long description truncated, HTML stripped', items[0]?.description.length <= 301 && !/</.test(items[0].description))
  check('list: only UI fields on each book', Object.keys(items[0] ?? {}).sort().join() === 'authors,cover,description,id,title')
  check('list: hasMore true mid-results', r.data?.hasMore === true)
  check('list: no raw google fields', !/volumeInfo|etag|selfLink|kind/.test(r.text))
  r = await U({ type: 'home', page: 24 })
  check('list: hasMore false at max page', r.data?.hasMore === false)
  r = await U({ type: 'search', query: 'with COVER' })
  check(
    'search: keeps only titles containing the text (case-insensitive)',
    r.status === 200 && r.data?.items?.length === 1 && r.data.items[0].title === 'With Cover',
    JSON.stringify(r.data?.items?.map((i) => i.title)),
  )
  r = await U({ type: 'search', query: 'zzz no title match' })
  check('search: no title match -> items []', r.status === 200 && r.data?.items?.length === 0)
  r = await U({ type: 'search', query: 'mockempty' })
  check('list: empty result -> items [] and hasMore false', r.status === 200 && r.data?.items?.length === 0 && r.data?.hasMore === false)

  r = await U({ type: 'details', id: 'volumeOK000' })
  const d = r.data ?? {}
  check(
    'details: shaped fields',
    d.title === 'Full Book' && d.subtitle === 'A Subtitle' && d.publisher === 'Pub' && d.pageCount === 321 && d.language === 'en' && d.averageRating === 4.5 && d.categories?.[0] === 'Computers',
    JSON.stringify(d),
  )
  check('details: description cleaned', d.description === 'Long text & more', d.description)
  check('details: https cover with zoom=2', d.cover === 'https://books.google.com/x?id=1&zoom=2', d.cover)
  check('details: no raw google fields', !/volumeInfo|industryIdentifiers/.test(r.text))

  // key handling toward upstream
  check('key sent in x-goog-api-key header', mockRequests.every((m) => m.headers['x-goog-api-key'] === DUMMY_KEY))
  check('key never in upstream URL', mockRequests.every((m) => !m.rawUrl.includes(DUMMY_KEY)))

  // upstream failures
  r = await U({ type: 'details', id: 'notfound00' })
  expectErr('details Google 404 -> 404', r, 404, 'not_found')
  r = await U({ type: 'details', id: 'ratelimit00' })
  expectErr('Google 429 -> 429', r, 429, 'rate_limited')
  check('429: Retry-After passed through', r.headers.get('retry-after') === '7', r.headers.get('retry-after'))
  expectErr('list Google 429 -> 429', await U({ type: 'search', query: 'mock429' }), 429, 'rate_limited')
  expectErr('Google 403 quota -> 429', await U({ type: 'details', id: 'quota00000' }), 429, 'rate_limited')
  expectErr('Google 403 other -> 502', await U({ type: 'search', query: 'mock403key' }), 502, 'upstream_error')
  expectErr('Google 500 (details) -> 502', await U({ type: 'details', id: 'server5xx0' }), 502, 'upstream_error')
  expectErr('Google 500 (list) -> 502', await U({ type: 'search', query: 'mock500' }), 502, 'upstream_error')
  expectErr('non-JSON upstream -> 502', await U({ type: 'search', query: 'mocknonjson' }), 502, 'upstream_error')
  expectErr('dropped connection -> 502', await U({ type: 'search', query: 'mockdrop' }), 502, 'upstream_error')
  const t0 = Date.now()
  r = await U({ type: 'search', query: 'mockslow' })
  expectErr('slow upstream -> 504', r, 504, 'upstream_timeout')
  check('timeout fired near 1 s, not after mock delay', Date.now() - t0 < 2500, `${Date.now() - t0} ms`)

  // missing secret
  r = await call(FN_PORT_NOKEY, { type: 'home' })
  check('missing key -> 500 server_error', r.status === 500 && r.data?.error?.code === 'server_error', `${r.status}`)
  r = await call(FN_PORT_NOKEY, { type: 'home', page: 99 })
  check('validation still runs before secret check -> 400', r.status === 400, `${r.status}`)

  // leak scan
  await new Promise((r2) => setTimeout(r2, 200))
  check('key not in any response body/header', responses.every((t) => !t.includes(DUMMY_KEY)))
  check('key not in function stdout/stderr', !logs.out.includes(DUMMY_KEY), 'found in logs')
  check('function logged something useful (sanity)', /upstream status|not set/.test(logs.out))
}

try {
  await main()
} catch (err) {
  failed++
  console.error('FATAL', err.message)
} finally {
  procs.forEach((p) => p.kill())
  mock.close()
  mock.closeAllConnections?.()
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
