// Accounts and saved progress on Supabase, called straight from the extension with fetch. No Recall server is involved.
// The project URL and the anon ("publishable") key are public by design: Supabase's row-level security, set up by
// supabase/schema.sql, is what keeps each person's row private. Never put the service_role key here.
export type CloudConfig = { url: string; key: string }
export type CloudUser = { id: string; name: string; email: string }
export type CloudResult = { token: string; user: CloudUser; progress?: string | null }
type Session = { access: string; refresh: string; expiresAt: number; user: CloudUser }
/** A signed-in session that has only proved the person can read the account's email. It is kept in memory, never stored, until a new password is set. */
export type Recovery = Session
type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const SESSION = 'recall-account-session'

export function cloudConfig(): CloudConfig | null {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env
  const url = env?.VITE_SUPABASE_URL?.trim().replace(/\/+$/, ''); const key = env?.VITE_SUPABASE_ANON_KEY?.trim()
  return url && key && /^https:\/\//.test(url) ? { url, key } : null
}
function userOf(raw: { id?: unknown; email?: unknown; user_metadata?: Record<string, unknown> } | undefined): CloudUser {
  const email = typeof raw?.email === 'string' ? raw.email : ''
  const meta = raw?.user_metadata ?? {}
  const name = [meta.name, meta.full_name].find(value => typeof value === 'string' && value.trim()) as string | undefined
  return { id: String(raw?.id ?? ''), email, name: (name ?? email.split('@')[0] ?? 'Student').trim().slice(0, 80) || 'Student' }
}
/** The code from a password-reset email, with spaces and dashes removed, or null if it is not 6 to 10 digits. */
export function recoveryCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '')
  return /^\d{6,10}$/.test(code) ? code : null
}
type CloudError = Error & { status?: number; code?: string }
function explain(status: number, data: { error_code?: string; msg?: string; message?: string; error_description?: string; code?: string }): string {
  const code = data.error_code ?? data.code ?? ''
  const text = data.msg ?? data.error_description ?? data.message ?? ''
  if (code === 'invalid_credentials' || /invalid login/i.test(text)) return 'Wrong email or password.'
  if (code === 'email_not_confirmed') return 'Confirm your email first: open the link Supabase sent you, then sign in.'
  if (code === 'user_already_exists' || /already registered/i.test(text)) return 'An account already exists for this email. Sign in instead.'
  if (code === 'weak_password') return 'Choose a longer password, at least 10 characters.'
  if (code === 'otp_expired' || /token has expired or is invalid/i.test(text)) return 'That code is wrong or has expired. Check the newest email, or send a new code.'
  if (code === 'same_password') return 'Choose a password that is different from your old one.'
  if (code === 'PGRST205' || code === '42P01' || /could not find the table|does not exist/i.test(text)) return 'The progress table is missing. Run supabase/schema.sql in your Supabase project (SQL Editor).'
  if (status === 429) return 'Too many attempts. Wait a few minutes and try again.'
  if (status === 401 || status === 403) return 'Please sign in again.'
  return text ? text.slice(0, 200) : 'The account service returned an error. Try again.'
}

export function createCloud(config: CloudConfig, store: Store = localStorage, now: () => number = Date.now) {
  const read = (): Session | null => { try { const value = JSON.parse(store.getItem(SESSION) ?? 'null'); return value?.access && value?.refresh ? value : null } catch { return null } }
  const write = (session: Session | null) => { try { if (session) store.setItem(SESSION, JSON.stringify(session)); else store.removeItem(SESSION) } catch { /* Signed in for this session only. */ } }
  async function call(path: string, init: { method?: string; body?: unknown; token?: string; prefer?: string; signal?: AbortSignal } = {}) {
    let response: Response
    try {
      response = await fetch(`${config.url}${path}`, { method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
        headers: { apikey: config.key, Authorization: `Bearer ${init.token ?? config.key}`, ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(init.prefer ? { Prefer: init.prefer } : {}) },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }), signal: init.signal ?? AbortSignal.timeout(15000) })
    } catch (failure) {
      if (init.signal?.aborted) throw failure
      throw new Error('Cannot reach the account service. Check your internet connection.', { cause: failure })
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw Object.assign(new Error(explain(response.status, data)), { status: response.status, code: data.error_code ?? data.code ?? '' }) as CloudError
    return data
  }
  function open(data: { access_token?: string; refresh_token?: string; expires_in?: number; user?: object }, user?: CloudUser): Session {
    if (!data.access_token || !data.refresh_token) throw new Error('The account service did not return a session. Try again.')
    const session = { access: data.access_token, refresh: data.refresh_token, expiresAt: now() + (data.expires_in ?? 3600) * 1000, user: user ?? userOf(data.user) }
    write(session); return session
  }
  /** A valid access token, refreshed when it is about to expire. */
  async function fresh(): Promise<Session> {
    const session = read()
    if (!session) throw new Error('Please sign in again.')
    if (session.expiresAt - now() > 60000) return session
    try { return open(await call('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: session.refresh } }), session.user) }
    catch (failure) { write(null); throw failure }
  }
  async function progress(session: Session): Promise<string | null> {
    const rows = await call('/rest/v1/progress?select=data&limit=1', { token: session.access })
    return Array.isArray(rows) && rows[0]?.data ? JSON.stringify(rows[0].data) : null
  }
  const result = async (session: Session): Promise<CloudResult> => ({ token: session.access, user: session.user, progress: await progress(session) })
  return {
    signedIn: () => !!read(),
    async register(email: string, password: string, name: string): Promise<CloudResult> {
      const data = await call('/auth/v1/signup', { body: { email, password, data: { name } } })
      // With email confirmation on, Supabase creates the user but gives no session until the link is opened.
      if (!data.access_token) throw new Error('Account created. Open the confirmation link in your email, then sign in.')
      return result(open(data))
    },
    async login(email: string, password: string): Promise<CloudResult> {
      return result(open(await call('/auth/v1/token?grant_type=password', { body: { email, password } })))
    },
    /** Finishes a Google sign-in from the tokens Supabase put in the redirect address. */
    async adopt(hash: string): Promise<CloudResult> {
      const params = new URLSearchParams(hash.replace(/^#/, ''))
      const access = params.get('access_token'); const refresh = params.get('refresh_token')
      if (!access || !refresh) throw new Error(params.get('error_description') ?? 'Google did not return a sign-in. Try again.')
      const user = userOf(await call('/auth/v1/user', { token: access }))
      return result(open({ access_token: access, refresh_token: refresh, expires_in: Number(params.get('expires_in')) || 3600 }, user))
    },
    /**
     * Asks Supabase to email a password-reset code. It resolves the same way whether or not the email has an account, so
     * the screen never reveals who is registered. Supabase answers 429 when that address was sent a code in the last minute
     * (it only says so for real accounts), so a 429 is treated like success too.
     */
    async requestReset(email: string): Promise<void> {
      try { await call('/auth/v1/recover', { body: { email } }) }
      catch (failure) { if ((failure as CloudError).status !== 429) throw failure }
    },
    /** Checks the emailed code. The returned recovery session is not saved: closing Recall before a new password is set signs nobody in. */
    async verifyReset(email: string, code: string): Promise<Recovery> {
      const token = recoveryCode(code)
      if (!token) throw new Error('Enter the code from the email: 6 to 10 digits.')
      const data = await call('/auth/v1/verify', { body: { type: 'recovery', email, token } })
      if (!data.access_token || !data.refresh_token) throw new Error('The account service did not return a session. Try again.')
      return { access: data.access_token, refresh: data.refresh_token, expiresAt: now() + (data.expires_in ?? 3600) * 1000, user: userOf(data.user) }
    },
    /** Sets the new password with the recovery session, then signs the person in. */
    async finishReset(recovery: Recovery, password: string): Promise<CloudResult> {
      if (password.length < 10) throw new Error('Choose a longer password, at least 10 characters.')
      if (recovery.expiresAt <= now()) throw new Error('This reset has expired. Send a new code and try again.')
      let updated
      try { updated = await call('/auth/v1/user', { method: 'PUT', token: recovery.access, body: { password } }) }
      catch (failure) {
        const status = (failure as CloudError).status
        if (status === 401 || status === 403) throw new Error('This reset has expired. Send a new code and try again.', { cause: failure })
        throw failure
      }
      const session = { ...recovery, user: updated?.id ? userOf(updated) : recovery.user }
      write(session)
      return result(session)
    },
    googleUrl: (redirect: string) => `${config.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`,
    async me(): Promise<CloudResult> { return result(await fresh()) },
    /** A current access token for the signed-in person, refreshed if needed. */
    async accessToken(): Promise<string> { return (await fresh()).access },
    url: config.url,
    async save(progressJson: string, signal?: AbortSignal) {
      const session = await fresh()
      await call('/rest/v1/progress?on_conflict=user_id', { token: session.access, prefer: 'resolution=merge-duplicates,return=minimal', signal,
        body: { user_id: session.user.id, data: JSON.parse(progressJson), updated_at: new Date(now()).toISOString() } })
      return {}
    },
    async logout() {
      const session = read(); write(null)
      if (session) await call('/auth/v1/logout', { method: 'POST', token: session.access }).catch(() => {})
      return {}
    },
  }
}
