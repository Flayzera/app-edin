const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatCents(cents: number): string {
  return brl.format(cents / 100)
}

export function parseReais(input: string): number | null {
  let cleaned = input.trim().replace(/\s/g, '').replace(/^R\$/i, '')
  if (!cleaned) return null
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole, frac = ''] = cleaned.split('.')
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return cents
}

export function parseQty(input: string): number | null {
  const trimmed = input.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const qty = Number(trimmed)
  if (!Number.isSafeInteger(qty)) return null
  return qty
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

export function formatTodayLabel(date = new Date()): string {
  const label = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(date)
  return label.replace('.', '')
}

export function startOfToday(date = new Date()): number {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy.getTime()
}

export type PeriodKind = 'day' | 'week' | 'month' | 'year'

export function periodBounds(kind: PeriodKind, anchor: Date): { start: number; end: number } {
  const day = new Date(anchor)
  day.setHours(0, 0, 0, 0)
  if (kind === 'day') {
    const end = new Date(day)
    end.setDate(end.getDate() + 1)
    return { start: day.getTime(), end: end.getTime() }
  }
  if (kind === 'week') {
    const weekday = day.getDay()
    day.setDate(day.getDate() + (weekday === 0 ? -6 : 1 - weekday))
    const end = new Date(day)
    end.setDate(end.getDate() + 7)
    return { start: day.getTime(), end: end.getTime() }
  }
  if (kind === 'month') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
    return { start: start.getTime(), end: end.getTime() }
  }
  const start = new Date(anchor.getFullYear(), 0, 1)
  const end = new Date(anchor.getFullYear() + 1, 0, 1)
  return { start: start.getTime(), end: end.getTime() }
}

export function formatPeriod(kind: PeriodKind, anchor: Date): string {
  const { start, end } = periodBounds(kind, anchor)
  const last = new Date(end - 1)
  const short = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
  if (kind === 'day') return formatTodayLabel(anchor)
  if (kind === 'week') return `${short.format(new Date(start)).replace('.', '')} – ${short.format(last).replace('.', '')}`
  if (kind === 'month') return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(anchor)
  return String(anchor.getFullYear())
}

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}
