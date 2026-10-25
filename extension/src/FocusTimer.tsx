import { useEffect, useRef, useState } from 'react'

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
  function pause() {
    setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)))
    setRunning(false)
  }
  function reset(next = minutes) { setRunning(false); setFinished(false); setRemaining(next * 60) }
  return <section className="focus-panel" aria-labelledby="focus-title">
    <h2 id="focus-title">Focus</h2>
    <div className="focus-durations" role="group" aria-label="Session duration">{[15, 25, 45].map(value => <button key={value} aria-pressed={minutes === value} onClick={() => { setMinutes(value); reset(value) }}>{value} min</button>)}</div>
    <div className="focus-clock" role="timer" aria-label={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds remaining`}>{String(Math.floor(remaining / 60)).padStart(2, '0')}<span>:</span>{String(remaining % 60).padStart(2, '0')}</div>
    <progress value={minutes * 60 - remaining} max={minutes * 60} aria-label="Focus session progress" />
    <p className="focus-status" role="status">{finished ? 'Session complete' : running ? 'Focus session running' : remaining === minutes * 60 ? 'Ready' : 'Session paused'}</p>
    <button className="primary" onClick={running ? pause : start}>{running ? 'Pause session' : finished ? 'Restart session' : 'Start focus'}</button>
    <button className="text-button" onClick={() => reset()}>Reset timer</button>
    
    <section className="deep-learn-preview" aria-labelledby="deep-learn-title">
      <div className="deep-learn-heading"><h3 id="deep-learn-title">Deep Learn</h3><span>Planned</span></div>
      <div className="camera-placeholder"><svg viewBox="0 0 48 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 16S11 4 24 4s21 12 21 12-8 12-21 12S3 16 3 16Z"/><circle cx="24" cy="16" r="6"/><path d="M5 3h7M5 3v6M43 3h-7M43 3v6M5 29h7M5 29v-6M43 29h-7M43 29v-6"/></svg><strong>Webcam eye detection</strong><span>Preview only - camera is off</span></div>
      
      <button className="secondary" disabled>Coming soon</button>
      <details><summary>How it is planned to work</summary><p>Optional camera access, personal calibration and an eye-landmark or gaze model. The goal is on-device processing with no saved or uploaded video. Eye direction is only a rough signal, not proof of attention. No camera capture or detection is implemented.</p></details>
    </section>
  </section>
}
