import { useEffect, useState } from 'react'
import { currentEngine } from './ai'
import { markScheme, predictPaper } from './aiStudy'
import { examQuestions } from './exam'

type Props = { source: string; name: string; onPractise: (questions: string[]) => void; onConnect: () => void }
/** Writes a new exam in the same format as an imported past paper, with different questions. */
export default function PredictionPaper({ source, name, onPractise, onConnect }: Props) {
  const [ready, setReady] = useState<boolean | null>(null)
  const [paper, setPaper] = useState('')
  const [scheme, setScheme] = useState('')
  const [busy, setBusy] = useState<'' | 'paper' | 'scheme'>('')
  const [error, setError] = useState('')
  const [cut, setCut] = useState(false)
  useEffect(() => { let active = true; void currentEngine().then(engine => { if (active) setReady(engine.kind !== 'none') }); return () => { active = false } }, [])
  async function write() {
    setBusy('paper'); setError(''); setScheme('')
    try { const written = await predictPaper(source); setPaper(written.text); setCut(written.cut) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not write the paper. Try again.') }
    finally { setBusy('') }
  }
  async function answers() {
    setBusy('scheme'); setError('')
    try { setScheme(await markScheme(paper)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not write the mark scheme. Try again.') }
    finally { setBusy('') }
  }
  const questions = paper ? examQuestions(paper, 40) : []
  if (!paper) return <div className="card paper-card">
    <div><strong>Prediction paper</strong><p>A new exam in the same format as {name}: same sections, numbering and marks, with different questions on the same topics.</p></div>
    {ready === false ? <button className="secondary" onClick={onConnect}>Connect a free AI to use this</button>
      : <button className="primary" disabled={!!busy || ready === null} onClick={() => void write()}>{busy ? 'Writing your paper...' : 'Write a prediction paper'}</button>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>
  return <div className="prediction">
    <div className="button-row no-print"><button className="primary" onClick={() => window.print()}>Save as PDF</button>{questions.length > 0 && <button className="secondary" onClick={() => onPractise(questions)}>Answer it here</button>}</div>
    <article className="paper" aria-label="Prediction paper"><p className="paper-tag">Prediction paper · practice only</p><div className="paper-text">{paper}</div>
      {scheme && <><h3>Mark scheme</h3><div className="paper-text">{scheme}</div></>}
    </article>
    <div className="button-row no-print"><button className="secondary" disabled={!!busy} onClick={() => void answers()}>{busy === 'scheme' ? 'Writing...' : scheme ? 'Rewrite mark scheme' : 'Add mark scheme'}</button><button className="secondary" disabled={!!busy} onClick={() => void write()}>{busy === 'paper' ? 'Writing...' : 'New version'}</button></div>
    {cut && <p className="muted no-print">The original was long, so this covers the first part of it.</p>}
    <p className="muted no-print">Written by AI as a guess at similar questions. It is not a real or leaked exam and can contain mistakes.</p>
    {error && <p className="error no-print" role="alert">{error}</p>}
  </div>
}
