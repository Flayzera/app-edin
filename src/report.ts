import { periodBounds, type PeriodKind } from './money'
import type { CashDrop, Comanda, ComandaItem, Payment, Product, StockMovement } from './types'

export type ReportKind = Exclude<PeriodKind, 'year'>

export interface ReportProduct {
  name: string
  qty: number
  cents: number
}

export interface ReportDay {
  at: number
  label: string
  cents: number
}

export interface ReportSnapshot {
  receivedCents: number
  cash: number
  pix: number
  card: number
  sangria: number
  fiadoNoted: number
  fiadoReceived: number
  tables: number
  consumption: number
  ticket: number
  returnedQty: number
  products: ReportProduct[]
  days: ReportDay[]
  busyDays: number
  idleNames: string[]
}

const dayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric' })

function inRange(at: number, start: number, end: number) {
  return at >= start && at < end
}

function dayStart(at: number) {
  const date = new Date(at)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function saleAt(item: ComandaItem, payments: Payment[], comandas: Comanda[]): number {
  const linked = payments.find((payment) => payment.itemIds.includes(item.id))
  if (linked) return linked.createdAt
  const related = payments.filter((payment) => payment.comandaId === item.comandaId)
  const comanda = comandas.find((row) => row.id === item.comandaId)
  const latest = related.reduce((max, payment) => Math.max(max, payment.createdAt), 0)
  return comanda?.closedAt ?? (latest || item.createdAt)
}

export function previousAnchor(kind: ReportKind, anchor: Date): Date {
  const date = new Date(anchor)
  if (kind === 'day') date.setDate(date.getDate() - 1)
  else if (kind === 'week') date.setDate(date.getDate() - 7)
  else date.setMonth(date.getMonth() - 1)
  return date
}

export function buildReport(
  kind: ReportKind,
  anchor: Date,
  data: {
    payments: Payment[]
    items: ComandaItem[]
    comandas: Comanda[]
    drops: CashDrop[]
    movements: StockMovement[]
    products: Product[]
  },
): ReportSnapshot {
  const { start, end } = periodBounds(kind, anchor)
  const received = data.payments.filter(
    (payment) => payment.method !== 'fiado' && inRange(payment.createdAt, start, end),
  )
  const sum = (method?: Payment['method']) =>
    received.filter((payment) => (method ? payment.method === method : true)).reduce((total, payment) => total + payment.amountCents, 0)

  const closed = data.comandas.filter(
    (comanda) => comanda.status === 'closed' && comanda.closedAt !== null && inRange(comanda.closedAt, start, end),
  )
  const consumption = closed.reduce((total, comanda) => {
    return (
      total +
      data.items
        .filter((item) => item.comandaId === comanda.id && item.status !== 'cancelled')
        .reduce((sumCents, item) => sumCents + item.unitPriceCents * item.qty, 0)
    )
  }, 0)

  const byProduct = new Map<string, ReportProduct>()
  for (const item of data.items) {
    if (item.status !== 'paid' || item.qty < 1) continue
    const at = saleAt(item, data.payments, data.comandas)
    if (!inRange(at, start, end)) continue
    const name = item.name || 'Produto'
    const row = byProduct.get(item.productId || name) ?? { name, qty: 0, cents: 0 }
    row.qty += item.qty
    row.cents += item.unitPriceCents * item.qty
    byProduct.set(item.productId || name, row)
  }
  const products = [...byProduct.values()].sort((a, b) => b.qty - a.qty || b.cents - a.cents).slice(0, 5)
  const soldIds = new Set(byProduct.keys())

  const collapsed = new Map<number, number>()
  for (const payment of received) {
    const at = dayStart(payment.createdAt)
    collapsed.set(at, (collapsed.get(at) ?? 0) + payment.amountCents)
  }
  const days: ReportDay[] = []
  const cursor = new Date(start)
  while (cursor.getTime() < end) {
    const at = cursor.getTime()
    days.push({ at, label: dayLabel.format(at).replace('.', ''), cents: collapsed.get(at) ?? 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  const listed = kind === 'month' ? days.filter((day) => day.cents > 0) : days

  const idleNames = data.products
    .filter((product) => product.active && !soldIds.has(product.id))
    .map((product) => product.name)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return {
    receivedCents: sum(),
    cash: sum('cash'),
    pix: sum('pix'),
    card: sum('card'),
    sangria: data.drops.filter((drop) => inRange(drop.createdAt, start, end)).reduce((total, drop) => total + drop.amountCents, 0),
    fiadoNoted: data.payments
      .filter((payment) => payment.method === 'fiado' && inRange(payment.createdAt, start, end))
      .reduce((total, payment) => total + payment.amountCents, 0),
    fiadoReceived: received.filter((payment) => payment.debtId).reduce((total, payment) => total + payment.amountCents, 0),
    tables: closed.length,
    consumption,
    ticket: closed.length ? Math.round(consumption / closed.length) : 0,
    returnedQty: data.movements
      .filter((movement) => movement.reason === 'cancel' && movement.delta > 0 && inRange(movement.createdAt, start, end))
      .reduce((total, movement) => total + movement.delta, 0),
    products,
    days: listed,
    busyDays: [...collapsed.values()].filter((cents) => cents > 0).length,
    idleNames,
  }
}
