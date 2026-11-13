// Draws the Recall logo (a flat green R on a dark tile) as the extension's PNG icons.
// Chrome needs PNGs in the manifest, so this rasterises the same shapes as public/favicon.svg
// without any image library. Run: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

// Everything is in the 128-unit box that favicon.svg uses.
const BOX = 128, CORNER = 28
const TILE = [0x14, 0x18, 0x1f], LETTER = [0xb4, 0xf0, 0x6e]
const within = (value, from, to) => value >= from && value <= to
const bowl = (px, py, radius) => px >= 70 && Math.hypot(px - 70, py - 52) <= radius

function insideTile(px, py) {
  const qx = Math.abs(px - BOX / 2) - (BOX / 2 - CORNER), qy = Math.abs(py - BOX / 2) - (BOX / 2 - CORNER)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) <= CORNER
}
function insideLetter(px, py) {
  const stem = within(px, 36, 52) && within(py, 30, 98)
  const outer = (within(px, 36, 70) && within(py, 30, 74)) || bowl(px, py, 22)
  const counter = (within(px, 52, 70) && within(py, 44, 60)) || bowl(px, py, 8)
  const leg = within(py, 70, 98) && within(px - (55 + (py - 70) * .75), 0, 18)
  return stem || (outer && !counter) || leg
}
/** One sample: [r, g, b, alpha 0-1]. */
function sample(px, py) {
  if (!insideTile(px, py)) return [0, 0, 0, 0]
  return [...(insideLetter(px, py) ? LETTER : TILE), 1]
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data])
  let crc = 0xffffffff
  for (const byte of body) crc = CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, body.length + 4)
  return out
}
function png(size) {
  const SUB = 6 // samples per pixel, each way
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, alpha = 0
    for (let sy = 0; sy < SUB; sy++) for (let sx = 0; sx < SUB; sx++) {
      const [sr, sg, sb, sa] = sample((x + (sx + .5) / SUB) * BOX / size, (y + (sy + .5) / SUB) * BOX / size)
      r += sr * sa; g += sg * sa; b += sb * sa; alpha += sa
    }
    const at = y * (size * 4 + 1) + 1 + x * 4
    if (alpha) { rows[at] = Math.round(r / alpha); rows[at + 1] = Math.round(g / alpha); rows[at + 2] = Math.round(b / alpha) }
    rows[at + 3] = Math.round(alpha / (SUB * SUB) * 255)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync('public/icons', { recursive: true })
for (const size of [16, 32, 48, 128]) writeFileSync(`public/icons/icon-${size}.png`, png(size))
console.log('Wrote public/icons/icon-{16,32,48,128}.png')
