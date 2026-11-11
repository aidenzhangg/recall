export const MAX_MATERIAL_LENGTH = 200000

/** Preserve the current document rather than silently truncating an imported photo transcript. */
export function appendMaterial(current: string, incoming: string): string {
  const text = incoming.trim()
  if (!text) throw new Error('Add text from the photo before importing.')
  const merged = current.trim() ? `${current}\n\n${text}` : text
  if (merged.length > MAX_MATERIAL_LENGTH) throw new Error('These notes would exceed 200,000 characters. Shorten the notes or the photo text before importing.')
  return merged
}
