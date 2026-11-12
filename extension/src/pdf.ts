// Reads PDF text inside the browser, so importing a PDF does not need the backend.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { extractPdfDocument } from './api'
import type { PdfImport } from './api'

/** Reads the PDF in the browser; the backend extractor is only a second attempt when it is running. */
export async function readPdf(file: File): Promise<PdfImport> {
  try { return await extractPdfLocal(file) }
  catch (local) {
    try { return await extractPdfDocument(file) } catch { throw local }
  }
}
type TextItem = { str: string; transform: number[]; height: number }
export async function extractPdfLocal(file: File): Promise<PdfImport> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const document = await task.promise
  const pages: { number: number; words: number }[] = []
  const warnings: string[] = []
  const parts: string[] = []
  let length = 0
  try {
    for (let number = 1; number <= document.numPages && length <= 200000; number++) {
      const content = await (await document.getPage(number)).getTextContent()
      // Group fragments into lines by vertical position, then read top to bottom, left to right.
      const lines = new Map<number, TextItem[]>()
      for (const item of content.items as TextItem[]) {
        if (!item.str?.trim()) continue
        const y = Math.round(item.transform[5] / 3) * 3
        lines.set(y, [...(lines.get(y) ?? []), item])
      }
      const text = [...lines.entries()].sort((a, b) => b[0] - a[0])
        .map(([, items]) => items.sort((a, b) => a.transform[4] - b.transform[4]).map(item => item.str).join(' ').replace(/\s+/g, ' ').trim()).join('\n')
      const words = text ? text.split(/\s+/).length : 0
      pages.push({ number, words })
      if (!words) warnings.push(`Page ${number} has no selectable text (it may be a scan or an image).`)
      else { parts.push(text); length += text.length }
    }
  } finally { void task.destroy() }
  const text = parts.join('\n\n').slice(0, 200000)
  if (!text.trim()) throw new Error('This PDF has no selectable text. Scanned pages need text recognition, which Recall does not do yet.')
  if (length > 200000) warnings.push('The PDF was longer than 200,000 characters, so the end was left out.')
  return { text, pageCount: document.numPages, pages, warnings }
}
