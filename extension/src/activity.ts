export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function recentDays(today = new Date()): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today)
    date.setDate(date.getDate() - 6 + i)
    return dateKey(date)
  })
}
export function streakLength(days: string[], today = new Date()): number {
  const active = new Set(days)
  const cursor = new Date(today)
  if (!active.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let length = 0
  while (active.has(dateKey(cursor))) { length++; cursor.setDate(cursor.getDate() - 1) }
  return length
}
export function readStudyDays(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('recall-study-days') ?? '[]')
    return Array.isArray(value) ? [...new Set(value.filter((day): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort().slice(-366) : []
  } catch { return [] }
}
