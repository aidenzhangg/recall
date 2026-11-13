import { useState } from 'react'
import type { FormEvent } from 'react'
import { accountRequest, googleSignIn, parseProgress } from './account'
import type { Account, SavedProgress } from './account'
import Logo from './Logo'

type Props = { required?: boolean; account: Account | null; syncStatus: string; onAuthenticated: (account: Account, progress: SavedProgress | null) => void; onSave: () => Promise<void>; onSignOut: () => Promise<void> }
export default function Profile({ required = false, account, syncStatus, onAuthenticated, onSave, onSignOut }: Props) {
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
  async function withGoogle() {
    setBusy(true); setError('')
    try {
      const data = await googleSignIn()
      onAuthenticated({ token: data.token, user: data.user }, reauth && account?.user.id === data.user.id ? null : data.progress ? parseProgress(data.progress) : null); setReauth(false); setPassword('')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Google sign-in failed. Try again.') }
    finally { setBusy(false) }
  }
  async function action(callback: () => Promise<void>) { setBusy(true); setError(''); try { await callback() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save. Try again.') } finally { setBusy(false) } }
  const signedIn = account && !reauth
  return <section className="auth" aria-labelledby="profile-title">
    {signedIn ? <div className="auth-card">
      <span className="profile-avatar" aria-hidden="true">{account.user.name.slice(0, 1).toUpperCase()}</span>
      <div className="auth-heading"><h2 id="profile-title">{account.user.name}</h2><p>{account.user.email}</p></div>
      <p className="profile-sync" role="status">{syncStatus}</p>
      <button className="primary" disabled={busy} onClick={() => void action(onSave)}>{busy ? 'Working...' : 'Save now'}</button>
      <button className="secondary" disabled={busy} onClick={() => void action(onSignOut)}>Sign out</button>
      {error && <p className="error" role="alert">{error}</p>}
    </div> : <div className="auth-card">
      <Logo className="brand-mark auth-mark" />
      <div className="auth-heading"><h2 id="profile-title">{create ? 'Create your account' : 'Welcome back'}</h2><p>{create ? 'Keep your notes and progress on every computer.' : required ? 'Sign in to open your notes and progress.' : 'Sign in to sync your notes and progress.'}</p></div>
      <button type="button" className="secondary google-button" disabled={busy} onClick={() => void withGoogle()}><span className="google-mark" aria-hidden="true">G</span>Continue with Google</button>
      <div className="auth-divider" role="separator"><span>or</span></div>
      <form className="profile-form" onSubmit={e => void submit(e)}>
        {create && <label>Name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required maxLength={80} disabled={busy} /></label>}
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required maxLength={254} disabled={busy} /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={create ? 'new-password' : 'current-password'} required minLength={create ? 10 : 1} maxLength={128} disabled={busy} placeholder={create ? 'At least 10 characters' : ''} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Please wait...' : create ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="auth-switch">{create ? 'Already have an account?' : 'New to Recall?'} <button type="button" className="text-button" disabled={busy} onClick={() => { setCreate(!create); setError('') }}>{create ? 'Sign in' : 'Create an account'}</button></p>
      <p className="muted">{required ? 'Your notes and progress are saved to your account, not this device.' : 'Without an account nothing is saved: your work is gone when you close Recall.'}</p>
    </div>}
  </section>
}
