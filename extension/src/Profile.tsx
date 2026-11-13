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
      // Closing the window just cancels; there is nothing to report.
      if (!data) return
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
      <button type="button" className="secondary google-button" disabled={busy} onClick={() => void withGoogle()}><span className="google-mark" aria-hidden="true"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg></span>Continue with Google</button>
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
