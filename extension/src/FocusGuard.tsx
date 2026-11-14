import { useEffect, useRef, useState } from 'react'
import { classify, FocusTracker, GAZE_LABEL, GazeCalibrator, signals } from './gaze'
import type { FocusSnapshot, GazeState, Point } from './gaze'

// Google's published face-landmark model. It is fetched once by the browser; camera frames are processed on this device.
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const IDLE: FocusSnapshot = { state: 'none', score: 100, awaySeconds: 0, observedSeconds: 0, checkIn: false, returned: false, lapses: 0, bestStreakSeconds: 0, timeline: [] }
const TIMEOUTS = [[15, '15s'], [30, '30s'], [60, '1 min'], [120, '2 min']] as const
// The pause warning appears once you have been away this long.
const WARN_AFTER = 3
// If no new camera frame arrives for this long, or frames keep failing, the camera is restarted.
const STALL_MS = 4000, MAX_FAILURES = 10, MAX_RESTARTS = 3, RESTART_WINDOW_MS = 60000
type Edge = { start: number; end: number }
type Landmarker = {
  detectForVideo(video: HTMLVideoElement, time: number): { faceLandmarks: Point[][]; faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[] }
  close(): void
}

function chime(frequency = 660) {
  try {
    const audio = new AudioContext(); const tone = audio.createOscillator(); const gain = audio.createGain()
    tone.frequency.value = frequency; gain.gain.setValueAtTime(.08, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + .5)
    tone.connect(gain).connect(audio.destination); tone.start(); tone.stop(audio.currentTime + .5)
    tone.onended = () => void audio.close()
  } catch { /* Sound is optional. */ }
}
const clock = (seconds: number) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`

/** Traces the face outline and eyes over the preview, so you can see what the tracker sees. */
function drawFace(canvas: HTMLCanvasElement, video: HTMLVideoElement, face: Point[] | undefined, edges: Edge[], state: GazeState) {
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight }
  const pen = canvas.getContext('2d')
  if (!pen) return
  pen.clearRect(0, 0, canvas.width, canvas.height)
  if (!face) return
  pen.strokeStyle = state === 'screen' ? '#b4f06e' : '#f7c566'
  pen.lineWidth = Math.max(1.5, canvas.width / 200); pen.lineCap = 'round'; pen.globalAlpha = .85
  pen.beginPath()
  for (const { start, end } of edges) {
    const a = face[start], b = face[end]
    if (!a || !b) continue
    pen.moveTo(a.x * canvas.width, a.y * canvas.height); pen.lineTo(b.x * canvas.width, b.y * canvas.height)
  }
  pen.stroke()
}

type Props = { running: boolean; onAway: () => void; onBack: () => void; onGaze: (state: GazeState | null) => void }
export default function FocusGuard({ running, onAway, onBack, onGaze }: Props) {
  const [on, setOn] = useState(false)
  const [status, setStatus] = useState<'off' | 'starting' | 'live' | 'reconnecting'>('off')
  // Bumped to tear the camera down and start it again after a stall.
  const [attempt, setAttempt] = useState(0)
  const restarts = useRef<number[]>([])
  const calibrator = useRef(new GazeCalibrator())
  const [learning, setLearning] = useState(false)
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState(IDLE)
  const [timeout, setAwayTimeout] = useState(30)
  const [checkIn, setCheckIn] = useState(false)
  const [pausedTimer, setPausedTimer] = useState(false)
  // Chrome does not show the camera question inside the side panel, so it is asked once in a tab.
  const [needsPermission, setNeedsPermission] = useState(false)
  useEffect(() => {
    if (!needsPermission) return
    let status: PermissionStatus | undefined
    const granted = () => { if (status?.state === 'granted') { setNeedsPermission(false); setError(''); setOn(true) } }
    void navigator.permissions?.query({ name: 'camera' as PermissionName }).then(value => { status = value; value.addEventListener('change', granted); granted() }).catch(() => {})
    return () => status?.removeEventListener('change', granted)
  }, [needsPermission])
  function askPermission() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime?.id) void chrome.tabs.create({ url: chrome.runtime.getURL('camera.html') })
    else { setNeedsPermission(false); setOn(true) }
  }
  const video = useRef<HTMLVideoElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const tracker = useRef(new FocusTracker(30))
  // The detection loop outlives renders, so it reads the latest props and check-in state from here.
  const live = useRef({ running, onAway, onBack, paused: false })
  useEffect(() => { live.current = { ...live.current, running, onAway, onBack } }, [running, onAway, onBack])
  useEffect(() => { tracker.current.timeoutSeconds = timeout }, [timeout])
  useEffect(() => {
    if (!on) return
    let stopped = false
    let stream: MediaStream | undefined
    let interval = 0
    let landmarker: Landmarker | undefined
    const element = video.current
    const fresh = attempt === 0
    let restarting = false
    // Restart the camera, unless it has already failed several times in the last minute.
    const recover = () => {
      if (stopped) return
      const now = Date.now()
      restarts.current = [...restarts.current.filter(time => now - time < RESTART_WINDOW_MS), now]
      if (restarts.current.length > MAX_RESTARTS) { setError('The camera keeps stopping. Check that no other app is using it, then turn camera focus off and on.'); setOn(false); return }
      stopped = true; restarting = true
      setAttempt(value => value + 1)
    }
    const start = async () => {
      setStatus(fresh ? 'starting' : 'reconnecting'); setError('')
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false })
        if (stopped || !element) return
        // Unplugging the camera, sleep, or another app taking it ends the track. Start again rather than freeze.
        stream.getVideoTracks().forEach(track => { track.onended = recover })
        element.srcObject = stream
        await element.play()
        const vision = await import('@mediapipe/tasks-vision')
        const files = await vision.FilesetResolver.forVisionTasks(new URL('./mediapipe', location.href).href)
        landmarker = await vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true })
        if (stopped) return
        const edges: Edge[] = [...vision.FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, ...vision.FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, ...vision.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE]
        if (fresh) { tracker.current.reset(); calibrator.current.reset() }
        setStatus('live')
        let failures = 0, lastFrame = -1, lastFrameAt = performance.now()
        interval = window.setInterval(() => {
          const view = element
          if (!landmarker) return
          // A hidden panel is throttled by Chrome. Skip; the tracker does not count the gap either way.
          if (document.visibilityState === 'hidden') { lastFrameAt = performance.now(); return }
          if (view.paused) void view.play().catch(() => {})
          if (view.currentTime !== lastFrame) { lastFrame = view.currentTime; lastFrameAt = performance.now() }
          else if (performance.now() - lastFrameAt > STALL_MS) { recover(); return }
          if (view.readyState < 2) return
          let result: ReturnType<Landmarker['detectForVideo']>
          try { result = landmarker.detectForVideo(view, performance.now()); failures = 0 }
          catch { if (++failures >= MAX_FAILURES) recover(); return }
          const face = result.faceLandmarks[0]
          const shapes = Object.fromEntries((result.faceBlendshapes?.[0]?.categories ?? []).map(shape => [shape.categoryName, shape.score]))
          const read = calibrator.current.read(face ? signals(face, shapes) : null)
          const next = tracker.current.update(classify(read, calibrator.current.baseline), performance.now())
          setLearning(!calibrator.current.calibrated)
          setSnapshot(next)
          if (overlay.current) drawFace(overlay.current, view, face, edges, next.state)
          if (next.checkIn) {
            chime(); setCheckIn(true)
            live.current.paused = live.current.running; setPausedTimer(live.current.running)
            if (live.current.running) live.current.onAway()
          }
          // Looking back at the screen is the answer to "still with it?", so the timer carries on by itself.
          if (next.returned) {
            chime(880); setCheckIn(false)
            if (live.current.paused) live.current.onBack()
            live.current.paused = false
          }
        }, 200)
      } catch (failure) {
        if (stopped) return
        const name = failure instanceof DOMException ? failure.name : ''
        const detail = failure instanceof Error && failure.message ? ` (${failure.message.slice(0, 140)})` : ''
        if (name === 'NotAllowedError') { setNeedsPermission(true); setError('') }
        else setError(name === 'NotFoundError' ? 'No camera was found on this computer.'
          : name === 'NotReadableError' ? 'Another app is using the camera. Close it and try again.'
          : `Camera focus could not start. It needs an internet connection the first time to fetch the face model.${detail}`)
        setOn(false)
      }
    }
    void start()
    return () => {
      stopped = true
      window.clearInterval(interval)
      stream?.getTracks().forEach(track => track.stop())
      try { landmarker?.close() } catch { /* Already closed. */ }
      if (element) element.srcObject = null
      // Turning camera focus off clears everything; a restart keeps the session's numbers.
      if (!restarting) {
        live.current.paused = false; restarts.current = []
        setAttempt(0); setStatus('off'); setSnapshot(IDLE); setCheckIn(false); setLearning(false)
      }
    }
  }, [on, attempt])
  const isLive = status === 'live'
  const state = isLive ? snapshot.state : 'none'
  useEffect(() => { onGaze(isLive ? state : null) }, [isLive, state, onGaze])
  function back() {
    setCheckIn(false); tracker.current.acknowledge()
    if (live.current.paused) onBack()
    live.current.paused = false
  }
  const left = Math.max(0, timeout - snapshot.awaySeconds)
  const warning = isLive && !checkIn && snapshot.awaySeconds >= WARN_AFTER
  return <section className="card focus-guard" aria-labelledby="guard-title">
    <div className="card-heading">
      <div className="guard-title">
        <span className="guard-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.8" /></svg></span>
        <div><h3 id="guard-title">Camera focus</h3><span>{on ? status === 'reconnecting' ? 'Reconnecting the camera...' : isLive ? checkIn ? 'Waiting for you to look back' : running ? 'Watching while you focus' : 'Ready. Start the timer when you are' : 'Starting...' : 'Pauses the timer when you look away'}</span></div>
      </div>
      <label className="switch"><span className="visually-hidden">Camera focus</span><input type="checkbox" role="switch" checked={on} onChange={e => { setNeedsPermission(false); setOn(e.target.checked) }} /></label>
    </div>
    {!on && !needsPermission && <ul className="guard-points">
      <li>Spots when you look away, close your eyes or leave</li>
      <li>Pauses the timer, then resumes when you look back</li>
      <li>Runs on this computer. Nothing is recorded or sent</li>
    </ul>}
    {on && <div className="guard-live">
      <div className={`guard-video guard-video--${isLive ? state : 'starting'}`}>
        <video ref={video} muted playsInline aria-label="Camera preview" />
        <canvas ref={overlay} aria-hidden="true" />
        <span className="guard-state" role="status"><i aria-hidden="true" />{status === 'starting' ? 'Starting camera...' : status === 'reconnecting' ? 'Reconnecting...' : isLive && learning && snapshot.state === 'screen' ? 'Learning where your screen is...' : GAZE_LABEL[state]}</span>
        {warning && <div className="guard-warning" role="status"><span>{running ? `Pausing in ${left}s` : `Away ${snapshot.awaySeconds}s`}</span><progress value={snapshot.awaySeconds} max={timeout} aria-hidden="true" /></div>}
      </div>
      <div className="guard-readout">
        <dl className="guard-stats">
          <div className="guard-stat--score"><dt>Screen attention</dt><dd>{isLive ? <>{snapshot.score}<span>%</span></> : '-'}</dd></div>
          <div><dt>Look-aways</dt><dd>{isLive ? snapshot.lapses : '-'}</dd></div>
          <div><dt>Best streak</dt><dd>{isLive ? clock(snapshot.bestStreakSeconds) : '-'}</dd></div>
          <div><dt>Tracked</dt><dd>{isLive ? clock(snapshot.observedSeconds) : '-'}</dd></div>
        </dl>
        <div className="guard-timeline">
          <div><span>Last minute</span><span>now</span></div>
          <div className="guard-strip" role="img" aria-label={isLive ? `Attention over the last minute: on screen for ${snapshot.timeline.filter(item => item === 'screen').length} of ${snapshot.timeline.length} seconds` : 'Attention over the last minute'}>
            {Array.from({ length: 60 }, (_, i) => { const item = snapshot.timeline[snapshot.timeline.length - 60 + i]; return <i key={i} className={item ? `is-${item}` : undefined} /> })}
          </div>
        </div>
      </div>
      <div className="guard-timeout" role="group" aria-label="Pause after looking away for">
        <span>Pause after looking away for</span>
        <div className="segmented">{TIMEOUTS.map(([value, label]) => <button key={value} type="button" aria-pressed={timeout === value} onClick={() => setAwayTimeout(value)}>{label}</button>)}</div>
      </div>
    </div>}
    {checkIn && <div className="check-in" role="alert"><div><strong>Still with it?</strong><p>You looked away for a while{pausedTimer ? ', so the timer is paused' : ''}. Look back at the screen for a moment to carry on.</p></div><button className="primary" onClick={back}>I'm back</button></div>}
    {needsPermission && <div className="check-in" role="alert"><div><strong>Allow the camera once</strong><p>Chrome asks in a new tab because the side panel cannot show the question. Press Allow there and camera focus turns on here by itself.</p></div><button className="primary" onClick={askPermission}>Allow camera</button></div>}
    {error && <p className="error" role="alert">{error}</p>}
    {on && <p className="muted">Video stays on this computer and is never saved. Looking at the screen is an estimate, not proof of attention.</p>}
  </section>
}
