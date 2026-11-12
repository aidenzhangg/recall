import { useEffect, useMemo, useRef, useState } from 'react'
import { studyPassages } from './quiz'
import type { Question } from './quiz'
import { tutorReply } from './tutor'
import type { Resource } from './tutor'
import { downloadModel, modelStatus } from './localModel'
import type { ModelStatus } from './localModel'
import { askCloudAi, cloudAiStatus } from './api'
import { currentEngine, listModels, PROVIDERS, readAiSettings, saveAiSettings } from './ai'
import type { AiSettings, Engine, Provider } from './ai'
import { chat } from './aiStudy'
import type { ChatTurn } from './aiStudy'

type Message = { role: 'Recall' | 'You'; text: string; sources?: string[]; resources?: Resource[]; note?: string; lookup?: boolean }
type Props = { questions: Question[]; current: number; notes: string; hintsOn: boolean; topics: string[]; token?: string }
export default function HintCoach({ questions, current, notes, hintsOn, topics, token }: Props) {
  const passages = useMemo(() => studyPassages(notes), [notes])
  const [selected, setSelected] = useState(questions.length ? Math.min(current, questions.length - 1) : -1)
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<Message[]>([])
  const [levels, setLevels] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [engine, setEngine] = useState<Engine>({ kind: 'none', label: 'Notes search', budget: 0 })
  const [device, setDevice] = useState<ModelStatus>('unavailable')
  const [download, setDownload] = useState(0)
  const [cloud, setCloud] = useState({ enabled: false, model: '' })
  const [settings, setSettings] = useState<AiSettings>(readAiSettings)
  const [models, setModels] = useState<string[]>([])
  const [settingsNote, setSettingsNote] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let active = true
    void currentEngine().then(value => { if (active) setEngine(value) })
    void modelStatus().then(value => { if (active) setDevice(value) })
    void cloudAiStatus().then(value => { if (active) setCloud(value) })
    return () => { active = false }
  }, [])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [history, busy])
  const question = selected >= 0 ? questions[selected] : undefined
  const cloudOn = cloud.enabled && !!token

  async function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    const quizzing = !!question && hintsOn
    const hidden = quizzing && question.kind !== 'long' ? question.answer : undefined
    const local: Message = { role: 'Recall', ...tutorReply({ passages, message: trimmed, question, hintsOn, level: levels[selected] ?? 0 }) }
    const turns: ChatTurn[] = history.map(item => ({ role: item.role === 'You' ? 'user' as const : 'assistant' as const, content: item.text }))
    setHistory(previous => [...previous, { role: 'You', text: trimmed }])
    setMessage('')
    // Stepped hints and "show me the answer" are exact, so they never go to a model.
    let reply = local
    if (local.lookup) {
      setBusy(true)
      try {
        if (engine.kind !== 'none') {
          const written = await chat({ notes, history: turns, message: trimmed, hidden, quizPrompt: question?.prompt })
          reply = { role: 'Recall', text: written.text, sources: written.sources, note: written.sources.length ? `${written.label} · based on the note lines below` : `${written.label} · not from your notes, so check it against a source`, resources: written.sources.length ? [] : local.resources }
        } else if (cloudOn) {
          const written = await askCloudAi(token, { message: trimmed, sources: local.sources ?? [], hidden })
          if (!hidden || !written.toLowerCase().includes(hidden.toLowerCase())) reply = { ...local, text: written, note: `${cloud.model} through your Recall backend` }
        }
      } catch (failure) {
        const reason = failure instanceof Error ? failure.message : ''
        if (reason === 'leak' && question) reply = { role: 'Recall', ...tutorReply({ passages, message: 'hint', question, hintsOn, level: levels[selected] ?? 0 }) }
        else if (reason) reply = { ...local, note: `${reason} Showing your notes instead.` }
      }
      setBusy(false)
    }
    if (quizzing && !reply.lookup && reply === local) setLevels(previous => ({ ...previous, [selected]: (previous[selected] ?? 0) + 1 }))
    setHistory(previous => [...previous, reply])
  }
  async function refreshEngine(next: AiSettings) { setEngine(await currentEngine(next)) }
  function update(change: Partial<AiSettings>) { setSettings(previous => ({ ...previous, ...change })); setSettingsNote('') }
  async function findModels() {
    setSettingsNote('Looking up models...')
    try {
      const found = await listModels(settings)
      setModels(found)
      if (found.length && !found.includes(settings.model)) setSettings(previous => ({ ...previous, model: found[0] }))
      setSettingsNote(found.length ? `${found.length} models found. Pick one, then save.` : 'No chat models were listed for this key.')
    } catch (failure) { setSettingsNote(failure instanceof Error ? failure.message : 'Could not list models.') }
  }
  async function saveSettings(next: AiSettings) {
    saveAiSettings(next); setSettings(next); await refreshEngine(next)
    setSettingsNote(next.key ? 'Saved in this browser.' : 'Key removed.')
  }
  async function enableDevice() {
    setDevice('downloading')
    setDevice(await downloadModel(setDownload) ? 'ready' : await modelStatus())
    await refreshEngine(settings)
  }
  const suggestions = question
    ? [hintsOn ? (levels[selected] ? 'Another hint' : 'Give me a hint') : 'Show me the answer', 'Explain the idea behind this']
    : history.length ? [] : topics.length ? [...topics.slice(0, 2).map(topic => `Explain ${topic} simply`), 'Quiz me on the hardest idea'] : ['How should I study for an exam?']
  const smart = engine.kind !== 'none' || cloudOn
  return <aside className="chat" aria-labelledby="coach-title">
    <header className="chat-header">
      <div><h2 id="coach-title">Recall AI</h2><p><span className={`model-dot model-dot--${smart ? 'ready' : 'off'}`} aria-hidden="true" />{engine.kind !== 'none' ? engine.label : cloudOn ? `${cloud.model} via backend` : 'Notes search only'}</p></div>
      <div className="chat-actions">{history.length > 0 && <button type="button" className="ghost" onClick={() => { setHistory([]); setLevels({}) }}>Clear</button>}<button type="button" className="ghost" aria-expanded={showSettings} onClick={() => setShowSettings(!showSettings)}>AI settings</button></div>
    </header>
    {showSettings && <section className="card ai-settings" aria-label="AI settings">
      <p className="muted">Recall AI works three ways. With no setup it searches your notes. With Chrome's on-device model or your own free key it writes real explanations, quizzes and flashcards.</p>
      {device !== 'unavailable' && <div className="setting-row"><div><strong>On-device model</strong><span>{device === 'ready' ? 'On. Runs in Chrome, nothing leaves this computer.' : device === 'downloading' ? `Downloading${download ? ` ${download}%` : ''}...` : 'Free, private, no key. One download.'}</span></div>{device === 'downloadable' && <button type="button" className="secondary" onClick={() => void enableDevice()}>Turn on</button>}</div>}
      <div className="settings-grid">
        <label>Provider<select value={settings.provider} onChange={e => { update({ provider: e.target.value as Provider, model: '' }); setModels([]) }}>{(Object.keys(PROVIDERS) as Provider[]).map(id => <option key={id} value={id}>{PROVIDERS[id].name} ({PROVIDERS[id].note})</option>)}</select></label>
        {settings.provider === 'custom' && <label>Address<input type="url" value={settings.baseUrl} placeholder="https://example.com/v1" onChange={e => update({ baseUrl: e.target.value })} /></label>}
        <label>Your key<input type="password" autoComplete="off" spellCheck={false} value={settings.key} placeholder="Paste the key from the provider" onChange={e => update({ key: e.target.value })} /></label>
        <label>Model{models.length ? <select value={settings.model} onChange={e => update({ model: e.target.value })}>{models.map(id => <option key={id} value={id}>{id}</option>)}</select> : <input type="text" value={settings.model} placeholder="Find models, or type a model name" onChange={e => update({ model: e.target.value })} />}</label>
      </div>
      <div className="button-row"><button type="button" className="secondary" disabled={!settings.key.trim() && settings.provider !== 'custom'} onClick={() => void findModels()}>Find models</button><button type="button" className="primary" disabled={!settings.model.trim()} onClick={() => void saveSettings(settings)}>Save</button>{settings.key && <button type="button" className="ghost" onClick={() => void saveSettings({ ...settings, key: '', model: '' })}>Remove key</button>}</div>
      {settingsNote && <p className="muted" role="status">{settingsNote}</p>}
      <p className="muted">Your key is stored only in this browser and sent only to the provider you pick, along with your question and the relevant parts of your notes. Recall has no server in between.</p>
    </section>}
    {questions.length > 0 && <label className="coach-label" htmlFor="hint-question">Talking about<select id="hint-question" value={selected} onChange={e => setSelected(Number(e.target.value))}><option value={-1}>My notes in general</option>{questions.map((_, i) => <option key={i} value={i}>Quiz question {i + 1}{i === current ? ' (current)' : ''}</option>)}</select></label>}
    {question && <p className="coach-context">{question.prompt}</p>}
    <div className="coach-messages" role="log" aria-label="Recall AI conversation" aria-live="polite">
      {!history.length && <div className="chat-empty"><span className="chat-mark" aria-hidden="true">r</span><h3>{passages.length ? 'Ask anything about your notes' : 'Ask me anything'}</h3><p>{smart ? 'I explain ideas in plain words, compare concepts, and quiz you. Answers lean on your notes.' : 'Right now I find the matching lines in your notes. Open AI settings to turn on real explanations for free.'}{hintsOn ? ' Hints Mode is on, so I will not give away quiz answers.' : ''}</p></div>}
      {history.map((item, i) => <div className={`coach-message ${item.role === 'You' ? 'coach-message--you' : ''}`} key={i}>{item.role === 'Recall' && <strong>Recall</strong>}<p>{item.text}</p>
        {item.sources?.map((source, n) => <blockquote key={n}>{source}</blockquote>)}
        {item.note && <p className="coach-note">{item.note}</p>}
        {!!item.resources?.length && <div className="chips"><span>Look it up</span>{item.resources.map(link => <a key={link.label} className="chip" href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}</div>}
      </div>)}
      {busy && <div className="coach-message"><strong>Recall</strong><p className="typing" aria-label="Recall is thinking"><span /><span /><span /></p></div>}
      <div ref={end} />
    </div>
    {suggestions.length > 0 && <div className="chips suggestions" aria-label="Suggested questions">{suggestions.map(text => <button key={text} type="button" className="chip" disabled={busy} onClick={() => void ask(text)}>{text}</button>)}</div>}
    <form className="coach-form" onSubmit={e => { e.preventDefault(); void ask(message) }}><label className="visually-hidden" htmlFor="hint-message">Your message</label><textarea id="hint-message" rows={1} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(message) } }} placeholder={question ? 'Say where you are stuck' : 'Message Recall AI'} /><button className="send" aria-label="Send" disabled={!message.trim() || busy}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button></form>
  </aside>
}
