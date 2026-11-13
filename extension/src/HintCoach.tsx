import { useEffect, useMemo, useRef, useState } from 'react'
import { studyPassages } from './quiz'
import type { Question } from './quiz'
import { tutorReply } from './tutor'
import type { Resource } from './tutor'
import { downloadModel, modelStatus } from './localModel'
import type { ModelStatus } from './localModel'
import { askCloudAi, cloudAiStatus } from './api'
import { currentEngine } from './ai'
import type { Engine } from './ai'
import { chat } from './aiStudy'
import type { ChatTurn } from './aiStudy'
import Logo from './Logo'
import { MAX_CHATS } from './account'
import type { SavedChat } from './account'

type Message = { role: 'Recall' | 'You'; text: string; sources?: string[]; resources?: Resource[]; note?: string; lookup?: boolean; hint?: boolean }
type Props = { questions: Question[]; current: number; notes: string; topics: string[]; token?: string; chats: SavedChat[]; onChats?: (update: (chats: SavedChat[]) => SavedChat[]) => void; onSignIn: () => void }
const newId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
function when(time: number) {
  const days = Math.floor((Date.now() - time) / 86400000)
  return days < 1 ? new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : days < 7 ? new Date(time).toLocaleDateString([], { weekday: 'short' }) : new Date(time).toLocaleDateString([], { month: 'short', day: 'numeric' })
}
/** Recall AI chat. For quiz questions it only ever gives hints: the answer is never shown here. */
export default function HintCoach({ questions, current, notes, topics, token, chats, onChats, onSignIn }: Props) {
  const passages = useMemo(() => studyPassages(notes), [notes])
  const [selected, setSelected] = useState(questions.length ? Math.min(current, questions.length - 1) : -1)
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<Message[]>([])
  const [chatId, setChatId] = useState<string>(newId)
  const [view, setView] = useState<'chat' | 'history'>('chat')
  const [levels, setLevels] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [engine, setEngine] = useState<Engine>({ kind: 'none', label: 'Notes search', budget: 0 })
  const [ready, setReady] = useState(false)
  const [device, setDevice] = useState<ModelStatus>('unavailable')
  const [download, setDownload] = useState(0)
  const [cloud, setCloud] = useState({ enabled: false, model: '' })
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let active = true
    void currentEngine().then(value => { if (active) { setEngine(value); setReady(true) } })
    void modelStatus().then(value => { if (active) setDevice(value) })
    void cloudAiStatus().then(value => { if (active) setCloud(value) })
    return () => { active = false }
  }, [])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [history, busy, draft])
  const question = selected >= 0 ? questions[selected] : undefined
  const cloudOn = cloud.enabled && !!token
  // Hints stop getting stronger after the third; the answer itself is never given in chat.
  const level = Math.min(levels[selected] ?? 0, 2)

  async function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    const hidden = question && question.kind !== 'long' ? question.answer : undefined
    const local: Message = { role: 'Recall', ...tutorReply({ passages, message: trimmed, question, hintsOn: true, level }) }
    const turns: ChatTurn[] = history.map(item => ({ role: item.role === 'You' ? 'user' as const : 'assistant' as const, content: item.text }))
    const asked: Message[] = [...history, { role: 'You', text: trimmed }]
    setHistory(asked)
    setMessage('')
    let reply = local
    // With a model on, hints and explanations are written by it; the answer to a quiz question is never sent back.
    if ((local.lookup || local.hint) && (engine.kind !== 'none' || (cloudOn && local.lookup))) {
      setBusy(true); setDraft('')
      try {
        if (engine.kind !== 'none') {
          const written = await chat({ notes, history: turns, message: trimmed, hidden, quizPrompt: question?.prompt, options: question?.options, hintLevel: local.hint ? level : undefined, onText: setDraft })
          reply = local.hint
            ? { role: 'Recall', text: written.text, hint: true, note: `Hint ${level + 1} of 3` }
            : { role: 'Recall', text: written.text, sources: written.sources, note: written.sources.length ? 'Based on the note lines below' : 'Not from your notes, so check it against a source', resources: written.sources.length ? [] : local.resources }
        } else if (token) {
          const written = await askCloudAi(token, { message: trimmed, sources: local.sources ?? [], hidden })
          if (!hidden || !written.toLowerCase().includes(hidden.toLowerCase())) reply = { ...local, text: written }
        }
      } catch (failure) {
        const reason = failure instanceof Error ? failure.message : ''
        if (reason && reason !== 'leak') reply = { ...local, note: `${reason} Showing your notes instead.` }
        else if (reason === 'leak' && !local.hint && question) reply = { role: 'Recall', ...tutorReply({ passages, message: 'hint', question, hintsOn: true, level }) }
      }
      setBusy(false); setDraft('')
    }
    if (reply.hint) setLevels(previous => ({ ...previous, [selected]: (previous[selected] ?? 0) + 1 }))
    const final = [...asked, reply]
    setHistory(final)
    // Saved to the account only; signed out, nothing is stored.
    onChats?.(previous => {
      const old = previous.find(chat => chat.id === chatId)
      const title = old?.title ?? (question ? `Q${selected + 1}: ${question.prompt}` : trimmed).slice(0, 120)
      const messages = final.slice(-80).map(({ role, text, sources, note, hint }) => ({ role, text, ...(sources ? { sources } : {}), ...(note ? { note } : {}), ...(hint ? { hint } : {}) }))
      return [{ id: chatId, title, updated: Date.now(), messages }, ...previous.filter(chat => chat.id !== chatId)].slice(0, MAX_CHATS)
    })
  }
  function newChat() { setHistory([]); setLevels({}); setChatId(newId()); setView('chat') }
  function openChat(chat: SavedChat) { setHistory(chat.messages); setLevels({}); setChatId(chat.id); setSelected(-1); setView('chat') }
  function deleteChat(id: string) {
    onChats?.(previous => previous.filter(chat => chat.id !== id))
    if (id === chatId) newChat()
  }
  async function enableDevice() {
    setDevice('downloading')
    setDevice(await downloadModel(setDownload) ? 'ready' : await modelStatus())
    setEngine(await currentEngine())
  }
  const smart = engine.kind !== 'none' || cloudOn
  const suggestions = question
    ? [levels[selected] ? 'Another hint' : 'Give me a hint', 'Explain the idea behind this']
    : history.length || !smart ? [] : topics.length ? [...topics.slice(0, 2).map(topic => `Explain ${topic} simply`), 'Quiz me on the hardest idea'] : ['How should I study for an exam?', 'Explain photosynthesis simply']
  return <aside className="chat" aria-labelledby="coach-title">
    <header className="chat-header">
      <div><h2 id="coach-title">Recall AI</h2><p><span className={`model-dot model-dot--${smart ? 'ready' : 'off'}`} aria-hidden="true" />{smart ? 'Hints only. I never give away quiz answers.' : ready ? 'AI is not set up in this build' : 'Checking...'}</p></div>
      {history.length > 0 && <div className="chat-actions"><button type="button" className="ghost" onClick={newChat}>New chat</button></div>}
    </header>
    {onChats && <div className="segmented chat-tabs" role="group" aria-label="Recall AI view">
      <button type="button" aria-pressed={view === 'chat'} onClick={() => setView('chat')}>Chat</button>
      <button type="button" aria-pressed={view === 'history'} onClick={() => setView('history')}>History{chats.length ? <span className="chat-count">{chats.length}</span> : null}</button>
    </div>}
    {onChats && view === 'history' ? <section className="chat-history" aria-label="Past chats">
      {!chats.length ? <div className="chat-empty"><h3>No past chats yet</h3><p>Chats you have with Recall AI show up here so you can pick them back up.</p><button type="button" className="secondary" onClick={newChat}>Start a chat</button></div>
      : <ul className="chat-list">{chats.map(chat => <li key={chat.id} className={chat.id === chatId && history.length ? 'chat-item chat-item--open' : 'chat-item'}>
          <button type="button" className="chat-open" onClick={() => openChat(chat)}><strong>{chat.title}</strong><span>{chat.messages.length} messages · {when(chat.updated)}</span></button>
          <button type="button" className="ghost chat-delete" aria-label={`Delete chat: ${chat.title}`} title="Delete chat" onClick={() => deleteChat(chat.id)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg></button>
        </li>)}</ul>}
    </section> : <>
    {questions.length > 0 && <label className="coach-label" htmlFor="hint-question">Talking about<select id="hint-question" value={selected} onChange={e => setSelected(Number(e.target.value))}><option value={-1}>My notes in general</option>{questions.map((_, i) => <option key={i} value={i}>Quiz question {i + 1}{i === current ? ' (current)' : ''}</option>)}</select></label>}
    {question && <p className="coach-context">{question.prompt}</p>}
    <div className="coach-messages" role="log" aria-label="Recall AI conversation" aria-live="polite">
      {!history.length && <div className="chat-empty"><Logo className="chat-mark" />
        {smart || !ready ? <h3>{question ? 'Stuck? Ask for a hint' : passages.length ? 'Ask anything about your notes' : 'What do you want to learn?'}</h3>
        : <><h3>AI is not set up yet</h3><p>Until it is, I can find the matching lines in your notes and give basic hints.</p>
          {device === 'downloadable' && <button type="button" className="secondary" onClick={() => void enableDevice()}>Turn on Chrome's built-in AI</button>}
          {device === 'downloading' && <p>Downloading{download ? ` ${download}%` : ''}...</p>}</>}
      </div>}
      {history.map((item, i) => <div className={`coach-message ${item.role === 'You' ? 'coach-message--you' : ''}`} key={i}>{item.role === 'Recall' && <strong>Recall</strong>}<p>{item.text}</p>
        {item.sources?.map((source, n) => <blockquote key={n}>{source}</blockquote>)}
        {item.note && <p className="coach-note">{item.note}</p>}
        {!!item.resources?.length && <div className="chips"><span>Look it up</span>{item.resources.map(link => <a key={link.label} className="chip" href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}</div>}
      </div>)}
      {busy && <div className="coach-message"><strong>Recall</strong>{draft ? <p>{draft}</p> : <p className="typing" aria-label="Recall is thinking"><span /><span /><span /></p>}</div>}
      <div ref={end} />
    </div>
    {suggestions.length > 0 && <div className="chips suggestions" aria-label="Suggested questions">{suggestions.map(text => <button key={text} type="button" className="chip" disabled={busy} onClick={() => void ask(text)}>{text}</button>)}</div>}
    <form className="coach-form" onSubmit={e => { e.preventDefault(); void ask(message) }}><label className="visually-hidden" htmlFor="hint-message">Your message</label><textarea id="hint-message" rows={1} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(message) } }} placeholder={question ? 'Say where you are stuck' : 'Message Recall AI'} /><button className="send" aria-label="Send" disabled={!message.trim() || busy}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button></form>
    {!onChats && history.length > 0 && <p className="coach-note chat-unsaved">Not saved. <button type="button" className="text-button" onClick={onSignIn}>Sign in</button> to keep your chats.</p>}
    </>}
  </aside>
}
