import { periodBounds } from './money'
import type { Comanda, ComandaItem, Payment, PaymentMethod } from './types'

export interface ProductSaleLine {
  id: string
  at: number
  qty: number
  tableName: string
  method: PaymentMethod | 'mixed' | null
  amountCents: number
}

export function productSales(
  productId: string,
  day: Date,
  items: ComandaItem[],
  payments: Payment[],
  comandas: Comanda[],
): ProductSaleLine[] {
  const { start, end } = periodBounds('day', day)
  const paymentByItem = new Map<string, Payment>()
  const paymentsByComanda = new Map<string, Payment[]>()
  for (const payment of payments) {
    const list = paymentsByComanda.get(payment.comandaId) ?? []
    list.push(payment)
    paymentsByComanda.set(payment.comandaId, list)
    for (const itemId of payment.itemIds) {
      if (!paymentByItem.has(itemId)) paymentByItem.set(itemId, payment)
    }
  }

  const lines: ProductSaleLine[] = []
  for (const item of items) {
    if (item.productId !== productId || item.status !== 'paid' || item.qty < 1) continue
    const linked = paymentByItem.get(item.id)
    const comanda = comandas.find((row) => row.id === item.comandaId)
    const related = paymentsByComanda.get(item.comandaId) ?? []
    let at = item.createdAt
    let method: ProductSaleLine['method'] = null
    if (linked) {
      at = linked.createdAt
      method = linked.method
    } else {
      const methods = [...new Set(related.map((payment) => payment.method))]
      method = methods.length === 1 ? methods[0] : methods.length > 1 ? 'mixed' : null
      const latest = related.reduce((max, payment) => Math.max(max, payment.createdAt), 0)
      at = comanda?.closedAt ?? (latest || item.createdAt)
    }
    if (at < start || at >= end) continue
    lines.push({
      id: item.id,
      at,
      qty: item.qty,
      tableName: comanda?.tableName || 'Mesa',
      method,
      amountCents: item.unitPriceCents * item.qty,
    })
  }
  return lines.sort((a, b) => b.at - a.at || b.id.localeCompare(a.id))
}
