import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { checkHealth, requestQuiz } from './api'
import { readPdf } from './pdf'
import { aiQuestions } from './aiStudy'
import HintCoach from './HintCoach'
import FocusTimer from './FocusTimer'
import Profile from './Profile'
import Connect from './Connect'
import WebsiteBlocker from './WebsiteBlocker'
import { appendMaterial } from './material'
import Flashcards from './Flashcards'
import { accountRequest, parseProgress, readLocalWorkspace, readToken, rememberToken, saveLocalWorkspace, saveProgress } from './account'
import type { Account, SavedProgress } from './account'
import { dateKey, recentDays, streakLength, readStudyDays } from './activity'
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
  // A guest's workspace is restored from this browser; signing in replaces it with the account's copy.
  const [local] = useState(readLocalWorkspace)
  const [studyDays, setStudyDays] = useState(() => [...new Set([...(local?.studyDays ?? []), ...readStudyDays()])].sort().slice(-366))
  useEffect(() => {
    try { localStorage.setItem('recall-study-days', JSON.stringify(studyDays)) } catch { /* Works in memory if storage is unavailable. */ }
  }, [studyDays])
  const recordStudyDay = useCallback(() => {
    const today = dateKey(new Date())
    setStudyDays(previous => previous.includes(today) ? previous : [...previous, today].sort().slice(-366))
  }, [])
  const [importing, setImporting] = useState(false)
  const [importReport, setImportReport] = useState<{ name: string; pages: number; warnings: string[] } | null>(null)
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
  const [hintsOn, setHintsOn] = useState(local?.hintsOn ?? true)
  const [notes, setNotes] = useState(local?.notes ?? '')
  const [noteName, setNoteName] = useState(local?.noteName ?? 'Pasted notes')
  const [error, setError] = useState('')
  const [serverUp, setServerUp] = useState<boolean | null>(null)
  const generationId = useRef(0)
  const [generating, setGenerating] = useState(false)
  const [quizOrigin, setQuizOrigin] = useState('')
  const [count, setCount] = useState(local?.count ?? 5)
  const [focusTopic, setFocusTopic] = useState('')
  const [review, setReview] = useState<ReviewItem[]>(local?.review ?? [])
  const [adaptive, setAdaptive] = useState(local?.adaptive ?? true)
  const [format, setFormat] = useState<QuizFormat>(local?.format ?? 'choice')
  const [questions, setQuestions] = useState<Question[]>(local?.questions ?? [])
  const [answers, setAnswers] = useState<string[]>(local?.answers ?? [])
  const [submitted, setSubmitted] = useState(local?.submitted ?? false)
  const [questionIndex, setQuestionIndex] = useState(local?.questionIndex ?? 0)
  // Sources whose first multiple-choice pick was wrong; they still count as missed for review.
  const [firstWrong, setFirstWrong] = useState<string[]>([])
  useEffect(() => { checkHealth().then(setServerUp) }, [])
  const [savedToken] = useState(readToken)
  const [account, setAccount] = useState<Account | null>(null)
  const [restoring, setRestoring] = useState(!!savedToken)
  const [syncStatus, setSyncStatus] = useState('Not saved yet')
  const progress = useMemo<SavedProgress>(() => ({ version: 1, notes, noteName, count, format, review, adaptive, hintsOn, questions, answers, submitted, questionIndex, studyDays }), [notes, noteName, count, format, review, adaptive, hintsOn, questions, answers, submitted, questionIndex, studyDays])
  const applyProgress = useCallback((saved: SavedProgress) => {
    setReview(saved.review ?? []); setAdaptive(saved.adaptive !== false); setNotes(saved.notes); setNoteName(saved.noteName); setCount(saved.count); setFormat(saved.format ?? 'blank'); setHintsOn(saved.hintsOn)
    setQuestions(saved.questions); setAnswers(saved.answers); setSubmitted(saved.submitted)
    setQuestionIndex(saved.questionIndex); setStudyDays(saved.studyDays)
  }, [])
  function authenticate(next: Account, saved: SavedProgress | null) {
    if (saved) applyProgress(saved)
    rememberToken(next.token); setAccount(next); setSyncStatus('Saving progress')
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
      setSyncStatus('Saving progress')
      saveProgress(account, progress, AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]))
        .then(() => { if (!abort.signal.aborted) setSyncStatus('All progress saved') })
        .catch(() => { if (!abort.signal.aborted) setSyncStatus('Not saved - open Profile to retry or sign in again') })
    }, 800)
    return () => { window.clearTimeout(timer); abort.abort() }
  }, [account, progress])
  useEffect(() => {
    if (account || restoring) return
    const timer = window.setTimeout(() => saveLocalWorkspace(progress), 600)
    return () => window.clearTimeout(timer)
  }, [account, restoring, progress])
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
    applyProgress({ version: 1, notes: '', noteName: 'Pasted notes', count: 5, hintsOn: true, questions: [], answers: [], submitted: false, questionIndex: 0, studyDays: [] })
    setSyncStatus('Signed out')
  }
  function editNotes(text: string) {
    generationId.current++; setGenerating(false)
    setNotes(text); setNoteName('Pasted notes'); setImportReport(null)
    setQuestions([]); setAnswers([]); setSubmitted(false); setQuestionIndex(0); setQuizOrigin('')
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
      setQuestions([]); setAnswers([]); setSubmitted(false); setQuestionIndex(0); setReview([]); setQuizOrigin(''); setFocusTopic('')
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
      setQuestions(next); setAnswers(next.map(() => '')); setSubmitted(false); setFirstWrong([])
      setQuestionIndex(0); setTab('Practice')
    } finally { if (id === generationId.current) setGenerating(false) }
  }
  const paper = useMemo(() => examQuestions(notes), [notes])
  function startPaper() {
    const next = paper.slice(0, count).map((prompt): Question => ({ kind: 'long', prompt, answer: 'Past papers do not include an answer key. Check your answer against your course notes or the mark scheme.' }))
    generationId.current++; setGenerating(false); setError('')
    setQuestions(next); setAnswers(next.map(() => '')); setSubmitted(false); setQuestionIndex(0); setFirstWrong([]); setQuizOrigin('Past-paper practice - self-review')
  }
  function openWorkspace() {
    if (typeof chrome !== 'undefined' && chrome.tabs) void chrome.tabs.create({ url: chrome.runtime.getURL('index.html') })
    else window.open(window.location.href, '_blank', 'noopener,noreferrer')
  }
  function navigate(next: Tab) { generationId.current++; setGenerating(false); setTab(next); setError('') }
  const words = notes.trim() ? notes.trim().split(/\s+/).length : 0
  const answered = answers.filter(a => a.trim()).length
  const graded = questions.filter(q => q.kind !== 'long').length
  const score = questions.filter((q, i) => isCorrect(q, answers[i])).length
  const question = questions[questionIndex]
  const picked = question?.kind === 'choice' ? answers[questionIndex] ?? '' : ''
  const pickedRight = !!picked && isCorrect(question, picked)
  // With Hints Mode on a wrong pick can be retried; with it off the answer is shown and the question locks.
  const choiceLocked = submitted || pickedRight || (!!picked && !hintsOn)
  function choose(option: string) {
    setAnswers(previous => previous.map((a, i) => i === questionIndex ? option : a))
    const source = question.source
    if (source && !isCorrect(question, option)) setFirstWrong(previous => previous.includes(source) ? previous : [...previous, source])
  }
  const weak = useMemo(() => review.filter(item => item.misses > item.successes).sort((a, b) => (b.misses - b.successes) - (a.misses - a.successes)).slice(0, 4), [review])
  const topics = useMemo(() => [...new Set(makeQuestions(notes, 4, 'long').map(q => q.topic ?? ''))].filter(Boolean), [notes])
  const tools: { tab: Tab; title: string; text: string; planned?: boolean }[] = [
    { tab: 'Tutor', title: 'Recall AI', text: 'Chat with an AI tutor that knows your notes.' },
    { tab: 'Practice', title: 'Adaptive quizzes', text: 'Practice that brings back the topics you missed.' },
    { tab: 'Cards', title: 'Flashcards', text: 'Flip through key terms and sort what you know.' },
    { tab: 'Notes', title: 'Past papers', text: 'Import an old exam and practise its questions.' },
    { tab: 'Focus', title: 'Focus timer', text: 'Timed sessions that build your study streak.' },
    { tab: 'Block', title: 'Block sites', text: 'Keep distracting websites closed while you study.' },
    { tab: 'Connect', title: 'Recall Connect', text: 'Send photos of notes from your phone to this PC.' },
    { tab: 'Focus', title: 'Camera focus', text: 'Checks in when you look away for too long.' },
  ]
  return <main className="panel">
    <header className="masthead"><div className="brand"><span className="brand-mark" aria-hidden="true">r</span><div><h1>Recall</h1></div></div><div className="header-controls"><button className="save-status" onClick={() => navigate('Profile')}>{account ? syncStatus : 'Saved on this device'}</button><button className="expand-button" onClick={openWorkspace} aria-label="Open Recall in a new tab" title="Open in a new tab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></svg></button></div></header>

    <nav className="tabs" aria-label="Study workspace">{(['Dashboard', 'Notes', 'Practice', 'Tutor', 'Cards', 'Focus', 'Block', 'Connect'] as Tab[]).map(name => <button key={name} title={name === 'Tutor' ? 'Recall AI' : name === 'Cards' ? 'Flashcards' : name === 'Block' ? 'Block sites' : name} className={`tab${tab === name ? ' active' : ''}`} aria-current={tab === name ? 'page' : undefined} onClick={() => navigate(name)}><NavIcon name={name} /><span className="tab-label">{name === 'Cards' ? 'Flashcards' : name === 'Block' ? 'Block sites' : name === 'Tutor' ? 'Recall AI' : name}</span></button>)}<section className="agent-bar" aria-label="Study assistance controls"><div><strong>Hints Mode</strong></div><div className={`mode-toggle${hintsOn ? ' mode-toggle--on' : ''}`} role="group" aria-label="Hints Mode"><span className="mode-indicator" aria-hidden="true" /><button aria-pressed={hintsOn} onClick={() => setHintsOn(true)}>On</button><button aria-pressed={!hintsOn} onClick={() => setHintsOn(false)}>Off</button></div></section><div className="theme-switch" role="group" aria-label="Appearance"><button type="button" aria-label="Light mode" title="Light mode" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg></button><button type="button" aria-label="Dark mode" title="Dark mode" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z" /></svg></button></div></nav>
    {restoring && <p className="restore-status" role="status">Restoring your account</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div inert={restoring} className={tab === 'Tutor' ? 'workspace workspace--tutor' : tab === 'Dashboard' ? 'workspace workspace--dashboard' : 'workspace'}>
    {tab === 'Dashboard' && <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="page-heading"><h2 id="dashboard-title">{account ? `Welcome back, ${account.user.name.split(' ')[0]}` : 'Workspace'}</h2><p>Learn from your own course material with practice, hints and review.</p></div>
      <section className="session-overview" aria-label="Current material">
        <div className="overview-heading"><span>Current material</span><button className="text-button" onClick={() => navigate('Notes')}>{words ? 'Edit notes' : 'Add notes'}</button></div>
        <h3>{words ? noteName : 'No notes added'}</h3>
        <dl className="session-stats"><div><dt>Words</dt><dd>{words}</dd></div><div><dt>Answered</dt><dd>{answered}<span> / {questions.length}</span></dd></div><div><dt>Last result</dt><dd>{submitted ? graded ? `${score}/${graded}` : 'Self-review' : '-'}</dd></div></dl>
        {questions.length > 0 && <progress value={answered} max={questions.length} aria-label="Practice questions answered" />}
        <button className="primary" onClick={() => navigate(questions.length ? 'Practice' : words ? 'Practice' : 'Notes')}>{questions.length ? 'Continue practice' : words ? 'Create quiz' : 'Add study material'}</button>
      </section>
      {weak.length > 0 && <section className="card weak-topics" aria-labelledby="weak-title"><div className="card-heading"><h3 id="weak-title">Needs practice</h3><span>from your missed answers</span></div><ul>{weak.map(item => <li key={item.source}><div><strong>{item.topic}</strong><span>Missed {item.misses}x{item.successes ? `, correct ${item.successes}x` : ''}</span></div><div className="chips" aria-label={`Look up ${item.topic}`}>{resourceLinks(item.topic).slice(0, 3).map(link => <a key={link.label} className="chip" href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}</div></li>)}</ul><button className="primary" disabled={generating || !notes.trim()} onClick={() => void generate(true)}>{generating ? 'Preparing...' : 'Practice weak topics'}</button></section>}
      <section className="tools" aria-labelledby="tools-title"><h3 id="tools-title">Study tools</h3><div className="feature-grid">{tools.map(tool => <button key={tool.title} className="feature" onClick={() => navigate(tool.tab)}><NavIcon name={tool.tab} /><strong>{tool.title}{tool.planned && <span className="pill">Planned</span>}</strong><span>{tool.text}</span></button>)}</div></section>
      <section className="card activity-summary" aria-label="Study activity"><div><h3>Activity</h3><span>{streakLength(studyDays)}-day streak</span></div><div className="streak-days" aria-label="Study activity over the last seven days">{recentDays().map(day => <span key={day} className={studyDays.includes(day) ? 'streak-day active' : 'streak-day'} title={`${day}: ${studyDays.includes(day) ? 'Studied' : 'No activity'}`} aria-label={`${day}: ${studyDays.includes(day) ? 'Studied' : 'No activity'}`}>{Number(day.slice(-2))}</span>)}</div></section>
    </section>}
    {tab === 'Block' && <WebsiteBlocker />}
    {tab === 'Connect' && <Connect key={account?.user.id ?? 'guest'} account={account} onSignIn={() => navigate('Profile')} onImport={text => { setNotes(appendMaterial(notes, text)); setNoteName('Imported material'); navigate('Notes') }} />}
    {tab === 'Cards' && <Flashcards key={notes} notes={notes} onNotes={() => navigate('Notes')} />}
    {tab === 'Profile' && <Profile account={account} syncStatus={syncStatus} onAuthenticated={authenticate} onSave={saveNow} onSignOut={signOut} />}
    <div hidden={tab !== 'Focus'}><FocusTimer key={account?.user.id ?? 'guest'} onComplete={recordStudyDay} /></div>
    {tab === 'Notes' && <section className="content" aria-labelledby="notes-title">
      <div className="page-heading"><h2 id="notes-title">Notes</h2><p>Everything Recall asks or answers comes from the material you add here.</p></div>
      <div className="material-panel"><div className="material-heading"><NavIcon name="Notes" /><div><strong>{words ? noteName : 'Add course notes'}</strong><p>Notes or past paper / TXT, MD, PDF / 20 MB</p></div></div><input ref={inputRef} type="file" className="visually-hidden" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" aria-label="Upload course notes" tabIndex={-1} onChange={e => void handleFile(e)} /><button className="secondary" disabled={importing} onClick={() => inputRef.current?.click()}>{importing ? 'Importing...' : words ? 'Replace material' : 'Import material'}</button></div>
      {importReport && importReport.name === noteName && <div className="import-report" role="status"><p>{importReport.pages ? `${importReport.pages} pages processed / ` : ''}{words.toLocaleString()} words extracted. Review the text below.</p>{importReport.warnings.length > 0 && <details open><summary>Some PDF content may be missing</summary><ul>{importReport.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}</div>}
      <div className="editor"><div className="field-heading"><label htmlFor="notes">Paste or edit notes</label><span>{words} words</span></div><textarea id="notes" maxLength={200000} value={notes} onChange={e => editNotes(e.target.value)} placeholder="Paste definitions, notes, or a topic you want to review" /></div>
      <button className="primary" disabled={!notes.trim() || importing} onClick={() => navigate('Practice')}>Set up practice </button>
    </section>}
    {tab === 'Practice' && <section className="content" aria-labelledby="practice-title">
      <div className="page-heading"><h2 id="practice-title">{questions.length ? 'Practice session' : 'New quiz'}</h2></div>
      {!questions.length ? <>{paper.length > 0 && <div className="card paper-card"><div><strong>Past paper detected</strong><p>{paper.length} exam question{paper.length === 1 ? '' : 's'} found in this material. Answer them one at a time and review each yourself.</p></div><button className="secondary" onClick={startPaper}>Practise {Math.min(count, paper.length)} past-paper questions</button></div>}<div className="source"><span className="field-label">Study material</span><strong>{words ? noteName : 'No notes added'}</strong><button className="text-button" onClick={() => navigate('Notes')}>{words ? 'Edit notes' : 'Add notes'} </button></div><div className="settings"><label>Format<select value={format} onChange={e => setFormat(e.target.value as QuizFormat)}><option value="blank">Fill in the blank</option><option value="choice">Multiple choice</option><option value="long">Long answer</option><option value="mixed">Mixed</option></select></label><label>Length<select value={count} onChange={e => setCount(Number(e.target.value))}><option value={5}>5 questions</option><option value={10}>10 questions</option><option value={15}>15 questions</option></select></label></div><label className="focus-topic">Focus topic (optional)<input type="text" maxLength={200} value={focusTopic} onChange={e => setFocusTopic(e.target.value)} placeholder="e.g. cellular respiration" /></label><p className="muted">With AI on (see Recall AI settings) questions are written fresh from your notes. Otherwise they are built from the definitions in them.</p><label className="adaptive-control"><input type="checkbox" checked={adaptive} onChange={e => setAdaptive(e.target.checked)} /><span>Prioritize topics I missed</span></label><p className="muted">{review.filter(item => item.misses > item.successes).length} topics need practice. Written answers use self-review.</p><button className="primary" disabled={!notes.trim() || generating} onClick={() => void generate()}>{generating ? 'Preparing...' : 'Start practice'} </button></> : <>
        <p className="muted" role="status">{quizOrigin}</p><div className="quiz-progress"><div><span>Question {questionIndex + 1} of {questions.length}</span><span>{answered} answered</span></div><progress value={answered} max={questions.length} aria-label="Questions answered" /></div>
        <div className="question"><label id="question-prompt" htmlFor={`answer-${questionIndex}`}>{question.prompt}</label>
          {question.kind === 'choice' ? <fieldset className="choice-options" aria-labelledby="question-prompt"><legend className="visually-hidden">Choose an answer</legend>{question.options?.map(option => <label key={option} className={option === picked ? (pickedRight ? 'choice-right' : 'choice-wrong') : picked && !pickedRight && !hintsOn && isCorrect(question, option) ? 'choice-right' : undefined}><input type="radio" name={`answer-${questionIndex}`} value={option} checked={picked === option} disabled={choiceLocked} onChange={() => choose(option)} /><span>{option}</span></label>)}</fieldset>
          : question.kind === 'long' ? <textarea id={`answer-${questionIndex}`} value={answers[questionIndex]} disabled={submitted} placeholder="Write your explanation" onChange={e => setAnswers(previous => previous.map((a, i) => i === questionIndex ? e.target.value : a))} />
          : <input id={`answer-${questionIndex}`} autoComplete="off" value={answers[questionIndex]} disabled={submitted} placeholder="Your answer" onChange={e => setAnswers(previous => previous.map((a, i) => i === questionIndex ? e.target.value : a))} />}
          {question.kind === 'choice' && picked && <p className={pickedRight ? 'correct choice-feedback' : 'feedback choice-feedback choice-feedback--wrong'} role="status">{pickedRight ? 'Correct!' : hintsOn ? 'Not quite. Pick another option or ask for a hint.' : `Not quite. The answer is ${question.answer}.`}</p>}
          {question.kind === 'choice' && picked && question.explanation && (pickedRight || !hintsOn) && <p className="explanation">{question.explanation}</p>}
          {submitted && question.kind !== 'choice' && (question.kind === 'long' ? <div className="feedback"><p>Self-review: this response is not automatically scored.</p>{hintsOn ? <p>Compare your explanation with your notes or ask for a hint.</p> : <><strong>Reference answer</strong><p>{question.answer}</p></>}</div> : <p className={isCorrect(question, answers[questionIndex]) ? 'correct' : 'feedback'}>{isCorrect(question, answers[questionIndex]) ? 'Correct.' : hintsOn ? 'Incorrect. Ask for a hint or retry.' : `Answer: ${question.answer}`}</p>)}
        </div>
        <div className="question-navigation"><button className="text-button" disabled={questionIndex === 0} onClick={() => setQuestionIndex(i => i - 1)}> Previous</button><button className="text-button" disabled={questionIndex === questions.length - 1} onClick={() => setQuestionIndex(i => i + 1)}>Next </button></div>
        {submitted ? <><p className="result" role="status">{graded ? `${score} of ${graded} auto-scored answers correct` : 'Responses ready for self-review'}{questions.length > graded && graded > 0 ? `; ${questions.length - graded} for self-review` : ''}</p><button className="primary" onClick={() => setSubmitted(false)}>Retry answers </button></> : <button className="primary" disabled={answered !== questions.length} onClick={() => { setSubmitted(true); setReview(previous => recordAttempt(previous, questions, answers.map((answer, i) => firstWrong.includes(questions[i].source ?? '') ? '' : answer))); recordStudyDay() }}>Check all answers </button>}
        <div className="quiz-tools"><button className="text-button" onClick={() => navigate('Tutor')}>{hintsOn ? 'Ask for a hint' : 'Ask Recall AI'}</button><button className="text-button" onClick={() => { setQuestions([]); setAnswers([]); setSubmitted(false); setQuestionIndex(0) }}>New session</button></div>
      </>}
    </section>}
    {tab === 'Tutor' && <section className="content" aria-label="Recall AI"><HintCoach key={questions.map(q => q.prompt).join()} questions={questions} current={questionIndex} notes={notes} hintsOn={hintsOn} topics={topics} token={account?.token} />{questions.length > 0 && <button className="text-button return-link" onClick={() => navigate('Practice')}>Back to your quiz</button>}</section>}
    </div>
    <footer className="app-footer">
      <span role="status">{serverUp === null ? 'Checking sync server' : serverUp ? 'Sync server connected' : 'Running on this device'}</span>
      <button type="button" className="text-button" disabled={serverUp === null} onClick={() => { setServerUp(null); checkHealth().then(setServerUp) }}>Check connection</button>
    </footer>
  </main>
}
export default App
