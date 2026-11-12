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

export type FocusSnapshot = { state: GazeState; score: number; awaySeconds: number; observedSeconds: number; checkIn: boolean }
/** Accumulates time on and off screen. A blink is not a distraction; eyes shut for a while, or no face, is. */
export class FocusTracker {
  private last = 0; private observed = 0; private onScreen = 0; private awayFor = 0; private closedFor = 0; private alerted = false
  timeoutSeconds: number
  constructor(timeoutSeconds = 30) { this.timeoutSeconds = timeoutSeconds }
  update(state: GazeState, now: number): FocusSnapshot {
    // Gaps (tab hidden, camera stalled) are not counted either way.
    const elapsed = this.last && now - this.last < 2000 ? now - this.last : 0
    this.last = now
    this.closedFor = state === 'closed' ? this.closedFor + elapsed : 0
    const attentive = state === 'screen' || (state === 'closed' && this.closedFor < 1500)
    this.observed += elapsed
    if (attentive) { this.onScreen += elapsed; this.awayFor = 0; this.alerted = false } else this.awayFor += elapsed
    const checkIn = !this.alerted && this.awayFor >= this.timeoutSeconds * 1000
    if (checkIn) this.alerted = true
    return { state, score: this.observed ? Math.round(this.onScreen / this.observed * 100) : 100, awaySeconds: Math.floor(this.awayFor / 1000), observedSeconds: Math.floor(this.observed / 1000), checkIn }
  }
  reset() { this.last = 0; this.observed = 0; this.onScreen = 0; this.awayFor = 0; this.closedFor = 0; this.alerted = false }
}
export const GAZE_LABEL: Record<GazeState, string> = { screen: 'Looking at screen', away: 'Looking away', closed: 'Eyes closed', none: 'No face in view' }
