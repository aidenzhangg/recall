import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { checkHealth } from './api'
import HintCoach from './HintCoach'
import FocusTimer from './FocusTimer'
import Profile from './Profile'
import { accountRequest, parseProgress, readToken, rememberToken, saveProgress } from './account'
import type { Account, SavedProgress } from './account'
import { dateKey, recentDays, streakLength, readStudyDays } from './activity'
import './App.css'

type Tab = 'Dashboard' | 'Notes' | 'Practice' | 'Tutor' | 'Focus' | 'Profile'
type Question = { prompt: string; answer: string }
function makeQuestions(notes: string, count: number): Question[] {
  return notes.split(/(?<=[.!?])\s+|\n+/).map(line => line.trim()).filter(line => line.split(/\s+/).length >= 5)
    .map(source => {
      const answer = [...(source.match(/[A-Za-z][A-Za-z'-]{3,}/g) ?? [])].sort((a, b) => b.length - a.length)[0]
      return answer ? { prompt: source.replace(new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '________'), answer } : null
    }).filter((q): q is Question => q !== null).slice(0, count)
}
function NavIcon({ name }: { name: Tab }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'Focus' ? <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2M9 2h6" /></> : name === 'Dashboard' ? <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> : name === 'Notes' ? <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></> : name === 'Practice' ? <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="m8 9 1.5 1.5L12 8m2 2h2M8 15h8" /></> : <><path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z" /><path d="M8 8h8M8 12h5" /></>}</svg>
}
function App() {
  const [studyDays, setStudyDays] = useState(readStudyDays)
  useEffect(() => {
    try { localStorage.setItem('recall-study-days', JSON.stringify(studyDays)) } catch { /* Works in memory if storage is unavailable. */ }
  }, [studyDays])
  const recordStudyDay = useCallback(() => {
    const today = dateKey(new Date())
    setStudyDays(previous => previous.includes(today) ? previous : [...previous, today].sort().slice(-366))
  }, [])
  const inputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('Dashboard')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return localStorage.getItem('recall-theme') === 'light' ? 'light' : 'dark' }
    catch { return 'dark' }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('recall-theme', theme) } catch { /* Theme still works if storage is unavailable. */ }
  }, [theme])
  const [hintsOn, setHintsOn] = useState(true)
  const [notes, setNotes] = useState('')
  const [noteName, setNoteName] = useState('Pasted notes')
  const [error, setError] = useState('')
  const [serverUp, setServerUp] = useState<boolean | null>(null)
  const [count, setCount] = useState(5)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)
  useEffect(() => { checkHealth().then(setServerUp) }, [])
  const [savedToken] = useState(readToken)
  const [account, setAccount] = useState<Account | null>(null)
  const [restoring, setRestoring] = useState(!!savedToken)
  const [syncStatus, setSyncStatus] = useState('Not saved yet')
  const progress = useMemo<SavedProgress>(() => ({ version: 1, notes, noteName, count, hintsOn, questions, answers, submitted, questionIndex, studyDays }), [notes, noteName, count, hintsOn, questions, answers, submitted, questionIndex, studyDays])
  const applyProgress = useCallback((saved: SavedProgress) => {
    setNotes(saved.notes); setNoteName(saved.noteName); setCount(saved.count); setHintsOn(saved.hintsOn)
    setQuestions(saved.questions); setAnswers(saved.answers); setSubmitted(saved.submitted)
    setQuestionIndex(saved.questionIndex); setStudyDays(saved.studyDays)
  }, [])
  function authenticate(next: Account, saved: SavedProgress | null) {
    if (saved) applyProgress(saved)
    rememberToken(next.token); setAccount(next); setSyncStatus('Saving progress…')
  }
  useEffect(() => {
    const token = savedToken
    if (!token) return
    let cancelled = false
    accountRequest('me', undefined, token).then(data => {
      const saved = data.progress ? parseProgress(data.progress) : null
      if (cancelled) return
      if (saved) applyProgress(saved)
      setAccount({ token, user: data.user }); setSyncStatus('Progress restored')
    }).catch(() => {
      if (!cancelled) { rememberToken(null); setError('Sign in to restore your account progress.') }
    }).finally(() => { if (!cancelled) setRestoring(false) })
    return () => { cancelled = true }
  }, [applyProgress, savedToken])
  useEffect(() => {
    if (!account) return
    const abort = new AbortController()
    const timer = window.setTimeout(() => {
      setSyncStatus('Saving progress…')
      saveProgress(account, progress, AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]))
        .then(() => { if (!abort.signal.aborted) setSyncStatus('All progress saved') })
        .catch(() => { if (!abort.signal.aborted) setSyncStatus('Not saved — open Profile to retry or sign in again') })
    }, 800)
    return () => { window.clearTimeout(timer); abort.abort() }
  }, [account, progress])
  async function saveNow() {
    if (!account) return
    setSyncStatus('Saving progress…')
    try {
      await saveProgress(account, progress)
      setSyncStatus('All progress saved')
    } catch (failure) {
      setSyncStatus('Not saved — retry or sign in again')
      throw failure
    }
  }
  async function signOut() {
    if (!account) return
    await saveNow()
    await accountRequest('logout', {}, account.token)
    rememberToken(null); setAccount(null)
    applyProgress({ version: 1, notes: '', noteName: 'Pasted notes', count: 5, hintsOn: true, questions: [], answers: [], submitted: false, questionIndex: 0, studyDays: [] })
    setSyncStatus('Signed out')
  }
  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    if (file.size > 20 * 1024 * 1024) { setError('Choose notes under 20 MB.'); return }
    if (!/\.(txt|md)$/i.test(file.name)) { setError('Choose a .txt or .md file, or paste your notes below.'); return }
    try { setNotes(await file.text()); setNoteName(file.name) }
    catch { setError('Could not read that file. Please try again.') }
  }
  function generate() {
    const next = makeQuestions(notes, count)
    if (!next.length) { setError('Add complete sentences with at least five words to create a quiz.'); return }
    setQuestions(next); setAnswers(next.map(() => '')); setSubmitted(false)
    setQuestionIndex(0); setError(''); setTab('Practice')
  }
  function openWorkspace() {
    if (typeof chrome !== 'undefined' && chrome.tabs) void chrome.tabs.create({ url: chrome.runtime.getURL('index.html') })
    else window.open(window.location.href, '_blank', 'noopener,noreferrer')
  }
  function navigate(next: Tab) { setTab(next); setError('') }
  const words = notes.trim() ? notes.trim().split(/\s+/).length : 0
  const answered = answers.filter(a => a.trim()).length
  const score = questions.filter((q, i) => answers[i]?.trim().toLowerCase() === q.answer.toLowerCase()).length
  const question = questions[questionIndex]
  return <main className="panel">
    <header className="masthead"><div className="brand"><span className="brand-mark" aria-hidden="true">r</span><div><h1>Recall</h1></div></div><div className="header-controls"><button className="profile-button" onClick={() => navigate('Profile')} title={account ? account.user.name : 'Sign in'} aria-label={account ? 'Open your profile' : 'Sign in to Recall'}>{account ? account.user.name.slice(0,1).toUpperCase() : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3"/></svg>}</button><button className="expand-button" onClick={openWorkspace} aria-label="Open Recall in a new tab" title="Open in a new tab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></svg></button></div></header>

    <nav className="tabs" aria-label="Study workspace"><div className="rail-brand"><span className="brand-mark" aria-hidden="true">r</span><strong>Recall</strong></div>{(['Dashboard', 'Notes', 'Practice', 'Tutor', 'Focus'] as Tab[]).map(name => <button key={name} title={name} aria-label={name} className={`tab${tab === name ? ' active' : ''}`} aria-current={tab === name ? 'page' : undefined} onClick={() => navigate(name)}><NavIcon name={name} /><span className="tab-label">{name}</span></button>)}<section className="agent-bar" aria-label="Study assistance controls"><div><strong>Hints Mode</strong><p>{hintsOn ? 'Guidance before answers' : 'Answers after submission'}</p></div><div className={`mode-toggle${hintsOn ? ' mode-toggle--on' : ''}`} role="group" aria-label="Hints Mode"><span className="mode-indicator" aria-hidden="true" /><button aria-pressed={hintsOn} onClick={() => setHintsOn(true)}>On</button><button aria-pressed={!hintsOn} onClick={() => setHintsOn(false)}>Off</button></div></section><div className="theme-switch" role="group" aria-label="Appearance"><button type="button" aria-label="Light mode" title="Light mode" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg></button><button type="button" aria-label="Dark mode" title="Dark mode" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z" /></svg></button></div><div className="streak-card"><strong>7-day activity</strong><p>{streakLength(studyDays)}-day streak</p><div className="streak-days" aria-label="Study activity over the last seven days">{recentDays().map(day => <span key={day} className={studyDays.includes(day) ? 'streak-day active' : 'streak-day'} title={`${day}: ${studyDays.includes(day) ? 'Studied' : 'No activity'}`} aria-label={`${day}: ${studyDays.includes(day) ? 'Studied' : 'No activity'}`}>{Number(day.slice(-2))}</span>)}</div><small>Submit a quiz or finish a focus session.</small></div><div className="rail-session"><strong>Current session</strong><p>{words ? noteName : 'No material added'}</p><div className="rail-progress"><span>Questions answered</span><span>{answered}/{questions.length}</span></div><progress value={answered} max={Math.max(questions.length, 1)} aria-label="Session questions answered" /><small>{account ? syncStatus : 'Sign in to save progress.'}</small></div></nav>
    {restoring && <p className="restore-status" role="status">Restoring your account…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div inert={restoring} className={tab === 'Tutor' ? 'workspace workspace--tutor' : tab === 'Dashboard' ? 'workspace workspace--dashboard' : 'workspace'}><div className="workspace-heading"><span>{tab === 'Dashboard' ? 'Dashboard' : tab === 'Notes' ? 'Study material' : tab === 'Practice' ? 'Practice workspace' : tab === 'Focus' ? 'Focus' : tab === 'Profile' ? 'Profile' : 'Recall AI'}</span><span>{hintsOn ? 'Guided mode' : 'Independent mode'}</span></div>
    {tab === 'Dashboard' && <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="dashboard-welcome"><h2 id="dashboard-title">Your learning, at a glance.</h2><p>Everything from your current study session.</p><dl className="session-stats"><div><dt>Notes</dt><dd>{words} <span>words</span></dd></div><div><dt>Practice</dt><dd>{questions.length} <span>questions</span></dd></div><div><dt>Answered</dt><dd>{answered}<span> / {questions.length}</span></dd></div><div><dt>Last check</dt><dd>{submitted ? `${score}/${questions.length}` : '—'}</dd></div></dl></div>
      <div className="dashboard-grid">
        <section className="dashboard-card"><div className="card-heading"><h3>Continue learning</h3><span>{questions.length ? `${Math.round(answered / questions.length * 100)}% answered` : 'Not started'}</span></div><div className="learning-material"><div className="course-art" aria-hidden="true"><svg viewBox="0 0 120 80" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 15h32l8 5 8-5h32v48H68l-8 5-8-5H20zM60 20v48M29 27h20M29 35h20M29 43h15M71 27h20M71 35h20M71 43h15" /></svg><span>YOUR NOTES</span></div><div><strong>{words ? noteName : 'Start with your course notes'}</strong><p>{words ? `${words} words ready for practice` : 'Upload a text file or paste your material.'}</p></div></div><div className="dashboard-progress"><div><span>Practice progress</span><span>{answered}/{questions.length}</span></div><progress value={answered} max={Math.max(questions.length, 1)} aria-label="Practice questions answered" /></div><button className="primary" onClick={() => navigate(words ? 'Practice' : 'Notes')}>{questions.length ? 'Continue practice' : words ? 'Create a practice quiz' : 'Add course notes'}<span aria-hidden="true">→</span></button></section>
        <section className="dashboard-card"><h3>Your study steps</h3><ol className="study-steps"><li><span className={words ? 'step-mark complete' : 'step-mark'} aria-hidden="true">{words ? '✓' : '1'}</span><div><strong>Add study material</strong><p>{words ? 'Notes added' : 'Text or Markdown notes'}</p></div><button className="text-button" onClick={() => navigate('Notes')}>{words ? 'Edit' : 'Open'}</button></li><li><span className={questions.length ? 'step-mark complete' : 'step-mark'} aria-hidden="true">{questions.length ? '✓' : '2'}</span><div><strong>Test your recall</strong><p>{questions.length ? `${answered} of ${questions.length} answered` : 'Build a short practice quiz'}</p></div><button className="text-button" onClick={() => navigate('Practice')}>Open</button></li><li><span className="step-mark" aria-hidden="true">3</span><div><strong>Work through gaps</strong><p>{hintsOn ? 'Guided hints are enabled' : 'Hints are paused'}</p></div><button className="text-button" onClick={() => navigate('Tutor')}>Open</button></li></ol></section>
        <section className="dashboard-card guidance-card"><h3>Study with a next step</h3><p>The tutor can guide a practice question without revealing its answer. Choose a question and describe where you are stuck.</p><button className="secondary" onClick={() => navigate('Tutor')}>Open study tutor <span aria-hidden="true">↗</span></button></section>
        <section className="dashboard-card"><div className="streak-card"><strong>7-day activity</strong><p>{streakLength(studyDays)}-day streak</p><div className="streak-days" aria-label="Study activity over the last seven days">{recentDays().map(day => <span key={day} className={studyDays.includes(day) ? 'streak-day active' : 'streak-day'} title={`${day}: ${studyDays.includes(day) ? 'Studied' : 'No activity'}`} aria-label={`${day}: ${studyDays.includes(day) ? 'Studied' : 'No activity'}`}>{Number(day.slice(-2))}</span>)}</div><small>Submit a quiz or finish a focus session.</small></div><button className="secondary" onClick={() => navigate('Focus')}>Start a focus session <span aria-hidden="true">→</span></button></section>
      </div>
    </section>}
    {tab === 'Profile' && <Profile account={account} syncStatus={syncStatus} onAuthenticated={authenticate} onSave={saveNow} onSignOut={signOut} />}
    <div hidden={tab !== 'Focus'}><FocusTimer key={account?.user.id ?? 'guest'} onComplete={recordStudyDay} /></div>
    {tab === 'Notes' && <section className="content" aria-labelledby="notes-title">
      <div className="page-heading"><h2 id="notes-title">Your study material</h2><p>Add your course notes to build a guided practice session.</p></div>
      <div className="material-panel"><div className="material-heading"><NavIcon name="Notes" /><div><strong>{words ? noteName : 'Add course notes'}</strong><p>Text or Markdown · up to 20 MB</p></div></div><input ref={inputRef} type="file" className="visually-hidden" accept=".txt,.md,text/plain,text/markdown" aria-label="Upload course notes" tabIndex={-1} onChange={e => void handleFile(e)} /><button className="secondary" onClick={() => inputRef.current?.click()}>{words ? 'Replace file' : 'Upload notes'}<span aria-hidden="true">↑</span></button></div>
      <div className="editor"><div className="field-heading"><label htmlFor="notes">Paste or edit notes</label><span>{words} words</span></div><textarea id="notes" value={notes} onChange={e => { setNotes(e.target.value); setNoteName('Pasted notes') }} placeholder="Paste definitions, notes, or a topic you want to review" /><p className="session-note">{account ? syncStatus : 'Sign in to save your progress.'}</p></div>
      <button className="primary" disabled={!notes.trim()} onClick={() => navigate('Practice')}>Set up practice <span aria-hidden="true">→</span></button>
    </section>}
    {tab === 'Practice' && <section className="content" aria-labelledby="practice-title">
      <div className="page-heading"><h2 id="practice-title">{questions.length ? 'Practice session' : 'Build your practice session'}</h2><p>{questions.length ? 'Take one question at a time.' : 'Recall key terms from your own notes.'}</p></div>
      {!questions.length ? <><div className="source"><span className="field-label">Study material</span><strong>{words ? noteName : 'No notes added'}</strong><button className="text-button" onClick={() => navigate('Notes')}>{words ? 'Edit notes' : 'Add notes'} →</button></div><div className="settings"><label>Format<select defaultValue="blank"><option value="blank">Fill in the blank</option></select></label><label>Length<select value={count} onChange={e => setCount(Number(e.target.value))}><option value={5}>5 questions</option><option value={10}>10 questions</option><option value={15}>15 questions</option></select></label></div><p className="muted">Short notes may produce fewer questions. Quizzes are created locally from your sentences.</p><button className="primary" disabled={!notes.trim()} onClick={generate}>Start practice <span aria-hidden="true">→</span></button></> : <>
        <div className="quiz-progress"><div><span>Question {questionIndex + 1} of {questions.length}</span><span>{answered} answered</span></div><progress value={answered} max={questions.length} aria-label="Questions answered" /></div>
        <div className="question"><label htmlFor={`answer-${questionIndex}`}>{question.prompt}</label><input id={`answer-${questionIndex}`} autoComplete="off" value={answers[questionIndex]} disabled={submitted} placeholder="Your answer" onChange={e => setAnswers(previous => previous.map((a, i) => i === questionIndex ? e.target.value : a))} />{submitted && <p className={answers[questionIndex].trim().toLowerCase() === question.answer.toLowerCase() ? 'correct' : 'feedback'}>{answers[questionIndex].trim().toLowerCase() === question.answer.toLowerCase() ? 'Correct.' : hintsOn ? 'Not quite. Ask the tutor for a hint, then retry.' : `Answer: ${question.answer}`}</p>}</div>
        <div className="question-navigation"><button className="text-button" disabled={questionIndex === 0} onClick={() => setQuestionIndex(i => i - 1)}>← Previous</button><button className="text-button" disabled={questionIndex === questions.length - 1} onClick={() => setQuestionIndex(i => i + 1)}>Next →</button></div>
        {submitted ? <><p className="result" role="status">{score} of {questions.length} correct</p><button className="primary" onClick={() => setSubmitted(false)}>Retry answers <span aria-hidden="true">↻</span></button></> : <button className="primary" disabled={answered !== questions.length} onClick={() => { setSubmitted(true); recordStudyDay() }}>Check all answers <span aria-hidden="true">→</span></button>}
        <div className="quiz-tools">{hintsOn && <button className="text-button" onClick={() => navigate('Tutor')}>Ask for a hint ↗</button>}<button className="text-button" onClick={() => { setQuestions([]); setAnswers([]); setSubmitted(false); setQuestionIndex(0) }}>New session</button></div>
      </>}
    </section>}
    {tab === 'Tutor' && <section className="content" aria-label="Study tutor">{hintsOn ? <><HintCoach key={questions.map(q => q.prompt).join()} questions={questions.map(q => q.prompt)} /><button className="text-button return-link" onClick={() => navigate('Practice')}>{questions.length ? '← Back to your quiz' : 'Create a practice quiz →'}</button></> : <div className="empty-state"><NavIcon name="Tutor" /><h2>Recall AI</h2><button className="primary" onClick={() => !hintsOn ? setHintsOn(true) : navigate(words ? 'Practice' : 'Notes')}>{!hintsOn ? 'Enable hints' : words ? 'Create a quiz' : 'Add notes'}<span aria-hidden="true">→</span></button></div>}</section>}
    </div><footer className="app-footer"><span role="status">{serverUp === null ? 'Connecting…' : serverUp ? 'Tutor backend connected' : 'Local study mode'}</span><span>Recall / Study workspace</span></footer>
  </main>
}
export default App
