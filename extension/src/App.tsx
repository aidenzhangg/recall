import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { requestQuiz } from './api'
import { readPdf } from './pdf'
import { aiQuestions, gradeAnswer } from './aiStudy'
import HintCoach from './HintCoach'
import FocusTimer from './FocusTimer'
import Profile from './Profile'
import Connect from './Connect'
import WebsiteBlocker from './WebsiteBlocker'
import { blockerRequest } from './blockerClient'
import type { BlockerState } from '../public/blocker.js'
import { appendMaterial } from './material'
import Flashcards from './Flashcards'
import PredictionPaper from './PredictionPaper'
import Logo from './Logo'
import { accountRequest, clearLocalWorkspace, CLOUD_ACCOUNTS, parseProgress, readToken, rememberToken, saveProgress } from './account'
import type { Account, SavedChat, SavedProgress } from './account'
import { dateKey, recentDays, streakLength } from './activity'
import './App.css'
import { makeQuestions, isCorrect, adaptiveQuestions, recordAttempt } from './quiz'
import type { Question, QuizFormat, ReviewItem } from './quiz'
import { examQuestions } from './exam'
import { resourceLinks } from './tutor'

type Tab = 'Dashboard' | 'Notes' | 'Practice' | 'Tutor' | 'Focus' | 'Connect' | 'Cards' | 'Block' | 'Profile'
function NavIcon({ name }: { name: Tab }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'Block' ? <><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m9 9 6 6m0-6-6 6"/></> : name === 'Connect' ? <><rect x="4" y="2" width="10" height="18" rx="2" /><path d="M8 17h2m7-10 4 4-4 4m-5-4h9" /></> : name === 'Cards' ? <><rect x="3" y="6" width="15" height="15" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/></> : name === 'Focus' ? <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2M9 2h6" /></> : name === 'Dashboard' ? <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> : name === 'Notes' ? <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></> : name === 'Practice' ? <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="m8 9 1.5 1.5L12 8m2 2h2M8 15h8" /></> : <><path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z" /><path d="M8 8h8M8 12h5" /></>}</svg>
}
function App() {
  // Study data is only ever saved to an account. Anything an earlier version left on this device is removed, so signed-out sessions start empty.
  useState(clearLocalWorkspace)
  const [studyDays, setStudyDays] = useState<string[]>([])
  const recordStudyDay = useCallback(() => {
    const today = dateKey(new Date())
    setStudyDays(previous => previous.includes(today) ? previous : [...previous, today].sort().slice(-366))
  }, [])
  const [importing, setImporting] = useState(false)
  const [focusLocked, setFocusLocked] = useState(false)
  const [importReport, setImportReport] = useState<{ name: string; pages: number; warnings: string[] } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('Tutor')
  // The theme and the blocked-sites list are saved with the account, never on this device.
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  // null until it is known: it comes from the account, or from Chrome's live rules when the account has none yet.
  const [blocker, setBlocker] = useState<BlockerState | null>(null)
  // Recall always guides with hints; there is no mode that hands out answers while you are working.
  const hintsOn = true
  const [notes, setNotes] = useState('')
  const [noteName, setNoteName] = useState('Pasted notes')
  const [error, setError] = useState('')
  const generationId = useRef(0)
  const [generating, setGenerating] = useState(false)
  const [quizOrigin, setQuizOrigin] = useState('')
  const [count, setCount] = useState(5)
  const [focusTopic, setFocusTopic] = useState('')
  const [review, setReview] = useState<ReviewItem[]>([])
  const [adaptive, setAdaptive] = useState(true)
  const [format, setFormat] = useState<QuizFormat>('choice')
  const [questions, setQuestions] = useState<Question[]>([])
  const sessionKey = useMemo(() => questions.map(q => q.prompt).join(), [questions])
  const [answers, setAnswers] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)
  // Sources whose first multiple-choice pick was wrong; they still count as missed for review.
  const [firstWrong, setFirstWrong] = useState<string[]>([])
  // Typed and written questions that have been checked in this session, and AI feedback on written answers.
  const [checked, setChecked] = useState<number[]>([])
  const [feedback, setFeedback] = useState<Record<number, string>>({})
  const resetSession = useCallback(() => { setSubmitted(false); setQuestionIndex(0); setFirstWrong([]); setChecked([]); setFeedback({}) }, [])
  // Recall AI chats are kept only with an account. Signed out, a chat lasts until you leave it.
  const [chats, setChats] = useState<SavedChat[]>([])
  const [savedToken] = useState(readToken)
  const [account, setAccount] = useState<Account | null>(null)
  const [restoring, setRestoring] = useState(!!savedToken)
  const [syncStatus, setSyncStatus] = useState('Not saved yet')
  const progress = useMemo<SavedProgress>(() => ({ version: 1, notes, noteName, count, format, review, adaptive, hintsOn, questions, answers, submitted, questionIndex, studyDays, theme, chats, ...(blocker ? { blocker } : {}) }), [notes, noteName, count, format, review, adaptive, hintsOn, questions, answers, submitted, questionIndex, studyDays, theme, chats, blocker])
  const applyProgress = useCallback((saved: SavedProgress) => {
    setReview(saved.review ?? []); setAdaptive(saved.adaptive !== false); setNotes(saved.notes); setNoteName(saved.noteName); setCount(saved.count); setFormat(saved.format ?? 'blank');
    setQuestions(saved.questions); setAnswers(saved.answers); setSubmitted(saved.submitted)
    setQuestionIndex(saved.questionIndex); setStudyDays(saved.studyDays)
    if (saved.theme) setTheme(saved.theme)
    setBlocker(saved.blocker ?? null)
    setChats(saved.chats ?? [])
  }, [])
  function authenticate(next: Account, saved: SavedProgress | null) {
    if (saved) applyProgress(saved)
    rememberToken(next.token); setAccount(next); setSyncStatus('Saving progress')
    // Anything studied before signing in now belongs to the account, not this device.
    clearLocalWorkspace()
  }
  useEffect(() => {
    const token = savedToken
    if (!token) return
    let cancelled = false
    accountRequest('me', undefined, token).then(data => {
      const saved = data.progress ? parseProgress(data.progress) : null
      if (cancelled) return
      if (saved) applyProgress(saved)
      setAccount({ token, user: data.user }); setSyncStatus('Progress restored'); clearLocalWorkspace()
    }).catch(() => {
      if (!cancelled) { rememberToken(null); setError('Sign in to restore your account progress.') }
    }).finally(() => { if (!cancelled) setRestoring(false) })
    return () => { cancelled = true }
  }, [applyProgress, savedToken])
  useEffect(() => {
    if (!account) return
    const abort = new AbortController()
    const timer = window.setTimeout(() => {
      setSyncStatus('Saving progress')
      saveProgress(account, progress, AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]))
        .then(() => { if (!abort.signal.aborted) setSyncStatus('All progress saved') })
        .catch(() => { if (!abort.signal.aborted) setSyncStatus('Not saved - open Profile to retry or sign in again') })
    }, 800)
    return () => { window.clearTimeout(timer); abort.abort() }
  }, [account, progress])
  // Chrome's rules always mirror the account's list, so signing in applies it and signing out clears it.
  useEffect(() => {
    if (restoring) return
    let active = true
    if (blocker) void blockerRequest({ action: 'set', state: blocker }).catch(() => {})
    else void blockerRequest({ action: 'get' }).catch(() => ({ enabled: false, domains: [] })).then(state => { if (active) setBlocker(state) })
    return () => { active = false }
  }, [blocker, restoring])
  const blockForFocus = useCallback(() => setBlocker(previous => previous && !previous.enabled ? { ...previous, enabled: true } : previous), [])
  async function saveNow() {
    if (!account) return
    setSyncStatus('Saving progress')
    try {
      await saveProgress(account, progress)
      setSyncStatus('All progress saved')
    } catch (failure) {
      setSyncStatus('Not saved - retry or sign in again')
      throw failure
    }
  }
  async function signOut() {
    if (!account) return
    await saveNow()
    await accountRequest('logout', {}, account.token)
    rememberToken(null); setAccount(null)
    applyProgress({ version: 1, notes: '', noteName: 'Pasted notes', count: 5, hintsOn: true, questions: [], answers: [], submitted: false, questionIndex: 0, studyDays: [], blocker: { enabled: false, domains: [] } })
    setSyncStatus('Signed out')
  }
  function editNotes(text: string) {
    generationId.current++; setGenerating(false)
    setNotes(text); setNoteName('Pasted notes'); setImportReport(null)
    setQuestions([]); setAnswers([]); resetSession(); setQuizOrigin('')
  }
  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    if (file.size > 20 * 1024 * 1024) { setError('Choose a file up to 20 MB.'); return }
    if (!/\.(txt|md|pdf)$/i.test(file.name)) { setError('Choose a .txt, .md or text-based PDF file.'); return }
    setImporting(true)
    try {
      const pdf = /\.pdf$/i.test(file.name) ? await readPdf(file) : null
      const text = pdf ? pdf.text : await file.text()
      if (text.length > 200000) { setError('Use material under 200,000 characters.'); return }
      if (!text.trim()) { setError('No readable text found in this file.'); return }
      generationId.current++; setGenerating(false)
      setQuestions([]); setAnswers([]); resetSession(); setReview([]); setQuizOrigin(''); setFocusTopic('')
      setNotes(text); setNoteName(file.name)
      setImportReport(pdf ? { name: file.name, pages: pdf.pageCount, warnings: pdf.warnings } : null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not import the file.') }
    finally { setImporting(false) }
  }
  async function generate(weakFirst = false) {
    if (generating) return
    const useHistory = weakFirst || adaptive
    const id = ++generationId.current
    setGenerating(true); setError('')
    try {
      let next: Question[] = []
      // A language model writes the questions when one is available; otherwise they are built from the note sentences.
      try {
        const written = await aiQuestions(notes, count, format, focusTopic, review.filter(item => item.misses > item.successes).map(item => item.topic))
        if (written.questions.length) { next = written.questions; setQuizOrigin(`Written by ${written.label}`) }
      } catch { /* Falls back to the generators below. */ }
      if (!next.length) try { next = await requestQuiz(notes, count, format, useHistory ? review : [], focusTopic); setQuizOrigin(weakFirst ? 'Targeted practice - missed topics first' : 'Practice from your notes') }
      catch { next = useHistory ? adaptiveQuestions(notes, count, format, review, Date.now(), focusTopic) : makeQuestions(notes, count, format, focusTopic); setQuizOrigin('Practice from your notes') }
      if (id !== generationId.current) return
      if (!next.length) { setError('No clear definitions or explanations matched. Try another focus topic or select the relevant lecture text in Notes.'); return }
      setQuestions(next); setAnswers(next.map(() => '')); resetSession()
      setTab('Practice')
    } finally { if (id === generationId.current) setGenerating(false) }
  }
  const paper = useMemo(() => examQuestions(notes), [notes])
  function startPaper(prompts = paper.slice(0, count), origin = 'Past-paper practice - self-review') {
    const next = prompts.map((prompt): Question => ({ kind: 'long', prompt, answer: 'Past papers do not include an answer key. Check your answer against your course notes or the mark scheme.' }))
    generationId.current++; setGenerating(false); setError('')
    setQuestions(next); setAnswers(next.map(() => '')); resetSession(); setQuizOrigin(origin)
  }
  function openWorkspace() {
    if (typeof chrome !== 'undefined' && chrome.tabs) void chrome.tabs.create({ url: chrome.runtime.getURL('index.html') })
    else window.open(window.location.href, '_blank', 'noopener,noreferrer')
  }
  // With accounts on, nothing is usable until you are signed in, so nothing is kept on the device.
  const gated = CLOUD_ACCOUNTS && !account
  const shown: Tab = gated ? 'Profile' : tab
  function navigate(next: Tab) { generationId.current++; setGenerating(false); setTab(next); setError('') }
  const words = notes.trim() ? notes.trim().split(/\s+/).length : 0
  const answered = answers.filter(a => a.trim()).length
  const graded = questions.filter(q => q.kind !== 'long').length
  // A question only scores when it was right on the first try.
  const firstTry = (q: Question, i: number) => isCorrect(q, answers[i]) && !firstWrong.includes(q.source ?? `#${i}`)
  const score = questions.filter(firstTry).length
  const question = questions[questionIndex]
  const picked = question?.kind === 'choice' ? answers[questionIndex] ?? '' : ''
  const pickedRight = !!picked && isCorrect(question, picked)
  // With Hints Mode on a wrong pick can be retried; with it off the answer is shown and the question locks.
  const choiceLocked = submitted || pickedRight || (!!picked && !hintsOn)
  const missKey = question ? question.source ?? `#${questionIndex}` : ''
  const noteMiss = () => setFirstWrong(previous => previous.includes(missKey) ? previous : [...previous, missKey])
  function choose(option: string) {
    setAnswers(previous => previous.map((a, i) => i === questionIndex ? option : a))
    if (!isCorrect(question, option)) noteMiss()
  }
  const typed = answers[questionIndex] ?? ''
  const isChecked = checked.includes(questionIndex)
  const typedRight = question?.kind !== 'choice' && isCorrect(question ?? { prompt: '', answer: '' }, typed)
  // A checked answer locks once it is right, or straight away when Hints Mode is off and the answer is shown.
  const typedLocked = submitted || (isChecked && (question?.kind === 'long' || typedRight || !hintsOn))
  function type(value: string) {
    setAnswers(previous => previous.map((a, i) => i === questionIndex ? value : a))
    setChecked(previous => previous.filter(i => i !== questionIndex))
  }
  function check() {
    if (!typed.trim()) return
    const index = questionIndex
    setChecked(previous => [...previous, index])
    if (question.kind === 'long') {
      // A model, when one is connected, comments on the written answer; otherwise it is self-review.
      setFeedback(previous => ({ ...previous, [index]: '...' }))
      gradeAnswer({ notes, prompt: question.prompt, answer: typed, reference: question.answer }).catch(() => '').then(text => setFeedback(previous => ({ ...previous, [index]: text })))
    } else if (!isCorrect(question, typed)) noteMiss()
  }
  const needsCheck = !!question && question.kind !== 'choice' && !isChecked && !submitted
  const last = questionIndex === questions.length - 1
  function finish() {
    setSubmitted(true); recordStudyDay()
    setReview(previous => recordAttempt(previous, questions, answers.map((answer, i) => firstWrong.includes(questions[i].source ?? `#${i}`) ? '' : answer)))
  }
  function retry() { setAnswers(questions.map(() => '')); resetSession() }
  const weak = useMemo(() => review.filter(item => item.misses > item.successes).sort((a, b) => (b.misses - b.successes) - (a.misses - a.successes)).slice(0, 4), [review])
  const topics = useMemo(() => [...new Set(makeQuestions(notes, 4, 'long').map(q => q.topic ?? ''))].filter(Boolean), [notes])
  return <main className={gated ? 'panel panel--gated' : 'panel'}>
    <header className="masthead"><div className="brand"><Logo className="brand-mark" /><h1>Recall</h1></div><div className="header-controls">{!gated && <button className="save-status" onClick={() => navigate('Profile')}>{account && <span className="save-avatar" aria-hidden="true">{account.user.name.slice(0, 1).toUpperCase()}</span>}{account ? account.user.name.split(' ')[0] : 'Sign in'}</button>}<button type="button" className="expand-button" title={theme === 'dark' ? 'Light mode' : 'Dark mode'} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{theme === 'dark' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z" />}</svg></button><button className="expand-button" onClick={openWorkspace} aria-label="Open Recall in a new tab" title="Open in a new tab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></svg></button></div></header>

    {!gated && <nav className="tabs" aria-label="Study workspace">{(['Tutor', 'Dashboard', 'Notes', 'Practice', 'Cards', 'Focus', 'Block'] as Tab[]).map(name => <button key={name} title={name === 'Tutor' ? 'Recall AI' : name === 'Cards' ? 'Flashcards' : name === 'Block' ? 'Block sites' : name} className={`tab${shown === name ? ' active' : ''}`} aria-current={shown === name ? 'page' : undefined} onClick={() => navigate(name)}><NavIcon name={name} /><span className="tab-label">{name === 'Cards' ? 'Flashcards' : name === 'Block' ? 'Block sites' : name === 'Tutor' ? 'Recall AI' : name}</span></button>)}</nav>}
    <input ref={inputRef} type="file" className="visually-hidden" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" aria-label="Upload course notes" tabIndex={-1} onChange={e => void handleFile(e)} />
    {restoring && <p className="restore-status" role="status">Restoring your account</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div inert={restoring} className={shown === 'Tutor' ? 'workspace workspace--tutor' : shown === 'Dashboard' ? 'workspace workspace--dashboard' : 'workspace'}>
    {shown === 'Dashboard' && <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="page-heading"><h2 id="dashboard-title">{account ? `Welcome back, ${account.user.name.split(' ')[0]}` : 'Home'}</h2><p>{streakLength(studyDays) > 1 ? `You are on a ${streakLength(studyDays)}-day streak. Keep it going.` : words ? 'Pick up where you left off.' : 'Add your notes and Recall turns them into practice.'}</p></div>
      <section className="session-overview" aria-label="Current material">
        <span className="field-label">{words ? 'Current material' : 'Get started'}</span>
        <h3>{words ? noteName : 'Add your notes to get started'}</h3>
        {words > 0 && <dl className="session-stats"><div><dt>Words</dt><dd>{words.toLocaleString()}</dd></div><div><dt>Answered</dt><dd>{answered}<span> / {questions.length}</span></dd></div><div><dt>Last result</dt><dd>{submitted ? graded ? `${score}/${graded}` : 'Self-review' : '-'}</dd></div></dl>}
        {questions.length > 0 && <progress value={answered} max={questions.length} aria-label="Practice questions answered" />}
        <button className="primary" onClick={() => navigate(questions.length ? 'Practice' : words ? 'Practice' : 'Notes')}>{questions.length ? 'Continue practice' : words ? 'Create quiz' : 'Add notes'}</button>
      </section>
      <div className="quick-row">{([['Tutor', 'Ask Recall AI', 'Hints, never answers'], ['Cards', 'Flashcards', 'Flip through key ideas'], ['Focus', 'Focus session', 'Timer with camera check-ins'], ['Block', 'Block sites', 'Shut out distractions']] as [Tab, string, string][]).map(([name, title, text]) => <button key={name} className="quick" onClick={() => navigate(name)}><NavIcon name={name} /><strong>{title}</strong><span>{text}</span></button>)}</div>
      {weak.length > 0 && <section className="card weak-topics" aria-labelledby="weak-title"><div className="card-heading"><h3 id="weak-title">Needs practice</h3><span>from your missed answers</span></div><ul>{weak.map(item => <li key={item.source}><div><strong>{item.topic}</strong><span>Missed {item.misses}x{item.successes ? `, correct ${item.successes}x` : ''}</span></div><div className="chips" aria-label={`Look up ${item.topic}`}>{resourceLinks(item.topic).slice(0, 3).map(link => <a key={link.label} className="chip" href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}</div></li>)}</ul><button className="primary" disabled={generating || !notes.trim()} onClick={() => void generate(true)}>{generating ? 'Preparing...' : 'Practice weak topics'}</button></section>}
      <section className="card activity-summary" aria-label="Study activity"><div className="card-heading"><h3>This week</h3><span className="streak-badge">{streakLength(studyDays)}-day streak</span></div><div className="streak-days" aria-label="Study activity over the last seven days">{recentDays().map(day => <span key={day} className={studyDays.includes(day) ? 'streak-day active' : 'streak-day'} title={`${day}: ${studyDays.includes(day) ? 'Studied' : 'No activity'}`} aria-label={`${day}: ${studyDays.includes(day) ? 'Studied' : 'No activity'}`}><small aria-hidden="true">{new Date(`${day}T12:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</small>{Number(day.slice(-2))}</span>)}</div></section>
    </section>}
    {shown === 'Block' && <WebsiteBlocker state={blocker ?? { enabled: false, domains: [] }} onChange={setBlocker} locked={focusLocked} signedIn={!!account} />}
    {shown === 'Connect' && <Connect key={account?.user.id ?? 'guest'} account={account} onSignIn={() => navigate('Profile')} onImport={text => { setNotes(appendMaterial(notes, text)); setNoteName('Imported material'); navigate('Notes') }} />}
    {shown === 'Cards' && <Flashcards key={notes} notes={notes} onNotes={() => navigate('Notes')} />}
    {shown === 'Profile' && <Profile required={CLOUD_ACCOUNTS} account={account} syncStatus={syncStatus} onAuthenticated={authenticate} onSave={saveNow} onSignOut={signOut} />}
    <div hidden={shown !== 'Focus'}><FocusTimer key={account?.user.id ?? 'guest'} onComplete={recordStudyDay} onSession={setFocusLocked} onBlock={blockForFocus} /></div>
    {shown === 'Notes' && <section className="content" aria-labelledby="notes-title">
      <div className="page-heading"><h2 id="notes-title">Notes</h2></div>
      <div className="material-panel"><div className="material-heading"><NavIcon name="Notes" /><div><strong>{words ? noteName : 'Add course notes'}</strong><p>PDF, TXT or Markdown, up to 20 MB</p></div></div><button className="secondary" disabled={importing} onClick={() => inputRef.current?.click()}>{importing ? 'Importing...' : words ? 'Replace material' : 'Import material'}</button></div>
      {importReport && importReport.name === noteName && <div className="import-report" role="status"><p>{importReport.pages ? `${importReport.pages} pages processed / ` : ''}{words.toLocaleString()} words extracted. Review the text below.</p>{importReport.warnings.length > 0 && <details open><summary>Some PDF content may be missing</summary><ul>{importReport.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}</div>}
      <div className="editor"><div className="field-heading"><label htmlFor="notes">Paste or edit notes</label><span>{words} words</span></div><textarea id="notes" maxLength={200000} value={notes} onChange={e => editNotes(e.target.value)} placeholder="Paste definitions, notes, or a topic you want to review" /></div>
      <button className="primary" disabled={!notes.trim() || importing} onClick={() => navigate('Practice')}>Make a quiz</button>
      <button className="text-button phone-link" onClick={() => navigate('Connect')}>Send photos from your phone</button>
    </section>}
    {shown === 'Practice' && <section className="content" aria-labelledby="practice-title">
      <div className="page-heading page-heading--row"><h2 id="practice-title">{!questions.length ? 'New quiz' : submitted ? 'Results' : 'Practice'}</h2></div>
      {!questions.length ? <>{paper.length > 0 && <div className="card paper-card"><div><strong>Past paper detected</strong><p>{paper.length} exam question{paper.length === 1 ? '' : 's'} found in this material. Answer them one at a time and review each yourself.</p></div><button className="secondary" onClick={() => startPaper()}>Practise {Math.min(count, paper.length)} past-paper questions</button></div>}{paper.length > 0 ? <PredictionPaper key={notes} source={notes} name={noteName} onConnect={() => navigate('Tutor')} onPractise={prompts => startPaper(prompts, 'Prediction paper - self-review')} /> : <button className="secondary" disabled={importing} onClick={() => inputRef.current?.click()}>{importing ? 'Reading the PDF...' : 'Upload a past paper for a prediction paper'}</button>}<div className="source"><span className="field-label">Study material</span><strong>{words ? noteName : 'No notes added'}</strong><button className="text-button" onClick={() => navigate('Notes')}>{words ? 'Edit notes' : 'Add notes'} </button></div><div className="settings"><label>Format<select value={format} onChange={e => setFormat(e.target.value as QuizFormat)}><option value="blank">Fill in the blank</option><option value="choice">Multiple choice</option><option value="long">Long answer</option><option value="mixed">Mixed</option></select></label><label>Length<select value={count} onChange={e => setCount(Number(e.target.value))}><option value={5}>5 questions</option><option value={10}>10 questions</option><option value={15}>15 questions</option></select></label></div><label className="focus-topic">Focus topic (optional)<input type="text" maxLength={200} value={focusTopic} onChange={e => setFocusTopic(e.target.value)} placeholder="e.g. cellular respiration" /></label><label className="adaptive-control"><input type="checkbox" checked={adaptive} onChange={e => setAdaptive(e.target.checked)} /><span>Bring back topics I missed</span></label><button className="primary" disabled={!notes.trim() || generating} onClick={() => void generate()}>{generating ? 'Preparing...' : 'Start practice'} </button></> : <>
        {submitted ? <>
          <div className="card results" role="status"><span className="results-score">{graded ? `${score}/${graded}` : 'Done'}</span><div><strong>{graded ? score === graded ? 'Every answer right first time' : `${score} of ${graded} right first time` : 'Ready for self-review'}</strong><p>{questions.length > graded ? `${questions.length - graded} written answer${questions.length - graded === 1 ? '' : 's'} for self-review. ` : ''}{graded > score ? 'Missed questions come back first in your next quiz.' : ''}</p></div></div>
          <ol className="review-list">{questions.map((q, i) => <li key={i} className={q.kind === 'long' ? 'review-item' : firstTry(q, i) ? 'review-item review-item--right' : 'review-item review-item--wrong'}><p className="review-prompt">{q.prompt}</p><p><span>Your answer</span>{answers[i]?.trim() || 'No answer'}</p>{q.kind === 'long' ? <>{feedback[i] && feedback[i] !== '...' && <p><span>Feedback</span>{feedback[i]}</p>}<p><span>Reference</span>{q.answer}</p></> : <>{!firstTry(q, i) && <p><span>Correct answer</span>{q.answer}</p>}{q.explanation && <p><span>Why</span>{q.explanation}</p>}</>}</li>)}</ol>
          <div className="button-row"><button className="primary" onClick={retry}>Try again</button><button className="secondary" onClick={() => { setQuestions([]); setAnswers([]); resetSession() }}>New quiz</button></div>
        </> : <>
        <div className="quiz-progress" title={quizOrigin}><div><span>Question {questionIndex + 1} of {questions.length}</span></div><progress value={answered} max={questions.length} aria-label="Questions answered" /></div>
        <div className="question"><label id="question-prompt" htmlFor={`answer-${questionIndex}`}>{question.prompt}</label>
          {question.kind === 'choice' ? <fieldset className="choice-options" aria-labelledby="question-prompt"><legend className="visually-hidden">Choose an answer</legend>{question.options?.map(option => <label key={option} className={option === picked ? (pickedRight ? 'choice-right' : 'choice-wrong') : picked && !pickedRight && !hintsOn && isCorrect(question, option) ? 'choice-right' : undefined}><input type="radio" name={`answer-${questionIndex}`} value={option} checked={picked === option} disabled={choiceLocked} onChange={() => choose(option)} /><span>{option}</span></label>)}</fieldset>
          : question.kind === 'long' ? <textarea id={`answer-${questionIndex}`} value={typed} disabled={typedLocked} placeholder="Write your explanation" onChange={e => type(e.target.value)} />
          : <input id={`answer-${questionIndex}`} autoComplete="off" value={typed} disabled={typedLocked} placeholder="Type your answer, then press Enter" onChange={e => type(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && needsCheck) check() }} />}
          {question.kind === 'choice' && picked && <p className={pickedRight ? 'correct choice-feedback' : 'feedback choice-feedback choice-feedback--wrong'} role="status">{pickedRight ? 'Correct!' : hintsOn ? 'Not quite. Pick another option or ask for a hint.' : `Not quite. The answer is ${question.answer}.`}</p>}
          {question.kind === 'choice' && picked && question.explanation && (pickedRight || !hintsOn) && <p className="explanation">{question.explanation}</p>}
          {question.kind === 'blank' && isChecked && <p className={typedRight ? 'correct choice-feedback' : 'feedback choice-feedback choice-feedback--wrong'} role="status">{typedRight ? 'Correct!' : hintsOn ? 'Not quite. Change your answer and check again, or ask for a hint.' : `Not quite. The answer is ${question.answer}.`}</p>}
          {question.kind === 'long' && isChecked && <div className="feedback" role="status">{feedback[questionIndex] === '...' ? <p>Reading your answer...</p> : feedback[questionIndex] ? <p className="explanation">{feedback[questionIndex]}</p> : <p>Compare your answer with the reference below and decide how close you were.</p>}<strong>Reference</strong><p>{question.answer}</p></div>}
        </div>
        <div className="button-row">{questionIndex > 0 && <button className="secondary" onClick={() => setQuestionIndex(i => i - 1)}>Back</button>}{needsCheck ? <button className="primary" disabled={!typed.trim()} onClick={check}>Check answer</button> : last ? <button className="primary" disabled={answered !== questions.length} onClick={finish}>{answered === questions.length ? 'See results' : 'Answer every question to finish'}</button> : <button className="primary" onClick={() => setQuestionIndex(i => i + 1)}>{(question.kind === 'choice' ? picked : typed.trim()) ? 'Next question' : 'Skip for now'}</button>}</div>
        <div className="quiz-tools"><button className="text-button" onClick={() => navigate('Tutor')}>{hintsOn ? 'Ask for a hint' : 'Ask Recall AI'}</button><button className="text-button" onClick={() => { setQuestions([]); setAnswers([]); resetSession() }}>New quiz</button></div>
        </>}
      </>}
    </section>}
    {shown === 'Tutor' && <section className="content" aria-label="Recall AI"><HintCoach key={sessionKey} questions={questions} current={questionIndex} notes={notes} topics={topics} token={account?.token} chats={account ? chats : []} onChats={account ? setChats : undefined} onSignIn={() => navigate('Profile')} />{questions.length > 0 && <div className="quiz-tools"><button className="text-button" onClick={() => navigate('Practice')}>Back to your quiz</button></div>}</section>}
    </div>
  </main>
}
export default App
