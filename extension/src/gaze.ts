// Pure gaze logic for the camera focus feature. The camera frame is analysed on this device and
// never stored or sent anywhere; only these few numbers are kept in memory.
// Looking at the screen is not the same as paying attention, so everything here is an estimate.
export type GazeState = 'screen' | 'away' | 'closed' | 'none'
export type Point = { x: number; y: number }
export type Signals = { yaw: number; pitch: number; blink: number; side: number; up: number; down: number }

/** Reduces MediaPipe face landmarks and blendshapes to a few head-pose and eye signals. */
export function signals(landmarks: Point[], shapes: Record<string, number>): Signals | null {
  const nose = landmarks[1], left = landmarks[234], right = landmarks[454], top = landmarks[10], chin = landmarks[152]
  if (!nose || !left || !right || !top || !chin) return null
  const width = right.x - left.x, height = chin.y - top.y
  if (Math.abs(width) < 1e-4 || Math.abs(height) < 1e-4) return null
  const shape = (name: string) => shapes[name] ?? 0
  return {
    yaw: (nose.x - left.x) / width,      // 0.5 when facing the camera
    pitch: (nose.y - top.y) / height,    // about 0.5-0.6 when level
    blink: (shape('eyeBlinkLeft') + shape('eyeBlinkRight')) / 2,
    side: Math.max(shape('eyeLookOutLeft'), shape('eyeLookOutRight')),
    up: (shape('eyeLookUpLeft') + shape('eyeLookUpRight')) / 2,
    down: (shape('eyeLookDownLeft') + shape('eyeLookDownRight')) / 2,
  }
}
export function classify(value: Signals | null): GazeState {
  if (!value) return 'none'
  if (value.blink > .6) return 'closed'
  if (Math.abs(value.yaw - .5) > .2 || value.pitch < .32 || value.pitch > .8) return 'away'
  // Eyes are allowed to drop a little: reading the lower half of a screen looks like "down".
  if (value.side > .7 || value.up > .7 || value.down > .88) return 'away'
  return 'screen'
}

export type FocusSnapshot = {
  state: GazeState; score: number; awaySeconds: number; observedSeconds: number
  /** True on the single update where the look-away timeout is reached. */
  checkIn: boolean
  /** True on the single update where, after a check-in, the eyes have been back on screen for two seconds. */
  returned: boolean
  /** Times attention left the screen for more than two seconds. */
  lapses: number
  bestStreakSeconds: number
  /** One entry per tracked second, newest last, for the attention strip. */
  timeline: GazeState[]
}
const LAPSE_MS = 2000, RETURN_MS = 2000, TIMELINE_SECONDS = 60
/** Accumulates time on and off screen. A blink is not a distraction; eyes shut for a while, or no face, is. */
export class FocusTracker {
  private last = 0; private observed = 0; private onScreen = 0; private awayFor = 0; private closedFor = 0; private backFor = 0
  private alerted = false; private lapsed = false; private lapses = 0; private streak = 0; private best = 0
  private bucket = 0; private bucketAway = 0; private timeline: GazeState[] = []
  timeoutSeconds: number
  constructor(timeoutSeconds = 30) { this.timeoutSeconds = timeoutSeconds }
  update(state: GazeState, now: number): FocusSnapshot {
    // Gaps (tab hidden, camera stalled) are not counted either way.
    const elapsed = this.last && now - this.last < 2000 ? now - this.last : 0
    this.last = now
    this.closedFor = state === 'closed' ? this.closedFor + elapsed : 0
    const attentive = state === 'screen' || (state === 'closed' && this.closedFor < 1500)
    let returned = false
    if (this.alerted) {
      // Waiting at a check-in: the session is paused, so this time is not scored. Only watch for the return.
      if (attentive) { this.awayFor = 0; this.backFor += elapsed; if (this.backFor >= RETURN_MS) { this.acknowledge(); returned = true } }
      else { this.awayFor += elapsed; this.backFor = 0 }
    } else {
      this.observed += elapsed
      if (attentive) {
        this.onScreen += elapsed; this.awayFor = 0; this.lapsed = false
        this.streak += elapsed; this.best = Math.max(this.best, this.streak)
      } else {
        this.awayFor += elapsed; this.bucketAway += elapsed
        if (!this.lapsed && this.awayFor >= LAPSE_MS) { this.lapsed = true; this.lapses++; this.streak = 0 }
      }
      this.bucket += elapsed
      if (this.bucket >= 1000) {
        const second: GazeState = this.bucketAway * 2 < this.bucket ? 'screen' : state === 'screen' ? 'away' : state
        this.timeline = [...this.timeline, second].slice(-TIMELINE_SECONDS)
        this.bucket = 0; this.bucketAway = 0
      }
    }
    const checkIn = !this.alerted && this.awayFor >= this.timeoutSeconds * 1000
    if (checkIn) this.alerted = true
    return {
      state, checkIn, returned, lapses: this.lapses, timeline: this.timeline,
      score: this.observed ? Math.round(this.onScreen / this.observed * 100) : 100,
      awaySeconds: Math.floor(this.awayFor / 1000), observedSeconds: Math.floor(this.observed / 1000), bestStreakSeconds: Math.floor(this.best / 1000),
    }
  }
  /** Ends a check-in and keeps the session's score, so tracking carries on from here. */
  acknowledge() { this.alerted = false; this.awayFor = 0; this.backFor = 0; this.lapsed = false }
  reset() {
    this.last = 0; this.observed = 0; this.onScreen = 0; this.awayFor = 0; this.closedFor = 0; this.backFor = 0
    this.alerted = false; this.lapsed = false; this.lapses = 0; this.streak = 0; this.best = 0
    this.bucket = 0; this.bucketAway = 0; this.timeline = []
  }
}
export const GAZE_LABEL: Record<GazeState, string> = { screen: 'Looking at screen', away: 'Looking away', closed: 'Eyes closed', none: 'No face in view' }
