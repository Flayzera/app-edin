export type PaymentMethod = 'cash' | 'pix' | 'card'

export type ItemStatus = 'open' | 'paid' | 'cancelled'

export type ComandaStatus = 'open' | 'closed'

export type StockReason = 'purchase' | 'sale' | 'cancel' | 'adjustment'

export interface Product {
  id: string
  name: string
  priceCents: number
  category: string
  trackStock: boolean
  stockQty: number
  lowStockAt: number | null
  active: boolean
}

export interface BarTable {
  id: string
  name: string
  sortOrder: number
}

export interface Comanda {
  id: string
  tableId: string
  tableName: string
  openedAt: number
  closedAt: number | null
  status: ComandaStatus
}

export interface ComandaItem {
  id: string
  comandaId: string
  productId: string
  name: string
  unitPriceCents: number
  qty: number
  status: ItemStatus
  createdAt: number
}

export interface Payment {
  id: string
  comandaId: string
  amountCents: number
  method: PaymentMethod
  itemIds: string[]
  payerName: string
  createdAt: number
}

export interface StockMovement {
  id: string
  productId: string
  delta: number
  reason: StockReason
  createdAt: number
  note: string
}

export interface Meta {
  key: string
  value: string
}

export interface AuditEntry {
  id: string
  createdAt: number
  action: string
  detail: string
}

export interface CashSession {
  id: string
  openedAt: number
  closedAt: number | null
  status: 'open' | 'closed'
  openingCents: number
  closingExpectedCents: number | null
}

export interface CashDrop {
  id: string
  sessionId: string
  amountCents: number
  note: string
  createdAt: number
}

export interface BackupFile {
  version: 1
  exportedAt: string
  products: Product[]
  tables: BarTable[]
  comandas: Comanda[]
  items: ComandaItem[]
  payments: Payment[]
  movements: StockMovement[]
  audits: AuditEntry[]
  sessions: CashSession[]
  drops: CashDrop[]
}

export interface ProductDraft {
  id?: string
  name: string
  priceCents: number
  category: string
  trackStock: boolean
  openingQty: number | null
  lowStockAt: number | null
}

export interface ItemSelection {
  itemId: string
  qty: number
}
