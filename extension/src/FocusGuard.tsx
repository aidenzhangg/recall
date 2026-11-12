import { useEffect, useRef, useState } from 'react'
import { classify, FocusTracker, GAZE_LABEL, signals } from './gaze'
import type { FocusSnapshot } from './gaze'

// Google's published face-landmark model. It is fetched once by the browser; camera frames are processed on this device.
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const IDLE: FocusSnapshot = { state: 'none', score: 100, awaySeconds: 0, observedSeconds: 0, checkIn: false }

function chime() {
  try {
    const audio = new AudioContext(); const tone = audio.createOscillator(); const gain = audio.createGain()
    tone.frequency.value = 660; gain.gain.setValueAtTime(.08, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + .5)
    tone.connect(gain).connect(audio.destination); tone.start(); tone.stop(audio.currentTime + .5)
    tone.onended = () => void audio.close()
  } catch { /* Sound is optional. */ }
}
export default function FocusGuard({ running, onAway, onBack }: { running: boolean; onAway: () => void; onBack: () => void }) {
  const [on, setOn] = useState(false)
  const [status, setStatus] = useState<'off' | 'starting' | 'live'>('off')
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
  const tracker = useRef(new FocusTracker(30))
  const live = useRef({ running, onAway })
  useEffect(() => { live.current = { running, onAway } }, [running, onAway])
  useEffect(() => { tracker.current.timeoutSeconds = timeout }, [timeout])
  useEffect(() => {
    if (!on) return
    let stopped = false
    let stream: MediaStream | undefined
    let interval = 0
    let landmarker: { detectForVideo(video: HTMLVideoElement, time: number): { faceLandmarks: { x: number; y: number }[][]; faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[] }; close(): void } | undefined
    const start = async () => {
      setStatus('starting'); setError('')
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false })
        if (stopped || !video.current) return
        video.current.srcObject = stream
        await video.current.play()
        const vision = await import('@mediapipe/tasks-vision')
        const files = await vision.FilesetResolver.forVisionTasks(new URL('./mediapipe', location.href).href)
        landmarker = await vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true })
        if (stopped) return
        tracker.current.reset(); setStatus('live')
        interval = window.setInterval(() => {
          if (!video.current || video.current.readyState < 2 || !landmarker) return
          const result = landmarker.detectForVideo(video.current, performance.now())
          const face = result.faceLandmarks[0]
          const shapes = Object.fromEntries((result.faceBlendshapes?.[0]?.categories ?? []).map(shape => [shape.categoryName, shape.score]))
          const next = tracker.current.update(classify(face ? signals(face, shapes) : null), performance.now())
          setSnapshot(next)
          if (next.checkIn) { chime(); setCheckIn(true); setPausedTimer(live.current.running); if (live.current.running) live.current.onAway() }
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
      landmarker?.close()
      setStatus('off'); setSnapshot(IDLE); setCheckIn(false)
    }
  }, [on])
  const state = status === 'live' ? snapshot.state : 'none'
  return <section className="card focus-guard" aria-labelledby="guard-title">
    <div className="card-heading"><div><h3 id="guard-title">Camera focus</h3><span>Estimates whether you are looking at the screen</span></div><label className="switch"><span className="visually-hidden">Camera focus</span><input type="checkbox" role="switch" checked={on} onChange={e => { setNeedsPermission(false); setOn(e.target.checked) }} /></label></div>
    {on && <div className="guard-live">
      <div className={`guard-video guard-video--${state}`}><video ref={video} muted playsInline aria-label="Camera preview" /><span>{status === 'starting' ? 'Starting camera...' : GAZE_LABEL[state]}</span></div>
      <dl className="guard-stats"><div><dt>Screen attention</dt><dd>{status === 'live' ? `${snapshot.score}%` : '-'}</dd></div><div><dt>Looking away</dt><dd>{status === 'live' ? `${snapshot.awaySeconds}s` : '-'}</dd></div><div><dt>Tracked</dt><dd>{status === 'live' ? `${Math.floor(snapshot.observedSeconds / 60)}m ${snapshot.observedSeconds % 60}s` : '-'}</dd></div></dl>
      <label className="guard-timeout">Check in after looking away for<select value={timeout} onChange={e => setAwayTimeout(Number(e.target.value))}><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={120}>2 minutes</option></select></label>
    </div>}
    {checkIn && <div className="check-in" role="alert"><div><strong>Still with it?</strong><p>You looked away for a while{pausedTimer ? ', so the timer was paused' : ''}. Take a short break if you need one.</p></div><button className="primary" onClick={() => { setCheckIn(false); tracker.current.reset(); if (pausedTimer) onBack() }}>I'm back</button></div>}
    {needsPermission && <div className="check-in" role="alert"><div><strong>Allow the camera once</strong><p>Chrome asks in a new tab because the side panel cannot show the question. Press Allow there and camera focus turns on here by itself.</p></div><button className="primary" onClick={askPermission}>Allow camera</button></div>}
    {error && <p className="error" role="alert">{error}</p>}
    <p className="muted">Video is analysed on this computer and is never saved or sent anywhere. The face model is downloaded from Google once. Looking at the screen is only a rough sign of focus, and a browser extension cannot lock your computer, so Recall pauses the timer and checks in instead.</p>
  </section>
}
