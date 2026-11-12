import { useMemo, useState } from 'react'
import { makeQuestions } from './quiz'
export default function Flashcards({ notes, onNotes }: { notes: string; onNotes: () => void }) {
  const cards = useMemo(() => makeQuestions(notes, 15, 'long'), [notes])
  const [deck, setDeck] = useState(() => cards.map((_, i) => i))
  const [position, setPosition] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [again, setAgain] = useState<number[]>([])
  const card = cards[deck[position]]
  const done = position >= deck.length
  function mark(known: boolean) {
    if (!known) setAgain(previous => [...previous, deck[position]])
    setPosition(position + 1); setRevealed(false)
  }
  function restart(next: number[]) { setDeck(next); setPosition(0); setAgain([]); setRevealed(false) }
  return <section className="content"><div className="page-heading"><h2>Flashcards</h2><p>Key terms from your notes. Say the meaning out loud before you flip.</p></div>
    {!cards.length ? <><p className="muted">Add notes with definitions or explanations to create cards.</p><button className="primary" onClick={onNotes}>Add notes</button></>
    : done ? <><div className="flashcard flashcard--done"><span className="field-label">Deck finished</span><h3>{deck.length - again.length} of {deck.length} known</h3><p>{again.length ? `${again.length} card${again.length === 1 ? '' : 's'} to go over again.` : 'You knew every card in this round.'}</p></div>{again.length > 0 && <button className="primary" onClick={() => restart(again)}>Review the {again.length} I missed</button>}<button className={again.length ? 'secondary' : 'primary'} onClick={() => restart(cards.map((_, i) => i))}>Restart full deck</button></>
    : <><div className="quiz-progress"><div><span>Card {position + 1} of {deck.length}</span><span>{again.length} to review</span></div><progress value={position} max={deck.length} aria-label="Cards completed" /></div>
      <button type="button" className={`flashcard${revealed ? ' flashcard--revealed' : ''}`} aria-live="polite" onClick={() => setRevealed(!revealed)}><span className="field-label">{revealed ? 'From your notes' : 'Explain this term'}</span><h3>{card.topic}</h3>{revealed ? <p>{card.answer}</p> : <span className="flashcard-tip">Tap to flip</span>}</button>
      {revealed ? <div className="card-actions"><button className="secondary" onClick={() => mark(false)}>Still learning</button><button className="primary" onClick={() => mark(true)}>Got it</button></div> : <button className="primary" onClick={() => setRevealed(true)}>Reveal answer</button>}
      <button className="text-button" onClick={onNotes}>Edit material</button></>}
  </section>
}
