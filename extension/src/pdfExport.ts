// Turns a generated paper or problem set into a real PDF file, laid out like a printed exam.
// jsPDF is only loaded when someone actually downloads, so it does not slow down opening Recall.
export type PdfSection = { heading?: string; text: string; newPage?: boolean }

// The built-in PDF font covers Western European characters only, so common symbols are written out instead.
const SPELLED: Record<string, string> = {
  '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', '•': '-', '−': '-', '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~',
  '→': '->', '←': '<-', '↔': '<->', '√': 'sqrt', 'π': 'pi', 'θ': 'theta', 'Δ': 'delta', '∆': 'delta', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma',
  'λ': 'lambda', 'σ': 'sigma', 'Σ': 'sum', 'Ω': 'ohm', 'ω': 'omega', '∞': 'infinity', '∫': 'integral', '∑': 'sum', '⁻¹': '^-1', '⁴': '^4', '₂': '2', '₃': '3', '₁': '1',
}
export function pdfSafe(text: string) {
  return text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/⁻¹|[^\n\x20-\x7E\xA0-\xFF]/gu, char => SPELLED[char] ?? '?')
}
const HEADING = /^(?:section|part)\s+[A-Z0-9]+\b/i
const QUESTION = /^(?:Q(?:uestion)?\s*)?\d{1,2}\s*[.)]\s/i
const SUBPART = /^\(?(?:[a-h]|[ivx]{1,4})\)\s/i
const isHeading = (line: string) => HEADING.test(line) || (line.length <= 60 && /[A-Z]{3}/.test(line) && line === line.toUpperCase())

export async function downloadPdf(input: { title: string; subtitle?: string; sections: PdfSection[]; fileName: string }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const left = 20, width = 170, bottom = 277
  let y = 22
  const room = (needed: number) => { if (y + needed > bottom) { doc.addPage(); y = 22 } }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(20)
  for (const line of doc.splitTextToSize(pdfSafe(input.title), width) as string[]) { doc.text(line, left, y); y += 7.5 }
  if (input.subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110); doc.text(pdfSafe(input.subtitle), left, y); y += 6 }
  doc.setDrawColor(200); doc.line(left, y, left + width, y); y += 8

  for (const section of input.sections) {
    if (section.newPage) { doc.addPage(); y = 22 }
    if (section.heading) {
      room(12); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20)
      doc.text(pdfSafe(section.heading), left, y); y += 8
    }
    for (const raw of pdfSafe(section.text).split('\n')) {
      const line = raw.trimEnd()
      if (!line.trim()) { y += 3; continue }
      const heading = isHeading(line.trim())
      const indent = SUBPART.test(line.trim()) ? 7 : 0
      if (QUESTION.test(line.trim()) || heading) y += 2.5
      doc.setFont('helvetica', heading ? 'bold' : 'normal'); doc.setFontSize(heading ? 11.5 : 10.5); doc.setTextColor(30)
      for (const part of doc.splitTextToSize(line.trim(), width - indent) as string[]) {
        room(6); doc.text(part, left + indent, y); y += 5.2
      }
    }
    y += 4
  }

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140)
    doc.text('Made with Recall - practice material, may contain mistakes', left, 290)
    doc.text(`Page ${page} of ${pages}`, left + width, 290, { align: 'right' })
  }
  doc.save(input.fileName.replace(/[^\w .-]+/g, '').trim().slice(0, 80) || 'recall.pdf')
}
