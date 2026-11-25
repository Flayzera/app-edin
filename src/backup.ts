import type {
  BackupFile,
  BarTable,
  CashDrop,
  CashSession,
  Comanda,
  ComandaItem,
  AuditEntry,
  Payment,
  Product,
  StockMovement,
} from './types'

const itemStatuses = new Set(['open', 'paid', 'cancelled'])
const comandaStatuses = new Set(['open', 'closed'])
const methods = new Set(['cash', 'pix', 'card'])
const reasons = new Set(['purchase', 'sale', 'cancel', 'adjustment'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 80
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function unique(ids: string[]): boolean {
  return new Set(ids).size === ids.length
}

function validProduct(value: unknown): value is Product {
  if (!isRecord(value)) return false
  return (
    isId(value.id) &&
    isText(value.name, 40) &&
    value.name.trim().length > 0 &&
    isInt(value.priceCents, 0, 10_000_000) &&
    isText(value.category, 24) &&
    typeof value.trackStock === 'boolean' &&
    isInt(value.stockQty, 0, 1_000_000) &&
    (value.lowStockAt === null || isInt(value.lowStockAt, 0, 1_000_000)) &&
    typeof value.active === 'boolean'
  )
}

function validTable(value: unknown): value is BarTable {
  if (!isRecord(value)) return false
  return isId(value.id) && isText(value.name, 24) && value.name.trim().length > 0 && isInt(value.sortOrder, 0, 10_000)
}

function validComanda(value: unknown): value is Comanda {
  if (!isRecord(value)) return false
  return (
    isId(value.id) &&
    isId(value.tableId) &&
    isText(value.tableName, 24) &&
    isInt(value.openedAt, 0, 9_999_999_999_999) &&
    (value.closedAt === null || isInt(value.closedAt, 0, 9_999_999_999_999)) &&
    comandaStatuses.has(String(value.status))
  )
}

function validItem(value: unknown): value is ComandaItem {
  if (!isRecord(value)) return false
  return (
    isId(value.id) &&
    isId(value.comandaId) &&
    isId(value.productId) &&
    isText(value.name, 40) &&
    isInt(value.unitPriceCents, 0, 10_000_000) &&
    isInt(value.qty, 1, 999) &&
    itemStatuses.has(String(value.status)) &&
    isInt(value.createdAt, 0, 9_999_999_999_999)
  )
}

function validPayment(value: unknown): value is Payment {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.itemIds) || !value.itemIds.every((id) => isId(id))) return false
  const payerName = value.payerName === undefined ? '' : value.payerName
  if (!isText(payerName, 40)) return false
  value.payerName = payerName
  return (
    isId(value.id) &&
    isId(value.comandaId) &&
    isInt(value.amountCents, 1, 100_000_000) &&
    methods.has(String(value.method)) &&
    isInt(value.createdAt, 0, 9_999_999_999_999)
  )
}

function validAudit(value: unknown): value is AuditEntry {
  if (!isRecord(value)) return false
  return (
    isId(value.id) &&
    isInt(value.createdAt, 0, 9_999_999_999_999) &&
    isText(value.action, 40) &&
    value.action.trim().length > 0 &&
    isText(value.detail, 160)
  )
}

function validSession(value: unknown): value is CashSession {
  if (!isRecord(value)) return false
  const open = value.status === 'open' && value.closedAt === null && value.closingExpectedCents === null
  const closed =
    value.status === 'closed' &&
    isInt(value.closedAt, 0, 9_999_999_999_999) &&
    isInt(value.closingExpectedCents, 0, 100_000_000)
  return isId(value.id) && isInt(value.openedAt, 0, 9_999_999_999_999) && isInt(value.openingCents, 0, 100_000_000) && (open || closed)
}

function validDrop(value: unknown): value is CashDrop {
  if (!isRecord(value)) return false
  return (
    isId(value.id) &&
    isId(value.sessionId) &&
    isInt(value.amountCents, 1, 100_000_000) &&
    isText(value.note, 80) &&
    isInt(value.createdAt, 0, 9_999_999_999_999)
  )
}

function validMovement(value: unknown): value is StockMovement {
  if (!isRecord(value)) return false
  return (
    isId(value.id) &&
    isId(value.productId) &&
    isInt(value.delta, -1_000_000, 1_000_000) &&
    value.delta !== 0 &&
    reasons.has(String(value.reason)) &&
    isInt(value.createdAt, 0, 9_999_999_999_999) &&
    isText(value.note, 80)
  )
}

export function parseBackup(value: unknown): BackupFile | null {
  if (!isRecord(value) || value.version !== 1) return null
  if (typeof value.exportedAt !== 'string') return null
  const lists = ['products', 'tables', 'comandas', 'items', 'payments', 'movements'] as const
  if (!lists.every((key) => Array.isArray(value[key]))) return null

  const products = value.products as unknown[]
  const tables = value.tables as unknown[]
  const comandas = value.comandas as unknown[]
  const items = value.items as unknown[]
  const payments = value.payments as unknown[]
  const movements = value.movements as unknown[]

  if (!products.every(validProduct)) return null
  if (!tables.every(validTable)) return null
  if (!comandas.every(validComanda)) return null
  if (!items.every(validItem)) return null
  if (!payments.every(validPayment)) return null
  if (!movements.every(validMovement)) return null
  const audits = Array.isArray(value.audits) ? (value.audits as unknown[]) : []
  if (!audits.every(validAudit)) return null
  if (!unique(audits.map((row) => (row as AuditEntry).id))) return null
  const sessions = Array.isArray(value.sessions) ? (value.sessions as unknown[]) : []
  const drops = Array.isArray(value.drops) ? (value.drops as unknown[]) : []
  if (!sessions.every(validSession) || !drops.every(validDrop)) return null
  if (!unique(sessions.map((row) => (row as CashSession).id))) return null
  if (!unique(drops.map((row) => (row as CashDrop).id))) return null
  if (sessions.filter((row) => (row as CashSession).status === 'open').length > 1) return null

  const productIds = products.map((row) => (row as Product).id)
  const comandaIdList = comandas.map((row) => (row as Comanda).id)
  const itemIdList = items.map((row) => (row as ComandaItem).id)
  if (!unique(productIds) || !unique(tables.map((row) => (row as BarTable).id))) return null
  if (!unique(comandaIdList) || !unique(itemIdList)) return null
  const comandaIds = new Set(comandaIdList)
  const itemIds = new Set(itemIdList)
  if (!unique(payments.map((row) => (row as Payment).id))) return null
  if (!unique(movements.map((row) => (row as StockMovement).id))) return null

  const sessionIds = new Set(sessions.map((row) => (row as CashSession).id))
  for (const drop of drops as CashDrop[]) {
    if (!sessionIds.has(drop.sessionId)) return null
  }

  const productSet = new Set(productIds)
  for (const item of items as ComandaItem[]) {
    if (!comandaIds.has(item.comandaId)) return null
  }
  for (const payment of payments as Payment[]) {
    if (!comandaIds.has(payment.comandaId)) return null
    if (payment.itemIds.some((id) => !itemIds.has(id))) return null
  }
  for (const movement of movements as StockMovement[]) {
    if (!productSet.has(movement.productId)) return null
  }

  return {
    version: 1,
    exportedAt: value.exportedAt,
    products: products as Product[],
    tables: tables as BarTable[],
    comandas: comandas as Comanda[],
    items: items as ComandaItem[],
    payments: payments as Payment[],
    movements: movements as StockMovement[],
    audits: audits as AuditEntry[],
    sessions: sessions as CashSession[],
    drops: drops as CashDrop[],
  }
}
