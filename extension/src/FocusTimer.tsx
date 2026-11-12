import { useCallback, useEffect, useRef, useState } from 'react'
import FocusGuard from './FocusGuard'

export default function FocusTimer({ onComplete }: { onComplete: () => void }) {
  const [minutes, setMinutes] = useState(25)
  const [remaining, setRemaining] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const deadline = useRef(0)
  useEffect(() => {
    if (!running) return
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))
      setRemaining(seconds)
      if (seconds === 0) { setRunning(false); setFinished(true); onComplete() }
    }
    const interval = window.setInterval(tick, 250)
    return () => window.clearInterval(interval)
  }, [running, onComplete])
  function start() {
    const seconds = remaining > 0 ? remaining : minutes * 60
    deadline.current = Date.now() + seconds * 1000
    setRemaining(seconds); setFinished(false); setRunning(true)
  }
  const pause = useCallback(() => {
    setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)))
    setRunning(false)
  }, [])
  function reset(next = minutes) { setRunning(false); setFinished(false); setRemaining(next * 60) }
  const total = minutes * 60
  const circumference = 2 * Math.PI * 88
  return <section className="content focus-view" aria-labelledby="focus-title">
    <div className="page-heading"><h2 id="focus-title">Focus</h2><p>Work in timed sessions. Finishing one adds today to your streak.</p></div>
    <div className="card focus-panel">
      <div className="focus-durations" role="group" aria-label="Session duration">{[15, 25, 45, 60].map(value => <button key={value} aria-pressed={minutes === value} onClick={() => { setMinutes(value); reset(value) }}>{value} min</button>)}</div>
      <div className="focus-dial">
        <svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="88" className="dial-track" /><circle cx="100" cy="100" r="88" className="dial-fill" strokeDasharray={circumference} strokeDashoffset={circumference * (remaining / total)} transform="rotate(-90 100 100)" /></svg>
        <div><div className="focus-clock" role="timer" aria-label={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds remaining`}>{String(Math.floor(remaining / 60)).padStart(2, '0')}<span>:</span>{String(remaining % 60).padStart(2, '0')}</div><p className="focus-status" role="status">{finished ? 'Session complete' : running ? 'Focusing' : remaining === total ? 'Ready' : 'Paused'}</p></div>
      </div>
      <div className="button-row"><button className="primary" onClick={running ? pause : start}>{running ? 'Pause' : finished ? 'Start again' : remaining === total ? 'Start focus' : 'Resume'}</button><button className="secondary" onClick={() => reset()}>Reset</button></div>
    </div>
    <FocusGuard running={running} onAway={pause} onBack={() => { if (!running && !finished && remaining < total) start() }} />
  </section>
}
