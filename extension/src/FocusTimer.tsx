import { useCallback, useEffect, useRef, useState } from 'react'
import FocusGuard from './FocusGuard'
import { GAZE_LABEL } from './gaze'
import type { GazeState } from './gaze'

/** onBlock turns site blocking on for the session; the list itself belongs to the account. */
export default function FocusTimer({ onComplete, onSession, onBlock }: { onComplete: () => void; onSession: (active: boolean) => void; onBlock: () => void }) {
  const [minutes, setMinutes] = useState(25)
  const [remaining, setRemaining] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const deadline = useRef(0)
  // What the camera currently sees, or null while camera focus is off.
  const [gaze, setGaze] = useState<GazeState | null>(null)
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
    setRemaining(seconds); setFinished(false); setRunning(true); onBlock()
  }
  const pause = useCallback(() => {
    setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)))
    setRunning(false)
  }, [])
  function reset(next = minutes) { setRunning(false); setFinished(false); setRemaining(next * 60) }
  const total = minutes * 60
  // A session is under way from Start until it finishes or is reset, including while paused.
  const active = running || (!finished && remaining < total)
  useEffect(() => { onSession(active) }, [active, onSession])
  const circumference = 2 * Math.PI * 88
  const status = finished ? 'Session complete' : running ? 'Focusing' : remaining === total ? 'Ready' : 'Paused'
  const drifting = running && gaze !== null && gaze !== 'screen'
  return <section className="content focus-view" aria-labelledby="focus-title">
    <div className="page-heading"><h2 id="focus-title">Focus</h2><p>{active ? 'Your blocked sites are locked on until this session ends.' : 'Pick a length and start. Blocked sites lock on until the session ends.'}</p></div>
    <div className={`card focus-panel${running ? ' focus-panel--running' : ''}`}>
      <div className="segmented focus-durations" role="group" aria-label="Session duration">{[15, 25, 45, 60].map(value => <button key={value} aria-pressed={minutes === value} disabled={active} onClick={() => { setMinutes(value); reset(value) }}>{value} min</button>)}</div>
      <div className={`focus-dial${drifting ? ' focus-dial--drifting' : ''}${finished ? ' focus-dial--done' : ''}`}>
        <svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="88" className="dial-track" /><circle cx="100" cy="100" r="88" className="dial-fill" strokeDasharray={circumference} strokeDashoffset={circumference * (remaining / total)} transform="rotate(-90 100 100)" /></svg>
        <div>
          <div className="focus-clock" role="timer" aria-label={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds remaining`}>{String(Math.floor(remaining / 60)).padStart(2, '0')}<span>:</span>{String(remaining % 60).padStart(2, '0')}</div>
          <p className="focus-status" role="status">{status}</p>
          {gaze && <p className={`focus-gaze focus-gaze--${gaze}`}><i aria-hidden="true" />{GAZE_LABEL[gaze]}</p>}
        </div>
      </div>
      <div className="button-row"><button className="primary" onClick={running ? pause : start}>{running ? 'Pause' : finished ? 'Start again' : remaining === total ? 'Start focus' : 'Resume'}</button><button className="secondary" onClick={() => reset()}>{active ? 'End session' : 'Reset'}</button></div>
    </div>
    <FocusGuard running={running} onAway={pause} onBack={() => { if (!running && !finished && remaining < total) start() }} onGaze={setGaze} />
  </section>
}
