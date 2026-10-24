import { useState } from 'react'
import { requestHint } from './api'

type Message = { role: 'Recall' | 'You'; text: string }
const welcome = 'I’m Recall. Tell me where you’re stuck and I’ll help you find a next step with only hints.'
export default function HintCoach({ questions }: { questions: string[] }) {
  const [selected, setSelected] = useState(0)
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<Message[]>([{ role: 'Recall', text: welcome }])
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('Hints only')
  async function ask() {
    const text = message.trim()
    if (!text || busy || !questions.length) return
    setHistory(previous => [...previous, { role: 'You', text }])
    setMessage('')
    setBusy(true)
    try {
      const reply = await requestHint(questions[selected].slice(0, 4000), text)
      setMode(reply.mode === 'ai' ? 'AI guided hints' : 'Local hints · AI unavailable')
      setHistory(previous => [...previous, { role: 'Recall', text: reply.hint }])
    } catch {
      setMode('Local hints · backend unavailable')
      setHistory(previous => [...previous, { role: 'Recall', text: 'Try describing what the blank does in the sentence before naming it. What do you remember about that role?' }])
    } finally { setBusy(false) }
  }
  return <aside className="coach" aria-labelledby="coach-title">
    <div className="section-heading"><h3 id="coach-title">Recall AI</h3></div>
    <label className="coach-label" htmlFor="hint-question">Help me with<select id="hint-question" value={selected} disabled={busy || !questions.length} onChange={e => { setSelected(Number(e.target.value)); setHistory([{ role: 'Recall', text: welcome }]); setMode('Hints only') }}>{questions.length ? questions.map((_, i) => <option key={i} value={i}>Question {i + 1}</option>) : <option>Create a quiz first</option>}</select></label>
    {questions.length > 0 && <p className="coach-context">{questions[selected]}</p>}
    <p className="chat-mode" role="status">{mode}</p><div className="coach-messages" role="log" aria-label="Recall hint conversation" aria-live="polite">{history.map((item, i) => <div className={`coach-message ${item.role === 'You' ? 'coach-message--you' : ''}`} key={i}><strong>{item.role}</strong><p>{item.text}</p></div>)}</div>
    <form className="coach-form" onSubmit={e => { e.preventDefault(); void ask() }}><label htmlFor="hint-message">Where are you stuck?</label><textarea id="hint-message" maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} disabled={busy || !questions.length} placeholder="Ask Recall" /><p className="muted">Your selected question and message are sent to the backend and, when configured, OpenAI. Your full notes and answer key are not sent.</p><button className="primary" disabled={busy || !questions.length || !message.trim()}>{busy ? 'Choosing a hint…' : 'Ask for a hint'} <span>↗</span></button></form>
  </aside>
}
