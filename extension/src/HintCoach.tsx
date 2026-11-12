import { useEffect, useMemo, useState } from 'react'
import { studyPassages } from './quiz'
import type { Question } from './quiz'
import { tutorReply } from './tutor'
import type { Resource } from './tutor'
import { downloadModel, explain, modelStatus } from './localModel'
import type { ModelStatus } from './localModel'
import { askCloudAi, cloudAiStatus } from './api'
import type { CloudAi } from './api'

type Message = { role: 'Recall' | 'You'; text: string; sources?: string[]; resources?: Resource[]; note?: string; lookup?: boolean }
type Props = { questions: Question[]; current: number; notes: string; hintsOn: boolean; topics: string[]; token?: string }
export default function HintCoach({ questions, current, notes, hintsOn, topics, token }: Props) {
  const passages = useMemo(() => studyPassages(notes), [notes])
  const [selected, setSelected] = useState(questions.length ? Math.min(current, questions.length - 1) : -1)
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<Message[]>([])
  const [levels, setLevels] = useState<Record<number, number>>({})
  const [model, setModel] = useState<ModelStatus>('unavailable')
  const [download, setDownload] = useState(0)
  const [cloud, setCloud] = useState<CloudAi>({ enabled: false, model: '' })
  useEffect(() => { let active = true; void cloudAiStatus().then(status => { if (active) setCloud(status) }); return () => { active = false } }, [])
  const cloudOn = cloud.enabled && !!token
  const [busy, setBusy] = useState(false)
  useEffect(() => { let active = true; void modelStatus().then(status => { if (active) setModel(status) }); return () => { active = false } }, [])
  const question = selected >= 0 ? questions[selected] : undefined
  async function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    const quizzing = !!question && hintsOn
    const reply: Message = { role: 'Recall', ...tutorReply({ passages, message: trimmed, question, hintsOn, level: levels[selected] ?? 0 }) }
    if (quizzing) setLevels(previous => ({ ...previous, [selected]: (previous[selected] ?? 0) + 1 }))
    setHistory(previous => [...previous, { role: 'You', text: trimmed }])
    setMessage('')
    // The stepped hint ladder and direct answers are already exact; the model only writes explanations.
    // Preference order for explanations: the backend's AI provider, then Chrome's on-device model, then the notes search itself.
    if (reply.lookup && (cloudOn || model === 'ready')) {
      const input = { message: trimmed, sources: reply.sources ?? [], hidden: quizzing && question.kind !== 'long' ? question.answer : undefined }
      setBusy(true)
      let written: string | null = null
      let author = cloud.model || 'the AI model'
      let problem = ''
      if (cloudOn) {
        try { written = await askCloudAi(token, input) } catch (failure) { problem = failure instanceof Error ? failure.message : 'The AI request failed.' }
        if (written && input.hidden && written.toLowerCase().includes(input.hidden.toLowerCase())) written = null
      }
      if (!written && model === 'ready') { written = await explain(input); author = 'the on-device model' }
      setBusy(false)
      if (written) {
        reply.text = written
        reply.note = reply.sources?.length ? `Written by ${author} from the lines below.` : `Not in your notes. General knowledge from ${author}, which can be wrong. Check it against a source.`
      } else if (problem) reply.note = `${problem} Showing your notes instead.`
    }
    setHistory(previous => [...previous, reply])
  }
  async function enableModel() {
    setModel('downloading')
    setModel(await downloadModel(setDownload) ? 'ready' : await modelStatus())
  }
  const suggestions = question
    ? [hintsOn ? (levels[selected] ? 'Another hint' : 'Give me a hint') : 'Show me the answer']
    : topics.slice(0, 3).map(topic => `What is ${topic}?`)
  return <aside className="coach" aria-labelledby="coach-title">
    <div className="page-heading"><h2 id="coach-title">Recall AI</h2><p>{passages.length ? `Answers come from your notes (${passages.length} passages).` : 'Add notes and Recall will answer from them.'} {hintsOn ? 'Hints Mode is on, so quiz answers stay hidden.' : 'Hints Mode is off, so quiz answers are shown.'}</p></div>
    {cloud.enabled && <div className="model-status" role="status"><span className={`model-dot model-dot--${cloudOn ? 'ready' : 'downloadable'}`} aria-hidden="true" /><span>{cloudOn ? `AI is on (${cloud.model}) through your Recall backend. Your question and the matching note lines are sent to that AI provider.` : 'This backend has AI set up. Sign in to use it.'}</span></div>}
    {!cloudOn && <div className="model-status" role="status"><span className={`model-dot model-dot--${model}`} aria-hidden="true" /><span>{model === 'ready' ? 'On-device AI is on. It runs in Chrome with no API key and nothing leaves this computer.' : model === 'downloading' ? `Downloading the on-device model${download ? ` (${download}%)` : ''}. Notes search works meanwhile.` : model === 'downloadable' ? 'Chrome can run an AI model on this computer to write fuller explanations. No API key or account.' : 'Using notes search. On-device AI needs a recent desktop Chrome with built-in AI.'}</span>{model === 'downloadable' && <button type="button" className="chip" onClick={() => void enableModel()}>Turn on</button>}</div>}
    {questions.length > 0 && <label className="coach-label" htmlFor="hint-question">Ask about<select id="hint-question" value={selected} onChange={e => setSelected(Number(e.target.value))}><option value={-1}>My notes in general</option>{questions.map((_, i) => <option key={i} value={i}>Quiz question {i + 1}</option>)}</select></label>}
    {question && <p className="coach-context">{question.prompt}</p>}
    <div className="coach-messages" role="log" aria-label="Recall AI conversation" aria-live="polite">{history.map((item, i) => <div className={`coach-message ${item.role === 'You' ? 'coach-message--you' : ''}`} key={i}><strong>{item.role}</strong><p>{item.text}</p>
      {item.note && <p className="coach-note">{item.note}</p>}
      {item.sources?.map((source, n) => <blockquote key={n}>{source}</blockquote>)}
      {!!item.resources?.length && <div className="chips"><span>Look it up</span>{item.resources.map(link => <a key={link.label} className="chip" href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}</div>}
    </div>)}{busy && <div className="coach-message"><strong>Recall</strong><p>Thinking on this device...</p></div>}</div>
    {suggestions.length > 0 && <div className="chips suggestions" aria-label="Suggested questions">{suggestions.map(text => <button key={text} type="button" className="chip" disabled={busy} onClick={() => void ask(text)}>{text}</button>)}</div>}
    <form className="coach-form" onSubmit={e => { e.preventDefault(); void ask(message) }}><label className="visually-hidden" htmlFor="hint-message">Your question</label><textarea id="hint-message" maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(message) } }} placeholder={question ? 'Say where you are stuck, or ask about a term' : 'Ask about anything in your notes'} /><button className="primary" disabled={!message.trim() || busy}>Ask</button><p className="muted">{cloudOn ? 'Notes search runs on this device. AI explanations go through your backend, which holds the key; the extension never sees it.' : 'Everything runs on this device. No API key is used and no external AI service is called.'}</p></form>
  </aside>
}
