import { useMemo, useState } from 'react'
import { studyPassages } from './quiz'
import type { Question } from './quiz'
import { tutorReply } from './tutor'
import type { Resource } from './tutor'

type Message = { role: 'Recall' | 'You'; text: string; sources?: string[]; resources?: Resource[] }
type Props = { questions: Question[]; current: number; notes: string; hintsOn: boolean; topics: string[] }
export default function HintCoach({ questions, current, notes, hintsOn, topics }: Props) {
  const passages = useMemo(() => studyPassages(notes), [notes])
  const [selected, setSelected] = useState(questions.length ? Math.min(current, questions.length - 1) : -1)
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<Message[]>([])
  const [levels, setLevels] = useState<Record<number, number>>({})
  const question = selected >= 0 ? questions[selected] : undefined
  function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const reply = tutorReply({ passages, message: trimmed, question, hintsOn, level: levels[selected] ?? 0 })
    if (question && hintsOn) setLevels(previous => ({ ...previous, [selected]: (previous[selected] ?? 0) + 1 }))
    setHistory(previous => [...previous, { role: 'You', text: trimmed }, { role: 'Recall', ...reply }])
    setMessage('')
  }
  const suggestions = question
    ? [hintsOn ? (levels[selected] ? 'Another hint' : 'Give me a hint') : 'Show me the answer']
    : topics.slice(0, 3).map(topic => `What is ${topic}?`)
  return <aside className="coach" aria-labelledby="coach-title">
    <div className="page-heading"><h2 id="coach-title">Recall AI</h2><p>{passages.length ? `Answers are quoted from your notes (${passages.length} passages).` : 'Add notes and Recall will answer from them.'} {hintsOn ? 'Hints Mode is on, so quiz answers stay hidden.' : 'Hints Mode is off, so quiz answers are shown.'}</p></div>
    {questions.length > 0 && <label className="coach-label" htmlFor="hint-question">Ask about<select id="hint-question" value={selected} onChange={e => setSelected(Number(e.target.value))}><option value={-1}>My notes in general</option>{questions.map((_, i) => <option key={i} value={i}>Quiz question {i + 1}</option>)}</select></label>}
    {question && <p className="coach-context">{question.prompt}</p>}
    <div className="coach-messages" role="log" aria-label="Recall AI conversation" aria-live="polite">{history.map((item, i) => <div className={`coach-message ${item.role === 'You' ? 'coach-message--you' : ''}`} key={i}><strong>{item.role}</strong><p>{item.text}</p>
      {item.sources?.map((source, n) => <blockquote key={n}>{source}</blockquote>)}
      {!!item.resources?.length && <div className="chips"><span>Look it up</span>{item.resources.map(link => <a key={link.label} className="chip" href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}</div>}
    </div>)}</div>
    {suggestions.length > 0 && <div className="chips suggestions" aria-label="Suggested questions">{suggestions.map(text => <button key={text} type="button" className="chip" onClick={() => ask(text)}>{text}</button>)}</div>}
    <form className="coach-form" onSubmit={e => { e.preventDefault(); ask(message) }}><label className="visually-hidden" htmlFor="hint-message">Your question</label><textarea id="hint-message" maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(message) } }} placeholder={question ? 'Say where you are stuck, or ask about a term' : 'Ask about anything in your notes'} /><button className="primary" disabled={!message.trim()}>Ask</button><p className="muted">Runs on this device by searching your notes. No external AI service is called, so it can only quote what you imported.</p></form>
  </aside>
}
