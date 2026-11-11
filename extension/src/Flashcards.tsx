import { useState } from 'react'
import { makeQuestions } from './quiz'
export default function Flashcards({ notes, onNotes }: { notes: string; onNotes: () => void }) {
  const cards = makeQuestions(notes, 15, 'long')
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const card = cards[index]
  return <section className="content"><div className="page-heading"><h2>Flashcards</h2></div>{card ? <><div className="quiz-progress"><span>{index + 1} / {cards.length}</span></div><div className="flashcard"><span className="field-label">Explain this term</span><h3>{card.topic}</h3>{revealed && <p>{card.answer}</p>}</div><button className="primary" onClick={() => { if (revealed) { setIndex((index+1)%cards.length); setRevealed(false) } else setRevealed(true) }}>{revealed ? 'Next card' : 'Reveal reference'}</button><button className="text-button" onClick={onNotes}>Edit material</button></> : <><p className="muted">Add complete sentences to create cards.</p><button className="primary" onClick={onNotes}>Add notes</button></>}</section>
}
