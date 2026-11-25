import Dexie, { type Table } from 'dexie'
import type { AuditEntry, BarTable, Comanda, ComandaItem, Meta, Payment, Product, StockMovement } from './types'

export class BarDatabase extends Dexie {
  products!: Table<Product, string>
  mesas!: Table<BarTable, string>
  comandas!: Table<Comanda, string>
  items!: Table<ComandaItem, string>
  payments!: Table<Payment, string>
  movements!: Table<StockMovement, string>
  meta!: Table<Meta, string>
  audits!: Table<AuditEntry, string>

  constructor() {
    super('balcao')
    const stores = {
      products: 'id, active, category',
      mesas: 'id, sortOrder',
      comandas: 'id, tableId, status, openedAt',
      items: 'id, comandaId, status, productId',
      payments: 'id, comandaId, createdAt',
      movements: 'id, productId, createdAt',
      meta: 'key',
    }
    this.version(1).stores(stores)
    this.version(2).stores({ ...stores, audits: 'id, createdAt' })
  }
}

export const db = new BarDatabase()
