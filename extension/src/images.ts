// Pictures for Recall AI: screenshots are shrunk in the browser before they are sent, so a 4K screenshot does not
// become a 10 MB request. Two copies are made: one sharp enough to read text for the AI, and a small preview that
// is saved with the chat history (the full picture is never stored).
export type Picture = { id: string; url: string; thumb: string }
export const MAX_PICTURES = 3
const MAX_INPUT_BYTES = 25 * 1024 * 1024
const FULL_SIDE = 1600
const FULL_CHARS = 1_200_000 // ~900 KB of JPEG; the server refuses anything over 1.5 million characters
const THUMB_SIDE = 480

const newId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function load(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  }
  const url = URL.createObjectURL(file)
  const image = new Image()
  try {
    image.src = url
    await image.decode()
  } catch (error) { URL.revokeObjectURL(url); throw error }
  return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) }
}

function draw(image: { source: CanvasImageSource; width: number; height: number }, side: number, quality: number): string {
  const scale = Math.min(1, side / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas')
  // JPEG has no transparency, so see-through parts of a PNG become white instead of black.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingQuality = 'high'
  context.drawImage(image.source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/** Turns a pasted, dropped or chosen image file into a resized JPEG for the AI and a small preview. */
export async function preparePicture(file: Blob): Promise<Picture> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not a picture.')
  if (file.size > MAX_INPUT_BYTES) throw new Error('That picture is too big. Use one under 25 MB.')
  let image
  try { image = await load(file) } catch { throw new Error('That picture could not be opened. Try a PNG or JPEG.') }
  try {
    let url = ''
    // Shrink further until it fits, keeping text readable for as long as possible.
    for (const [side, quality] of [[FULL_SIDE, .85], [FULL_SIDE, .7], [1280, .7], [1024, .6]] as const) {
      url = draw(image, side, quality)
      if (url.length <= FULL_CHARS) break
    }
    if (url.length > FULL_CHARS) throw new Error('That picture is too detailed to send. Try cropping it.')
    return { id: newId(), url, thumb: draw(image, THUMB_SIDE, .7) }
  } finally { image.close() }
}

/** Image files in a paste or drop, if any. */
export function pictureFiles(data: DataTransfer | null): File[] {
  if (!data) return []
  const fromItems = [...data.items].filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file)
  return fromItems.length ? fromItems : [...data.files].filter(file => file.type.startsWith('image/'))
}

/** A saved preview: a JPEG data URL of bounded size. */
export const isSavedPicture = (value: unknown): value is string => typeof value === 'string' && value.length <= 200_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value)
