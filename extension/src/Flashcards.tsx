import { useEffect, useMemo, useState } from 'react'
import { makeQuestions } from './quiz'
import { currentEngine } from './ai'
import { aiCards } from './aiStudy'

type Card = { front: string; back: string }
export default function Flashcards({ notes, onNotes }: { notes: string; onNotes: () => void }) {
  const basic = useMemo<Card[]>(() => makeQuestions(notes, 15, 'long').map(q => ({ front: q.topic ?? '', back: q.answer })), [notes])
  const [written, setWritten] = useState<Card[] | null>(null)
  const cards = written ?? basic
  const [deck, setDeck] = useState(() => basic.map((_, i) => i))
  const [position, setPosition] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [again, setAgain] = useState<number[]>([])
  const [canWrite, setCanWrite] = useState(false)
  const [writing, setWriting] = useState(false)
  const [note, setNote] = useState('')
  useEffect(() => { let active = true; void currentEngine().then(engine => { if (active) setCanWrite(engine.kind !== 'none') }); return () => { active = false } }, [])
  const card = cards[deck[position]]
  const done = position >= deck.length
  function mark(known: boolean) {
    if (!known) setAgain(previous => [...previous, deck[position]])
    setPosition(position + 1); setRevealed(false)
  }
  function restart(next: number[]) { setDeck(next); setPosition(0); setAgain([]); setRevealed(false) }
  async function write() {
    setWriting(true); setNote('')
    try {
      const next = await aiCards(notes, 12)
      if (next.length) { setWritten(next); restart(next.map((_, i) => i)) } else setNote('The AI did not return usable cards. Try again.')
    } catch (failure) { setNote(failure instanceof Error ? failure.message : 'Could not write cards.') }
    setWriting(false)
  }
  return <section className="content"><div className="page-heading"><h2>Flashcards</h2></div>
    {canWrite && notes.trim() && <button className="secondary" disabled={writing} onClick={() => void write()}>{writing ? 'Writing cards...' : written ? 'Write a new set with AI' : 'Write smarter cards with AI'}</button>}
    {note && <p className="error" role="alert">{note}</p>}
    {!cards.length ? <div className="empty"><h3>No cards yet</h3><p>Add notes with definitions or explanations and cards appear here.</p><button className="primary" onClick={onNotes}>Add notes</button></div>
    : done ? <><div className="flashcard flashcard--done"><span className="field-label">Deck finished</span><h3>{deck.length - again.length} of {deck.length} known</h3><p>{again.length ? `${again.length} card${again.length === 1 ? '' : 's'} to go over again.` : 'You knew every card in this round.'}</p></div><div className="button-row">{again.length > 0 && <button className="primary" onClick={() => restart(again)}>Review the {again.length} I missed</button>}<button className={again.length ? 'secondary' : 'primary'} onClick={() => restart(cards.map((_, i) => i))}>Restart deck</button></div></>
    : <><div className="quiz-progress"><div><span>Card {position + 1} of {deck.length}</span><span>{again.length} to review</span></div><progress value={position} max={deck.length} aria-label="Cards completed" /></div>
      <button type="button" className={`flashcard${revealed ? ' flashcard--revealed' : ''}`} aria-live="polite" onClick={() => setRevealed(!revealed)}><span className="field-label">{revealed ? 'Answer' : 'Do you know this?'}</span><h3>{card.front}</h3>{revealed ? <p>{card.back}</p> : <span className="flashcard-tip">Tap to flip</span>}</button>
      {revealed ? <div className="button-row"><button className="secondary" onClick={() => mark(false)}>Still learning</button><button className="primary" onClick={() => mark(true)}>Got it</button></div> : <button className="primary" onClick={() => setRevealed(true)}>Show answer</button>}</>}
  </section>
}
