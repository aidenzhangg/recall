import { useEffect, useState } from 'react'
import { BLOCKER_KEY, MAX_DOMAINS, normalizeDomain } from '../public/blocker.js'
import type { BlockerState } from '../public/blocker.js'

type Action = { action: 'get' } | { action: 'toggle'; enabled: boolean } | { action: 'add' | 'remove'; domain: string }
async function request(action: Action): Promise<BlockerState> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) throw new Error('Website blocking works in the installed Chrome extension. Build and reload Recall to use it.')
  let result
  try { result = await chrome.runtime.sendMessage({ type: 'recall.blocker', ...action }) }
  catch { throw new Error('Cannot reach the blocker. Reload Recall at chrome://extensions and reopen the panel.') }
  if (!result?.ok || typeof result.state?.enabled !== 'boolean' || !Array.isArray(result.state?.domains)) throw new Error('Could not update blocking. Check that Recall has its new permissions and reload it.')
  return result.state
}
export default function WebsiteBlocker() {
  const [state, setState] = useState<BlockerState>({ enabled: false, domains: [] })
  const [domain, setDomain] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    const refresh = () => { void request({ action: 'get' }).then(value => { if (active) { setState(value); setError('') } }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load settings.') }).finally(() => { if (active) setBusy(false) }) }
    const changed = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => { if (area === 'local' && changes[BLOCKER_KEY]) refresh() }
    refresh()
    if (typeof chrome !== 'undefined' && chrome.storage) chrome.storage.onChanged.addListener(changed)
    return () => { active = false; if (typeof chrome !== 'undefined' && chrome.storage) chrome.storage.onChanged.removeListener(changed) }
  }, [])
  async function update(action: Action) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { setState(await request(action)); if (action.action === 'add') setDomain(''); setNotice('Blocking settings saved.') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save blocking settings.') }
    finally { setBusy(false) }
  }
  return <section className="content blocker-panel"><div className="page-heading"><h2>Website blocker</h2></div>
    <label className="blocking-switch"><span>{state.enabled ? 'Blocking on' : 'Blocking off'}</span><input type="checkbox" role="switch" checked={state.enabled} disabled={busy} onChange={e => void update({ action: 'toggle', enabled: e.target.checked })} /></label>
    <form className="blocked-site-form" onSubmit={e => { e.preventDefault(); try { const value = normalizeDomain(domain); if (state.domains.includes(value)) { setError('That website is already in your list.'); return } void update({ action: 'add', domain: value }) } catch (failure) { setError(failure instanceof Error ? failure.message : 'Enter a valid domain.') } }}><label htmlFor="blocked-domain">Website domain</label><input id="blocked-domain" type="text" inputMode="url" autoComplete="off" spellCheck={false} maxLength={2048} value={domain} onChange={e => setDomain(e.target.value)} placeholder="youtube.com" /><button className="primary" disabled={busy || !domain.trim() || state.domains.length >= MAX_DOMAINS}>Add website</button></form>
    <div className="blocked-list-heading"><h3>Blocked websites</h3><span>{state.domains.length} / {MAX_DOMAINS}</span></div>
    {!state.domains.length && <p className="muted">Your list is empty. Add a domain, then turn blocking on.</p>}
    <ul className="blocked-site-list">{state.domains.map(site => <li key={site}><span>{site}</span><button className="text-button" disabled={busy} aria-label={`Remove ${site}`} onClick={() => void update({ action: 'remove', domain: site })}>Remove</button></li>)}</ul>
    <p className="muted">Blocks new page loads for these domains and their subdomains while enabled. Already open pages are not closed. Chrome will show its blocked-page message. Turn blocking off here to regain access.</p>
    <p className="muted">Saved only in this browser profile, across restarts. Recall does not record browsing history or send this list to the backend. Chrome internal pages and other browsers are outside its scope.</p>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="muted" role="status">{notice}</p>}
  </section>
}
