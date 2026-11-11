import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { API_BASE } from './api'
import type { Account } from './account'

type Item = { id: string; notes: string; mediaType: string; expiresAt: string }
type Pair = { code: string; expiresAt: string }
export default function Connect({ account, onImport, onSignIn }: { account: Account | null; onImport: (text: string) => void; onSignIn: () => void }) {
  const [qr, setQr] = useState('')
  const [pair, setPair] = useState<Pair | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [base, setBase] = useState(API_BASE.replace(/\/api$/, ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [photo, setPhoto] = useState('')
  const [selected, setSelected] = useState('')
  const [draft, setDraft] = useState('')
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo) }, [photo])
  async function request(path: string, method = 'GET') {
    const response = await fetch(`${API_BASE}/connect/${path}`, { method, headers: { Authorization: `Bearer ${account?.token ?? ''}` }, signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to use Connect.' : 'Connect is unavailable. Check your backend.')
    return response
  }
  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.') } finally { setBusy(false) }
  }
  if (!account) return <section className="content"><h2>Connect</h2><p className="muted">Pair your phone to send a photo to this workspace.</p><button className="primary" onClick={onSignIn}>Sign in to pair</button></section>
  let link = ''
  try { const url = new URL(base); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); link = `${url.origin}/connect.html${pair ? `#${pair.code}` : ''}` } catch { /* Report validation below. */ }
  return <section className="content connect-panel"><div className="page-heading"><h2>Connect</h2></div>
    <label className="control-label" htmlFor="connect-host">Backend address accessible from your phone<input id="connect-host" type="url" value={base} onChange={e => { setBase(e.target.value); setPair(null); setQr('') }} placeholder="https://your-recall-server" /></label>
    <p className="muted">For local testing, use your computer's LAN address on the same Wi-Fi. localhost on a phone refers to the phone. Use HTTPS outside local testing.</p>
    <button className="primary" disabled={busy || !link} onClick={() => void run(async () => { const result: Pair = await (await request('pair', 'POST')).json(); setPair(result); setQr(await QRCode.toDataURL(`${new URL(base).origin}/connect.html#${result.code}`, { width: 220, margin: 2, color: { dark: '#172014', light: '#f5f7ec' } })) })}>{busy ? 'Working...' : pair ? 'Generate new pairing' : 'Pair phone'}</button>
    {pair && <div className="pairing-details">{qr && <img className="pairing-qr" src={qr} alt="Scan to pair your phone with this workspace" />}<span className="field-label">Open this link privately on your phone. Valid until {new Date(pair.expiresAt).toLocaleTimeString()}.</span><input aria-label="Phone pairing link" readOnly value={link} /><button className="text-button" onClick={() => void run(async () => { await navigator.clipboard.writeText(link); setNotice('Pairing link copied.') })}>Copy pairing link</button><button className="text-button" disabled={busy} onClick={() => void run(async () => { await request('pair', 'DELETE'); setPair(null); setQr(''); setNotice('Pairing cancelled.') })}>Cancel pairing</button></div>}
    <div className="inbox-heading"><h3>Inbox</h3><button className="text-button" disabled={busy} onClick={() => void run(async () => { setItems(await (await request('inbox')).json()); setNotice('Inbox refreshed.') })}>Refresh</button></div>
    {!items.length && <p className="muted">No photos loaded. Send a photo, then refresh.</p>}
    <ul className="transfer-list">{items.map((item, index) => <li key={item.id}><button className="text-button" disabled={busy} onClick={() => void run(async () => { const blob = await (await request(`inbox/${item.id}`)).blob(); setPhoto(URL.createObjectURL(blob)); setSelected(item.id); setDraft(item.notes) })}>Photo {index + 1}</button><button className="text-button" disabled={busy} onClick={() => void run(async () => { await request(`inbox/${item.id}`, 'DELETE'); setItems(items.filter(i => i.id !== item.id)); if (selected === item.id) { setPhoto(''); setSelected(''); setDraft('') } })}>Delete</button></li>)}</ul>
    {photo && <div className="photo-review"><img src={photo} alt="Received study material" /><label htmlFor="photo-notes">Review or transcribe the photo<textarea id="photo-notes" value={draft} onChange={e => setDraft(e.target.value)} maxLength={20000} /></label><p className="muted">Text recognition is not automatic. Review the text before importing.</p><button className="secondary" disabled={busy || !draft.trim()} onClick={() => void run(async () => { onImport(draft.trim()) })}>Import text to notes</button></div>}
    <p className="muted">Uploads pass through your backend and expire after one hour. Pairing permits one upload and is revoked when its creating session signs out. Closing or restarting the server clears the inbox.</p>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="muted" role="status">{notice}</p>}
  </section>
}
