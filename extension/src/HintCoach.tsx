import { useEffect, useMemo, useRef, useState } from 'react'
import { studyPassages } from './quiz'
import type { Question } from './quiz'
import { tutorReply } from './tutor'
import type { Resource } from './tutor'
import { downloadModel, modelStatus } from './localModel'
import type { ModelStatus } from './localModel'
import { askCloudAi, cloudAiStatus } from './api'
import { currentEngine, imagesSupported } from './ai'
import type { Engine } from './ai'
import { chat } from './aiStudy'
import type { ChatTurn } from './aiStudy'
import Logo from './Logo'
import { MAX_CHATS } from './account'
import type { SavedChat } from './account'
import { MAX_PICTURES, pictureFiles, preparePicture } from './images'
import type { Picture } from './images'

// `images` are what is shown and sent (full size while the chat is open, previews once reopened); `thumbs` are what is saved.
type Message = { role: 'Recall' | 'You'; text: string; sources?: string[]; resources?: Resource[]; note?: string; lookup?: boolean; hint?: boolean; images?: string[]; thumbs?: string[] }
// Previews kept across all saved chats, newest first, so the synced history stays small (roughly 30 KB each).
const MAX_SAVED_PICTURES = 24
const IMAGE_ONLY = 'Help me understand this picture.'
function limitPictures(chats: SavedChat[]): SavedChat[] {
  let room = MAX_SAVED_PICTURES
  return chats.map(chat => ({ ...chat, messages: [...chat.messages].reverse().map(message => {
    if (!message.images?.length) return message
    const kept = message.images.slice(0, Math.max(0, room)); room -= kept.length
    if (kept.length) return { ...message, images: kept }
    return { role: message.role, text: message.text || '(picture not kept)', ...(message.sources ? { sources: message.sources } : {}), ...(message.note ? { note: message.note } : {}), ...(message.hint ? { hint: true } : {}) }
  }).reverse() }))
}
type Props = { questions: Question[]; current: number; notes: string; token?: string; subjects: string[]; chats: SavedChat[]; onChats?: (update: (chats: SavedChat[]) => SavedChat[]) => void; onSignIn: () => void }
const newId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
function when(time: number) {
  const days = Math.floor((Date.now() - time) / 86400000)
  return days < 1 ? new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : days < 7 ? new Date(time).toLocaleDateString([], { weekday: 'short' }) : new Date(time).toLocaleDateString([], { month: 'short', day: 'numeric' })
}
/** Recall AI chat. For quiz questions it only ever gives hints: the answer is never shown here. */
export default function HintCoach({ questions, current, notes, token, subjects, chats, onChats, onSignIn }: Props) {
  const passages = useMemo(() => studyPassages(notes), [notes])
  const [selected, setSelected] = useState(questions.length ? Math.min(current, questions.length - 1) : -1)
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<Message[]>([])
  const [chatId, setChatId] = useState<string>(newId)
  const [view, setView] = useState<'chat' | 'history'>('chat')
  // '' is a general chat. Each subject from the profile gets its own chats.
  const [subject, setSubject] = useState('')
  const [levels, setLevels] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [engine, setEngine] = useState<Engine>({ kind: 'none', label: 'Notes search', budget: 0 })
  const [ready, setReady] = useState(false)
  const [device, setDevice] = useState<ModelStatus>('unavailable')
  const [download, setDownload] = useState(0)
  const [cloud, setCloud] = useState({ enabled: false, model: '' })
  const [attached, setAttached] = useState<Picture[]>([])
  const [reading, setReading] = useState(0)
  const [pictureError, setPictureError] = useState('')
  const [dropping, setDropping] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
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

  const canAttach = imagesSupported(engine)
  const needsAccount = 'Asking about pictures needs Recall AI. Sign in to use it.'
  async function attach(files: File[]) {
    if (!files.length) return
    setPictureError('')
    if (!canAttach) { setPictureError(ready ? needsAccount : 'Recall AI is still starting. Try again in a moment.'); return }
    const room = MAX_PICTURES - attached.length - reading
    if (room <= 0) { setPictureError(`You can attach up to ${MAX_PICTURES} pictures per message.`); return }
    if (files.length > room) setPictureError(`Only ${MAX_PICTURES} pictures fit in one message, so ${files.length - room} ${files.length - room === 1 ? 'was' : 'were'} left out.`)
    const chosen = files.slice(0, room)
    setReading(count => count + chosen.length)
    for (const file of chosen) {
      try {
        const picture = await preparePicture(file)
        setAttached(previous => previous.length < MAX_PICTURES ? [...previous, picture] : previous)
      } catch (failure) { setPictureError(failure instanceof Error ? failure.message : 'That picture could not be added.') }
      finally { setReading(count => count - 1) }
    }
    input.current?.focus()
  }
  async function ask(text: string) {
    const pictures = attached
    const trimmed = text.trim() || (pictures.length ? IMAGE_ONLY : '')
    if (!trimmed || busy || reading) return
    const hidden = question && question.kind !== 'long' ? question.answer : undefined
    const local: Message = { role: 'Recall', ...tutorReply({ passages, message: trimmed, question, hintsOn: true, level }) }
    const turns: ChatTurn[] = history.map(item => ({ role: item.role === 'You' ? 'user' as const : 'assistant' as const, content: item.text || IMAGE_ONLY, ...(item.images?.length ? { images: item.images } : {}) }))
    const images = pictures.map(picture => picture.url)
    const asked: Message[] = [...history, { role: 'You', text: text.trim(), ...(pictures.length ? { images, thumbs: pictures.map(picture => picture.thumb) } : {}) }]
    setHistory(asked)
    setMessage(''); setAttached([]); setPictureError('')
    let reply = local
    // A picture always goes to the model, since the notes search cannot read it.
    if (images.length && !canAttach) reply = { role: 'Recall', text: needsAccount }
    // With a model on, hints and explanations are written by it; the answer to a quiz question is never sent back.
    else if (images.length || ((local.lookup || local.hint) && (engine.kind !== 'none' || (cloudOn && local.lookup)))) {
      setBusy(true); setDraft('')
      try {
        if (engine.kind !== 'none') {
          const written = await chat({ notes, history: turns, message: trimmed, subject: subject || undefined, hidden, quizPrompt: question?.prompt, options: question?.options, hintLevel: local.hint ? level : undefined, images, onText: setDraft })
          reply = local.hint
            ? { role: 'Recall', text: written.text, hint: true, note: `Hint ${level + 1} of 3` }
            : images.length && !written.sources.length ? { role: 'Recall', text: written.text }
            : { role: 'Recall', text: written.text, sources: written.sources, note: written.sources.length ? 'Based on the note lines below' : 'Not from your notes, so check it against a source', resources: written.sources.length ? [] : local.resources }
        } else if (token) {
          const written = await askCloudAi(token, { message: trimmed, sources: local.sources ?? [], hidden })
          if (!hidden || !written.toLowerCase().includes(hidden.toLowerCase())) reply = { ...local, text: written }
        }
      } catch (failure) {
        const reason = failure instanceof Error ? failure.message : ''
        if (reason && reason !== 'leak' && images.length) reply = { role: 'Recall', text: reason }
        else if (reason && reason !== 'leak') reply = { ...local, note: `${reason} Showing your notes instead.` }
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
      const title = old?.title ?? (question ? `Q${selected + 1}: ${question.prompt}` : text.trim() || 'Question about a picture').slice(0, 120)
      const messages = final.slice(-80).map(({ role, text, sources, note, hint, images, thumbs }) => {
        const saved = thumbs ?? images
        return { role, text, ...(sources ? { sources } : {}), ...(note ? { note } : {}), ...(hint ? { hint } : {}), ...(saved?.length ? { images: saved } : {}) }
      })
      return limitPictures([{ id: chatId, title, updated: Date.now(), ...(subject ? { subject } : {}), messages }, ...previous.filter(chat => chat.id !== chatId)].slice(0, MAX_CHATS))
    })
  }
  function newChat() { setHistory([]); setLevels({}); setChatId(newId()); setView('chat'); setAttached([]); setPictureError('') }
  function openChat(chat: SavedChat) { setHistory(chat.messages); setLevels({}); setChatId(chat.id); setSelected(-1); setSubject(chat.subject ?? ''); setView('chat') }
  // Switching subject starts a fresh chat in it; the one you were in is already saved.
  function pickSubject(next: string) { if (next === subject) return; setSubject(next); if (view === 'chat') { setHistory([]); setLevels({}); setChatId(newId()) } }
  const shownChats = subject ? chats.filter(chat => chat.subject === subject) : chats
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
    : []
  return <aside className="chat" aria-labelledby="coach-title">
    <header className="chat-header">
      <div><h2 id="coach-title">Recall AI</h2><p><span className={`model-dot model-dot--${smart ? 'ready' : 'off'}`} aria-hidden="true" />{smart ? 'Hints only. I never give away quiz answers.' : ready ? 'AI is not set up in this build' : 'Checking...'}</p></div>
      {history.length > 0 && <div className="chat-actions"><button type="button" className="ghost" onClick={newChat}>New chat</button></div>}
    </header>
    {onChats && <div className="segmented chat-tabs" role="group" aria-label="Recall AI view">
      <button type="button" aria-pressed={view === 'chat'} onClick={() => setView('chat')}>Chat</button>
      <button type="button" aria-pressed={view === 'history'} onClick={() => setView('history')}>History{chats.length ? <span className="chat-count">{chats.length}</span> : null}</button>
    </div>}
    {subjects.length > 0 && <div className="subject-tabs" role="group" aria-label={view === 'history' ? 'Show chats for' : 'Chat subject'}>
      {['', ...subjects].map(item => <button key={item || 'general'} type="button" aria-pressed={subject === item} onClick={() => pickSubject(item)}>{item || (view === 'history' ? 'All' : 'General')}{view === 'history' && item ? <span>{chats.filter(chat => chat.subject === item).length}</span> : null}</button>)}
    </div>}
    {onChats && view === 'history' ? <section className="chat-history" aria-label="Past chats">
      {!shownChats.length ? <div className="chat-empty"><h3>{subject ? `No ${subject} chats yet` : 'No past chats yet'}</h3><p>Chats you have with Recall AI show up here so you can pick them back up.</p><button type="button" className="secondary" onClick={newChat}>Start a{subject ? ` ${subject}` : ''} chat</button></div>
      : <ul className="chat-list">{shownChats.map(chat => <li key={chat.id} className={chat.id === chatId && history.length ? 'chat-item chat-item--open' : 'chat-item'}>
          <button type="button" className="chat-open" onClick={() => openChat(chat)}><strong>{chat.title}</strong><span>{!subject && chat.subject ? <em className="chat-subject">{chat.subject}</em> : null}{chat.messages.length} {chat.messages.length === 1 ? 'message' : 'messages'} · {when(chat.updated)}</span></button>
          <button type="button" className="ghost chat-delete" aria-label={`Delete chat: ${chat.title}`} title="Delete chat" onClick={() => deleteChat(chat.id)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg></button>
        </li>)}</ul>}
    </section> : <>
    {questions.length > 0 && <label className="coach-label" htmlFor="hint-question">Talking about<select id="hint-question" value={selected} onChange={e => setSelected(Number(e.target.value))}><option value={-1}>My notes in general</option>{questions.map((_, i) => <option key={i} value={i}>Quiz question {i + 1}{i === current ? ' (current)' : ''}</option>)}</select></label>}
    {question && <p className="coach-context">{question.prompt}</p>}
    <div className="coach-messages" role="log" aria-label="Recall AI conversation" aria-live="polite">
      {!history.length && <div className="chat-empty"><Logo className="chat-mark" />
        {smart || !ready ? <h3>{question ? 'Stuck? Ask for a hint' : subject ? `Ask anything about ${subject}` : passages.length ? 'Ask anything about your notes' : 'What do you want to learn?'}</h3>
        : <><h3>AI is not set up yet</h3><p>Until it is, I can find the matching lines in your notes and give basic hints.</p>
          {device === 'downloadable' && <button type="button" className="secondary" onClick={() => void enableDevice()}>Turn on Chrome's built-in AI</button>}
          {device === 'downloading' && <p>Downloading{download ? ` ${download}%` : ''}...</p>}</>}
      </div>}
      {history.map((item, i) => <div className={`coach-message ${item.role === 'You' ? 'coach-message--you' : ''}`} key={i}>{item.role === 'Recall' && <strong>Recall</strong>}
        {!!item.images?.length && <div className="coach-pictures">{item.images.map((url, n) => <img key={n} src={url} alt={`Picture ${n + 1} you sent`} />)}</div>}
        {item.text && <p>{item.text}</p>}
        {item.sources?.map((source, n) => <blockquote key={n}>{source}</blockquote>)}
        {item.note && <p className="coach-note">{item.note}</p>}
        {!!item.resources?.length && <div className="chips"><span>Look it up</span>{item.resources.map(link => <a key={link.label} className="chip" href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}</div>}
      </div>)}
      {busy && <div className="coach-message"><strong>Recall</strong>{draft ? <p>{draft}</p> : <p className="typing" aria-label="Recall is thinking"><span /><span /><span /></p>}</div>}
      <div ref={end} />
    </div>
    {suggestions.length > 0 && <div className="chips suggestions" aria-label="Suggested questions">{suggestions.map(text => <button key={text} type="button" className="chip" disabled={busy} onClick={() => void ask(text)}>{text}</button>)}</div>}
    {(attached.length > 0 || reading > 0) && <ul className="coach-attachments" aria-label="Pictures to send">
      {attached.map((picture, n) => <li key={picture.id}><img src={picture.thumb} alt={`Attached picture ${n + 1}`} /><button type="button" className="coach-attachment-remove" aria-label={`Remove picture ${n + 1}`} title="Remove" onClick={() => setAttached(previous => previous.filter(item => item.id !== picture.id))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button></li>)}
      {Array.from({ length: reading }, (_, n) => <li key={`reading-${n}`} className="coach-attachment-loading" aria-label="Adding picture" />)}
    </ul>}
    {pictureError && <p className="coach-note coach-picture-error" role="alert">{pictureError}</p>}
    <form className={`coach-form${dropping ? ' coach-form--drop' : ''}`} onSubmit={e => { e.preventDefault(); void ask(message) }}
      onDragOver={e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDropping(true) } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false) }}
      onDrop={e => { setDropping(false); if (!e.dataTransfer.files.length) return; e.preventDefault(); const files = pictureFiles(e.dataTransfer); if (files.length) void attach(files); else setPictureError('Only pictures can be added here.') }}>
      <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={e => { void attach([...(e.target.files ?? [])]); e.target.value = '' }} />
      <button type="button" className="ghost coach-attach" aria-label="Attach a picture" title={canAttach ? 'Attach a picture, or paste a screenshot with Ctrl+V' : 'Sign in to ask Recall AI about pictures'} disabled={busy || attached.length + reading >= MAX_PICTURES} onClick={() => { if (canAttach) picker.current?.click(); else setPictureError(needsAccount) }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></svg></button>
      <label className="visually-hidden" htmlFor="hint-message">Your message</label><textarea ref={input} id="hint-message" rows={1} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)}
        onPaste={e => { const files = pictureFiles(e.clipboardData); if (files.length) { e.preventDefault(); void attach(files) } }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(message) } }} placeholder={attached.length ? 'Ask about the picture' : question ? 'Say where you are stuck' : canAttach ? 'Ask Recall AI, or paste a screenshot' : 'Ask Recall AI'} /><button className="send" aria-label="Send" disabled={(!message.trim() && !attached.length) || busy || reading > 0}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button></form>
    {!onChats && history.length > 0 && <p className="coach-note chat-unsaved">Not saved. <button type="button" className="text-button" onClick={onSignIn}>Sign in</button> to keep your chats.</p>}
    </>}
  </aside>
}
