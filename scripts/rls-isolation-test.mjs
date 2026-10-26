// RLS isolation test: proves user B (and anon) cannot read or change user A's private data.
// Run: npm run test:rls   (node --env-file=.env scripts/rls-isolation-test.mjs)
import { createClient } from '@supabase/supabase-js'

const REQUIRED = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'TEST_USER_A_EMAIL',
  'TEST_USER_A_PASSWORD',
  'TEST_USER_B_EMAIL',
  'TEST_USER_B_PASSWORD',
]
const missing = REQUIRED.filter((name) => !process.env[name])
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(', ')}`)
  process.exit(1)
}

const env = process.env
const newClient = () =>
  createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

const clientA = newClient()
const clientB = newClient()
const anon = newClient()

const volumeId = `rls-test-${Date.now()}`
let passed = 0
let failed = 0

const report = (name, ok, detail = '') => {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`)
}

const check = async (name, fn) => {
  try {
    const result = await fn()
    report(name, result.ok, result.detail)
  } catch (err) {
    report(name, false, `threw: ${err.message}`)
  }
}

const errInfo = (error) => (error ? `error ${error.code ?? 'unknown'}` : 'no error')

async function signIn(client, email, password, label) {
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`login failed for user ${label}`)
  return data.user
}

async function main() {
  let userA, userB
  try {
    userA = await signIn(clientA, env.TEST_USER_A_EMAIL, env.TEST_USER_A_PASSWORD, 'A')
    userB = await signIn(clientB, env.TEST_USER_B_EMAIL, env.TEST_USER_B_PASSWORD, 'B')
  } catch (err) {
    report('Setup: A and B can log in', false, err.message)
    return
  }
  report('Setup: A and B can log in', true)
  if (userA.id === userB.id) {
    report('Setup: A and B are different users', false)
    return
  }
  report('Setup: A and B are different users', true)

  let item, log

  await check('A adds a book to their library', async () => {
    const { data, error } = await clientA
      .from('library_items')
      .insert({ user_id: userA.id, volume_id: volumeId })
      .select()
      .single()
    item = data
    return { ok: !error && !!data, detail: errInfo(error) }
  })
  if (!item) return

  await check('A writes a log for that book', async () => {
    const { data, error } = await clientA
      .from('logs')
      .insert({ user_id: userA.id, volume_id: volumeId, body: 'rls test log', rating: 4 })
      .select()
      .single()
    log = data
    return { ok: !error && !!data, detail: errInfo(error) }
  })
  if (!log) return

  await check("A can't change created_at on A's own log", async () => {
    const { error } = await clientA
      .from('logs')
      .update({ created_at: '2000-01-01T00:00:00Z' })
      .eq('id', log.id)
    return { ok: !!error, detail: errInfo(error) }
  })

  await check("B can't see A's library", async () => {
    const { data, error } = await clientB
      .from('library_items')
      .select()
      .or(`id.eq.${item.id},user_id.eq.${userA.id}`)
    return { ok: !error && data.length === 0, detail: `${data?.length ?? 0} rows, ${errInfo(error)}` }
  })

  await check("B can't update A's library item", async () => {
    const { data, error } = await clientB
      .from('library_items')
      .update({ status: 'finished' })
      .eq('id', item.id)
      .select()
    const { data: after } = await clientA.from('library_items').select('status').eq('id', item.id).single()
    return {
      ok: !error && data.length === 0 && after?.status === item.status,
      detail: `${data?.length ?? 0} rows updated, ${errInfo(error)}`,
    }
  })

  await check("B can't delete A's library item", async () => {
    const { data, error } = await clientB.from('library_items').delete().eq('id', item.id).select()
    const { data: after } = await clientA.from('library_items').select('id').eq('id', item.id)
    return {
      ok: !error && data.length === 0 && after?.length === 1,
      detail: `${data?.length ?? 0} rows deleted, ${errInfo(error)}`,
    }
  })

  await check("B can't write a log using A's user ID", async () => {
    const { data, error } = await clientB
      .from('logs')
      .insert({ user_id: userA.id, volume_id: volumeId, body: 'forged by B' })
      .select()
    const { data: forged } = await clientA.from('logs').select('id').eq('body', 'forged by B')
    return { ok: !!error && !data?.length && forged?.length === 0, detail: errInfo(error) }
  })

  await check("B can't log a book that isn't in B's library (FK)", async () => {
    const { data, error } = await clientB
      .from('logs')
      .insert({ user_id: userB.id, volume_id: volumeId, body: 'not in my library' })
      .select()
    return { ok: error?.code === '23503' && !data?.length, detail: errInfo(error) }
  })

  await check("Anonymous visitor can read A's log", async () => {
    const { data, error } = await anon.from('logs').select('id, user_id').eq('id', log.id)
    return { ok: !error && data.length === 1, detail: `${data?.length ?? 0} rows, ${errInfo(error)}` }
  })

  await check("Anonymous visitor can't read A's library", async () => {
    const { data, error } = await anon.from('library_items').select().eq('id', item.id)
    return {
      ok: !!error || data.length === 0,
      detail: error ? `denied, ${errInfo(error)}` : `${data.length} rows`,
    }
  })

  await check("Removing the book cascades to A's log", async () => {
    const { error: delError } = await clientA.from('library_items').delete().eq('id', item.id)
    const { data, error } = await anon.from('logs').select('id').eq('id', log.id)
    return {
      ok: !delError && !error && data.length === 0,
      detail: `${data?.length ?? 0} logs left, ${errInfo(delError ?? error)}`,
    }
  })
}

async function cleanup() {
  let ok = true
  for (const client of [clientA, clientB]) {
    const { data } = await client.auth.getUser()
    if (!data?.user) continue
    const logs = await client.from('logs').delete().eq('volume_id', volumeId)
    const items = await client.from('library_items').delete().eq('volume_id', volumeId)
    if (logs.error || items.error) ok = false
    await client.auth.signOut()
  }
  report('Cleanup: test rows removed, sessions signed out', ok)
}

try {
  await main()
} finally {
  await cleanup().catch((err) => report('Cleanup', false, `threw: ${err.message}`))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exitCode = failed ? 1 : 0
}
