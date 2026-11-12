import { useEffect, useState } from 'react'
import { BLOCKER_KEY, MAX_DOMAINS, normalizeDomain } from '../public/blocker.js'
import type { BlockerState } from '../public/blocker.js'

type Action = { action: 'get' } | { action: 'toggle'; enabled: boolean } | { action: 'add' | 'remove'; domain: string }
async function request(action: Action): Promise<BlockerState> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) throw new Error('Website blocking works in the installed Chrome extension. Build and reload Recall to use it.')
  const manifest = chrome.runtime.getManifest()
  if (!manifest.background || !('service_worker' in manifest.background) || manifest.background.type !== 'module' || !manifest.permissions?.includes('declarativeNetRequest')) throw new Error('Recall needs an extension reload to activate website blocking.')
  let result
  try { result = await chrome.runtime.sendMessage({ type: 'recall.blocker', ...action }) }
  catch { throw new Error('Cannot reach the blocker. Reload Recall at chrome://extensions and reopen the panel.') }
  if (!result?.ok || typeof result.state?.enabled !== 'boolean' || !Array.isArray(result.state?.domains)) throw new Error('Could not update blocking. Check that Recall has its new permissions and reload it.')
  return result.state
}
export default function WebsiteBlocker({ locked = false }: { locked?: boolean }) {
  const [state, setState] = useState<BlockerState>({ enabled: false, domains: [] })
  const [domain, setDomain] = useState('')
  const [busy, setBusy] = useState(true)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    const refresh = () => { void request({ action: 'get' }).then(value => { if (active) { setState(value); setConnected(true); setError('') } }).catch(e => { if (active) { setConnected(false); setError(e instanceof Error ? e.message : 'Could not load settings.') } }).finally(() => { if (active) setBusy(false) }) }
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
  const count = state.domains.length
  const suggestions = ['youtube.com', 'instagram.com', 'tiktok.com', 'reddit.com', 'x.com', 'netflix.com', 'twitch.tv', 'facebook.com'].filter(site => !state.domains.includes(site)).slice(0, 6)
  return <section className="content blocker-panel"><div className="page-heading"><h2>Block sites</h2></div>
    <div className={`card blocker-status${state.enabled && connected ? ' blocker-status--on' : ''}`}>
      <span className="blocker-shield" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z" />{state.enabled && connected && <path d="m9 12 2 2 4-4" />}</svg></span>
      <div><strong>{!connected ? 'Blocker unavailable' : state.enabled ? 'Blocking is on' : 'Blocking is off'}</strong><span>{!connected ? 'Works in the installed extension' : state.enabled ? `${count} site${count === 1 ? '' : 's'} blocked right now` : count ? 'Turn it on when you start studying' : 'Add a site below to get started'}</span></div>
      <label className="switch"><span className="visually-hidden">Blocking</span><input type="checkbox" role="switch" checked={state.enabled} disabled={busy || !connected || locked} onChange={e => void update({ action: 'toggle', enabled: e.target.checked })} /></label>
    </div>
    {locked && <p className="lock-note" role="status">Locked during your focus session. You can add sites, but not remove them or turn blocking off until it ends.</p>}
    <form className="blocked-site-form" onSubmit={e => { e.preventDefault(); try { const value = normalizeDomain(domain); if (state.domains.includes(value)) { setError('That website is already in your list.'); return } void update({ action: 'add', domain: value }) } catch (failure) { setError(failure instanceof Error ? failure.message : 'Enter a valid domain.') } }}><label className="visually-hidden" htmlFor="blocked-domain">Website to block</label><input id="blocked-domain" type="text" inputMode="url" autoComplete="off" spellCheck={false} maxLength={2048} value={domain} onChange={e => setDomain(e.target.value)} placeholder="Type a website, like youtube.com" /><button className="primary" disabled={busy || !connected || !domain.trim() || count >= MAX_DOMAINS}>Block</button></form>
    {suggestions.length > 0 && <div className="chips" aria-label="Common distractions"><span>Quick add</span>{suggestions.map(site => <button key={site} type="button" className="chip" disabled={busy || !connected || count >= MAX_DOMAINS} onClick={() => void update({ action: 'add', domain: site })}>+ {site}</button>)}</div>}
    {count > 0 && <div className="card blocked-card"><div className="card-heading"><h3>Blocked</h3><span>{count}</span></div>
      <ul className="blocked-site-list">{state.domains.map(site => <li key={site}><span className="site-icon" aria-hidden="true">{site[0].toUpperCase()}</span><span>{site}</span><button className="ghost" disabled={busy || !connected || locked} aria-label={`Remove ${site}`} onClick={() => void update({ action: 'remove', domain: site })}>Remove</button></li>)}</ul>
    </div>}
    {error && <div className="blocker-error" role="alert"><p>{error}</p>{!connected && <><button className="secondary" type="button" onClick={() => { if (typeof chrome !== 'undefined' && chrome.runtime?.id) chrome.runtime.reload() }}>Reload Recall</button><p className="muted">Reopen the panel after reloading. If needed, enable Recall at chrome://extensions and approve its blocking permission.</p></>}</div>}{notice && <p className="visually-hidden" role="status">{notice}</p>}
  </section>
}
