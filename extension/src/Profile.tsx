import { useState } from 'react'
import type { FormEvent } from 'react'
import { accountRequest, parseProgress } from './account'
import type { Account, SavedProgress } from './account'

type Props = { account: Account | null; syncStatus: string; onAuthenticated: (account: Account, progress: SavedProgress | null) => void; onSave: () => Promise<void>; onSignOut: () => Promise<void> }
export default function Profile({ account, syncStatus, onAuthenticated, onSave, onSignOut }: Props) {
  const [create, setCreate] = useState(false)
  const [reauth, setReauth] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const data = await accountRequest(create ? 'register' : 'login', { email: email.trim(), password, ...(create ? { name: name.trim() } : {}) })
      const progress = data.progress ? parseProgress(data.progress) : null
      onAuthenticated({ token: data.token, user: data.user }, reauth && account?.user.id === data.user.id ? null : progress); setReauth(false); setPassword('')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not sign in. Start the backend and try again.') }
    finally { setBusy(false) }
  }
  async function action(callback: () => Promise<void>) { setBusy(true); setError(''); try { await callback() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save. Try again.') } finally { setBusy(false) } }
  return <section className="profile-panel" aria-labelledby="profile-title"><h2 id="profile-title">{account && !reauth ? 'Profile' : create ? 'Create account' : 'Sign in'}</h2>
    {account && !reauth ? <><div className="profile-identity"><span className="profile-avatar" aria-hidden="true">{account.user.name.slice(0,1).toUpperCase()}</span><div><strong>{account.user.name}</strong><p>{account.user.email}</p></div></div><p className="profile-sync" role="status">{syncStatus}</p><p className="muted">Your notes, quiz answers, settings and activity history are saved to this Recall backend. Chat and running timers are not saved.</p><button className="primary" disabled={busy} onClick={() => void action(onSave)}>{busy ? 'Working' : 'Save progress now'}</button><button className="secondary" disabled={busy} onClick={() => void action(onSignOut)}>Save and sign out</button><button className="text-button" disabled={busy} onClick={() => { setReauth(true); setCreate(false); setEmail(account.user.email); setError('') }}>Sign in again</button><p className="muted">Accounts are stored on your local backend. Use the same server to restore progress; this is not a hosted cloud account.</p></> : <><form className="profile-form" onSubmit={e => void submit(e)}>
      {create && <label>Name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required maxLength={80} disabled={busy} /></label>}
      <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required maxLength={254} disabled={busy} /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={create ? 'new-password' : 'current-password'} required minLength={create ? 10 : 1} maxLength={128} disabled={busy} /></label>
      {create && <p className="muted">At least 10 characters. New accounts save this workspace; existing accounts restore their saved workspace.</p>}<button className="primary" disabled={busy}>{busy ? 'Please wait' : create ? 'Create account' : 'Sign in'}</button></form><button className="text-button" disabled={busy} onClick={() => { setCreate(!create); setError('') }}>{create ? 'Already have an account? Sign in' : 'New to Recall? Create an account'}</button><p className="muted">Start the Java backend to use accounts. Guest study is still available without signing in.</p></>}
    {error && <p className="error" role="alert">{error}</p>}</section>
}
