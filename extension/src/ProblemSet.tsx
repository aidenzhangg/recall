import { useState } from 'react'
import { problemSet } from './aiStudy'
import type { Difficulty, ProblemSet as Written } from './aiStudy'
import { examQuestions } from './exam'
import { downloadPdf } from './pdfExport'
import { makeQuestions } from './quiz'

type Props = { notes: string; suggestions: string[]; weak: string[]; onPractise: (prompts: string[]) => void }
const COUNTS = [5, 10, 15, 20] as const
const LEVELS: [Difficulty, string][] = [['easier', 'Easier'], ['same', 'Exam level'], ['harder', 'Harder']]

/** Without a model, a simpler set is built from the note sentences so the feature still works. */
function fromNotes(notes: string, topic: string, count: number): Written {
  const questions = makeQuestions(notes, count, 'mixed', topic)
  if (!questions.length) throw new Error(notes.trim() ? 'Nothing in your notes matched that topic. Try another topic or leave it empty.' : 'Add notes first, or sign in to use Recall AI.')
  const problems = questions.map((q, i) => `${i + 1}. ${q.prompt}${q.options?.length ? `\n${q.options.map((option, n) => `   (${'abcd'[n]}) ${option}`).join('\n')}` : ''}`).join('\n\n')
  const answers = questions.map((q, i) => `${i + 1}. ${q.answer}${q.explanation ? ` - ${q.explanation}` : ''}`).join('\n')
  return { problems, answers, label: 'your notes' }
}

/** A printable set of practice problems on one topic, aimed at what you keep missing. */
export default function ProblemSet({ notes, suggestions, weak, onPractise }: Props) {
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState<number>(10)
  const [difficulty, setDifficulty] = useState<Difficulty>('same')
  const [extra, setExtra] = useState('')
  const [answersIncluded, setAnswersIncluded] = useState(true)
  const [set, setSet] = useState<Written | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    setBusy(true); setError('')
    try { setSet(await problemSet({ notes, topic, count, difficulty, extra, weak })) }
    catch (failure) {
      const reason = failure instanceof Error ? failure.message : ''
      try { setSet(fromNotes(notes, topic, count)); if (reason !== 'no-ai') setError(`${reason} Made a simpler set from your notes instead.`) }
      catch (fallback) { setError(fallback instanceof Error ? fallback.message : 'Could not make a problem set. Try again.') }
    } finally { setBusy(false) }
  }
  const title = `${topic.trim() || 'Practice'} problem set`
  function download() {
    if (!set) return
    void downloadPdf({ title, subtitle: `${count} problems · ${LEVELS.find(([value]) => value === difficulty)?.[1]}`, fileName: `${title}.pdf`,
      sections: [{ text: set.problems }, ...(answersIncluded && set.answers ? [{ heading: 'Answers', text: set.answers, newPage: true }] : [])] })
  }

  if (set) {
    const prompts = examQuestions(set.problems, 30)
    return <div className="prediction">
      <div className="button-row"><button className="primary" onClick={download}>Download PDF</button>{prompts.length > 0 && <button className="secondary" onClick={() => onPractise(prompts)}>Answer it here</button>}<button className="ghost" onClick={() => setSet(null)}>Change settings</button></div>
      <article className="paper" aria-label={title}><p className="paper-tag">{title} · from {set.label}</p><div className="paper-text">{set.problems}</div>
        {set.answers && <details className="paper-answers"><summary>Show answers</summary><div className="paper-text">{set.answers}</div></details>}
      </article>
      <label className="check-row"><input type="checkbox" checked={answersIncluded} onChange={e => setAnswersIncluded(e.target.checked)} />Put the answers at the back of the PDF</label>
      <div className="button-row"><button className="secondary" disabled={busy} onClick={() => void create()}>{busy ? 'Writing...' : 'New version'}</button></div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  }
  return <div className="card problem-card">
    <div><strong>Problem set</strong><p>Practice problems on one topic, with worked answers, as a PDF you can print.</p></div>
    <label className="control-label">Topic<input value={topic} onChange={e => setTopic(e.target.value)} maxLength={120} placeholder="e.g. quadratic equations, osmosis, the French Revolution" /></label>
    {suggestions.length > 0 && <div className="chips" aria-label="Suggested topics">{suggestions.slice(0, 6).map(item => <button key={item} type="button" className="chip" onClick={() => setTopic(item)}>{weak.includes(item) ? `Missed: ${item}` : item}</button>)}</div>}
    <div className="problem-options">
      <div><span className="field-label">Problems</span><div className="segmented" role="group" aria-label="Number of problems">{COUNTS.map(value => <button key={value} type="button" aria-pressed={count === value} onClick={() => setCount(value)}>{value}</button>)}</div></div>
      <div><span className="field-label">Difficulty</span><div className="segmented" role="group" aria-label="Difficulty">{LEVELS.map(([value, label]) => <button key={value} type="button" aria-pressed={difficulty === value} onClick={() => setDifficulty(value)}>{label}</button>)}</div></div>
    </div>
    <label className="control-label">Anything else? <span className="optional">optional</span><input value={extra} onChange={e => setExtra(e.target.value)} maxLength={300} placeholder="e.g. only word problems, no calculators" /></label>
    <button className="primary" disabled={busy} onClick={() => void create()}>{busy ? 'Writing your problems...' : 'Create problem set'}</button>
    {error && <p className="error" role="alert">{error}</p>}
  </div>
}
