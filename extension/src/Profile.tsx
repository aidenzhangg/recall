import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { PASSWORD_RESET, RESET_SENT, accountRequest, finishPasswordReset, googleSignIn, parseProgress, requestPasswordReset, verifyResetCode } from './account'
import type { Account, Recovery, SavedProgress, UserProfile } from './account'
import ProfileCard from './ProfileCard'
import type { ProfileStats } from './ProfileCard'
import Logo from './Logo'

/** Forgot password: ask for the email, then the emailed code, then a new password. */
type Reset = { step: 'email' } | { step: 'code' } | { step: 'password'; recovery: Recovery }
const RESEND_WAIT = 60000
type Props = { required?: boolean; account: Account | null; syncStatus: string; onAuthenticated: (account: Account, progress: SavedProgress | null) => void; onSave: () => Promise<void>; onSignOut: () => Promise<void>; profile: UserProfile; onProfile: (profile: UserProfile) => void; stats: ProfileStats; onGuest?: () => void }
export default function Profile({ required = false, account, syncStatus, onAuthenticated, onSave, onSignOut, profile, onProfile, stats, onGuest }: Props) {
  const [create, setCreate] = useState(false)
  const [reauth, setReauth] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reset, setReset] = useState<Reset | null>(null)
  const [code, setCode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [resendReady, setResendReady] = useState(true)
  useEffect(() => { if (resendReady) return; const timer = setTimeout(() => setResendReady(true), RESEND_WAIT); return () => clearTimeout(timer) }, [resendReady])
  function startReset() { setReset({ step: 'email' }); setError(''); setPassword(''); setCode(''); setConfirm('') }
  function leaveReset() { setReset(null); setError(''); setPassword(''); setCode(''); setConfirm('') }
  async function sendCode(event?: FormEvent) {
    event?.preventDefault(); setBusy(true); setError('')
    try { await requestPasswordReset(email.trim()); setReset({ step: 'code' }); setCode(''); setResendReady(false) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not send the code. Try again.') }
    finally { setBusy(false) }
  }
  async function checkCode(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { const recovery = await verifyResetCode(email.trim(), code); setReset({ step: 'password', recovery }); setPassword(''); setConfirm('') }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not check the code. Try again.') }
    finally { setBusy(false) }
  }
  async function savePassword(event: FormEvent) {
    event.preventDefault()
    if (reset?.step !== 'password') return
    if (password !== confirm) { setError('The two passwords do not match.'); return }
    setBusy(true); setError('')
    try {
      const data = await finishPasswordReset(reset.recovery, password)
      onAuthenticated({ token: data.token, user: data.user }, reauth && account?.user.id === data.user.id ? null : data.progress ? parseProgress(data.progress) : null)
      setReauth(false); leaveReset()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save the new password. Try again.') }
    finally { setBusy(false) }
  }
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
  return <section className={signedIn ? 'auth auth--profile' : 'auth'} aria-labelledby="profile-title">
    {signedIn ? <ProfileCard account={account} profile={profile} stats={stats} syncStatus={syncStatus} busy={busy} onProfile={onProfile} onSave={() => void action(onSave)} onSignOut={() => void action(onSignOut)} />
    : reset ? <div className="auth-card">
      <Logo className="brand-mark auth-mark" />
      <div className="auth-heading"><h2 id="profile-title">{reset.step === 'email' ? 'Reset your password' : reset.step === 'code' ? 'Check your email' : 'Choose a new password'}</h2>
        <p>{reset.step === 'email' ? "Enter your account's email and we'll send you a code." : reset.step === 'code' ? `Enter the code sent to ${email.trim()}.` : `For ${reset.recovery.user.email || email.trim()}. You'll be signed in when it's saved.`}</p></div>
      {reset.step === 'email' && <form className="profile-form" onSubmit={e => void sendCode(e)}>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required maxLength={254} disabled={busy} autoFocus /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Please wait...' : 'Send code'}</button>
      </form>}
      {reset.step === 'code' && <form className="profile-form" onSubmit={e => void checkCode(e)}>
        <p className="reset-notice" role="status">{RESET_SENT}</p>
        <label>Code<input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" required maxLength={14} disabled={busy} autoFocus placeholder="Code from the email" /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Please wait...' : 'Continue'}</button>
        <p className="auth-switch">Nothing yet? <button type="button" className="text-button" disabled={busy || !resendReady} onClick={() => void sendCode()}>{resendReady ? 'Send a new code' : 'Send a new code in a minute'}</button></p>
      </form>}
      {reset.step === 'password' && <form className="profile-form" onSubmit={e => void savePassword(e)}>
        <input type="email" value={reset.recovery.user.email || email.trim()} autoComplete="username" readOnly hidden />
        <label>New password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required minLength={10} maxLength={128} disabled={busy} autoFocus placeholder="At least 10 characters" /></label>
        <label>Confirm new password<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required minLength={10} maxLength={128} disabled={busy} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Please wait...' : 'Save and sign in'}</button>
      </form>}
      <p className="auth-switch">Remembered it? <button type="button" className="text-button" disabled={busy} onClick={leaveReset}>Back to sign in</button></p>
    </div>
    : <div className="auth-card">
      <Logo className="brand-mark auth-mark" />
      <div className="auth-heading"><h2 id="profile-title">{create ? 'Create your account' : 'Welcome back'}</h2><p>{create ? 'Keep your notes and progress on every computer.' : required ? 'Sign in to open your notes and progress.' : 'Sign in to sync your notes and progress.'}</p></div>
      <button type="button" className="secondary google-button" disabled={busy} onClick={() => void withGoogle()}><span className="google-mark" aria-hidden="true"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg></span>Continue with Google</button>
      <div className="auth-divider" role="separator"><span>or</span></div>
      <form className="profile-form" onSubmit={e => void submit(e)}>
        {create && <label>Name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required maxLength={80} disabled={busy} /></label>}
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required maxLength={254} disabled={busy} /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={create ? 'new-password' : 'current-password'} required minLength={create ? 10 : 1} maxLength={128} disabled={busy} placeholder={create ? 'At least 10 characters' : ''} /></label>
        {!create && PASSWORD_RESET && <button type="button" className="text-button forgot-link" disabled={busy} onClick={startReset}>Forgot password?</button>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Please wait...' : create ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="auth-switch">{create ? 'Already have an account?' : 'New to Recall?'} <button type="button" className="text-button" disabled={busy} onClick={() => { setCreate(!create); setError('') }}>{create ? 'Sign in' : 'Create an account'}</button></p>
      {onGuest && <div className="guest-option"><button type="button" className="ghost guest-button" disabled={busy} onClick={onGuest}>Continue as guest</button><p className="muted">Nothing is saved as a guest, and Recall AI needs an account.</p></div>}
      <p className="muted">{required ? 'Your notes and progress are saved to your account, not this device.' : 'Without an account nothing is saved: your work is gone when you close Recall.'}</p>
    </div>}
  </section>
}
