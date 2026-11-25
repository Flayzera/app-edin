import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { parseBackup } from '../backup'
import { db } from '../db'
import { methodLabel } from '../labels'
import { formatCents } from '../money'
import { normalizePixKey, normalizePixLabel } from '../pix'
import type {
  AuditEntry,
  BarTable,
  Comanda,
  ComandaItem,
  ItemSelection,
  ItemStatus,
  Payment,
  PaymentMethod,
  PixProfile,
  Product,
  ProductDraft,
  StockMovement,
} from '../types'

export interface ConfirmState {
  title: string
  body: string
  confirmLabel: string
}

function uid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const useBarStore = defineStore('bar', () => {
  const ready = ref(false)
  const busy = ref(false)
  const notice = ref<string | null>(null)
  const dialog = ref<ConfirmState | null>(null)
  const products = ref<Product[]>([])
  const tables = ref<BarTable[]>([])
  const comandas = ref<Comanda[]>([])
  const items = ref<ComandaItem[]>([])
  const payments = ref<Payment[]>([])
  const movements = ref<StockMovement[]>([])
  const audits = ref<AuditEntry[]>([])
  const pix = ref<PixProfile>({ key: '', name: '', city: '' })

  let noticeTimer = 0
  let resolver: ((value: boolean) => void) | null = null

  const lowStockProducts = computed(() =>
    products.value.filter(
      (product) =>
        product.trackStock &&
        product.lowStockAt !== null &&
        product.stockQty <= product.lowStockAt,
    ),
  )

  function flash(message: string) {
    notice.value = message
    window.clearTimeout(noticeTimer)
    noticeTimer = window.setTimeout(() => {
      notice.value = null
    }, 2800)
  }

  function dismissNotice() {
    notice.value = null
    window.clearTimeout(noticeTimer)
  }

  function ask(title: string, body: string, confirmLabel = 'Confirmar') {
    if (resolver) resolver(false)
    return new Promise<boolean>((resolve) => {
      resolver = resolve
      dialog.value = { title, body, confirmLabel }
    })
  }

  function answer(value: boolean) {
    dialog.value = null
    const resolve = resolver
    resolver = null
    resolve?.(value)
  }

  async function reload() {
    const [productRows, tableRows, comandaRows, itemRows, paymentRows, movementRows, auditRows, metaRows] = await Promise.all([
      db.products.toArray(),
      db.mesas.toArray(),
      db.comandas.toArray(),
      db.items.toArray(),
      db.payments.toArray(),
      db.movements.toArray(),
      db.audits.toArray(),
      db.meta.toArray(),
    ])
    products.value = productRows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    tables.value = tableRows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'))
    comandas.value = comandaRows
    items.value = itemRows
    payments.value = paymentRows.map((payment) => ({
      ...payment,
      payerName: typeof payment.payerName === 'string' ? payment.payerName : '',
    }))
    movements.value = movementRows
    audits.value = auditRows.sort((a, b) => b.createdAt - a.createdAt)
    const meta = new Map(metaRows.map((row) => [row.key, row.value]))
    pix.value = {
      key: meta.get('pixKey') ?? '',
      name: meta.get('pixName') ?? '',
      city: meta.get('pixCity') ?? '',
    }
  }

  function trace(action: string, detail: string) {
    void record(action, detail).then(() => reload())
  }

  async function record(action: string, detail: string) {
    await db.audits.add({
      id: uid(),
      createdAt: Date.now(),
      action,
      detail: detail.trim().slice(0, 160),
    })
    const count = await db.audits.count()
    if (count > 400) {
      const extra = await db.audits.orderBy('createdAt').limit(count - 300).primaryKeys()
      if (extra.length) await db.audits.bulkDelete(extra)
    }
  }

  async function run(task: () => Promise<void>): Promise<boolean> {
    if (busy.value) return false
    busy.value = true
    try {
      await task()
      return true
    } catch (error) {
      console.error(error)
      flash('Não consegui salvar. Tente de novo.')
      return false
    } finally {
      busy.value = false
    }
  }

  async function tidy() {
    const open = await db.comandas.filter((row) => row.status === 'open').toArray()
    const live = new Set(open.map((row) => row.tableId))
    const mesas = await db.mesas.toArray()
    const productRows = await db.products.toArray()
    await db.transaction('rw', db.mesas, db.products, async () => {
      for (const mesa of mesas) {
        if (!live.has(mesa.id)) await db.mesas.delete(mesa.id)
      }
      for (const product of productRows) {
        if (!product.trackStock) await db.products.update(product.id, { trackStock: true })
      }
    })
  }

  async function init() {
    await tidy()
    const marker = await db.meta.get('initialized')
    if (!marker) await db.meta.put({ key: 'initialized', value: '1' })
    await reload()
    ready.value = true
  }

  function openComandaFor(tableId: string) {
    return comandas.value.find((comanda) => comanda.tableId === tableId && comanda.status === 'open') ?? null
  }

  function itemsOf(comandaId: string, status: ItemStatus) {
    return items.value
      .filter((item) => item.comandaId === comandaId && item.status === status)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  function dueOf(comandaId: string) {
    const openSum = itemsOf(comandaId, 'open').reduce((sum, item) => sum + item.unitPriceCents * item.qty, 0)
    const loose = payments.value
      .filter((payment) => payment.comandaId === comandaId && payment.itemIds.length === 0)
      .reduce((sum, payment) => sum + payment.amountCents, 0)
    return openSum - loose
  }

  function consumptionOf(comandaId: string) {
    return items.value
      .filter((item) => item.comandaId === comandaId && item.status !== 'cancelled')
      .reduce((sum, item) => sum + item.unitPriceCents * item.qty, 0)
  }

  function paidOf(comandaId: string) {
    return payments.value
      .filter((payment) => payment.comandaId === comandaId)
      .reduce((sum, payment) => sum + payment.amountCents, 0)
  }

  function nameForComanda(comandaId: string) {
    const comanda = comandas.value.find((row) => row.id === comandaId)
    if (!comanda) return 'Mesa'
    return tables.value.find((table) => table.id === comanda.tableId)?.name ?? comanda.tableName
  }

  function productById(productId: string) {
    return products.value.find((product) => product.id === productId) ?? null
  }

  function latestMovement(productId: string) {
    return movements.value
      .filter((movement) => movement.productId === productId)
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  }

  function tableItemQty(tableId: string) {
    const comanda = openComandaFor(tableId)
    if (!comanda) return 0
    return itemsOf(comanda.id, 'open').reduce((sum, item) => sum + item.qty, 0)
  }

  async function settle(comandaId: string, tableId: string, tableName: string, shouldClose: boolean) {
    if (!shouldClose) return false
    const rows = await db.items.where('comandaId').equals(comandaId).toArray()
    for (const item of rows) {
      if (item.status === 'open') await db.items.update(item.id, { status: 'paid' })
    }
    await db.comandas.update(comandaId, {
      status: 'closed',
      closedAt: Date.now(),
      tableName,
    })
    await db.mesas.delete(tableId)
    return true
  }

  async function openTable(name: string) {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 24) {
      flash('Dê um nome curto para a mesa.')
      return null
    }
    const sameName = tables.value.some((table) => table.name.localeCompare(trimmed, 'pt-BR', { sensitivity: 'base' }) === 0)
    if (sameName) {
      flash('Já existe uma mesa aberta com esse nome.')
      return null
    }
    const tableId = uid()
    const sortOrder = tables.value.reduce((max, table) => Math.max(max, table.sortOrder), -1) + 1
    const saved = await run(async () => {
      await db.transaction('rw', db.mesas, db.comandas, async () => {
        await db.mesas.add({ id: tableId, name: trimmed, sortOrder })
        await db.comandas.add({
          id: uid(),
          tableId,
          tableName: trimmed,
          openedAt: Date.now(),
          closedAt: null,
          status: 'open',
        })
      })
      await record('Mesa aberta', trimmed)
      await reload()
    })
    return saved ? tableId : null
  }

  async function ensureComanda(tableId: string) {
    const table = tables.value.find((row) => row.id === tableId)
    if (!table) return null
    const existing = openComandaFor(tableId)
    if (existing) return existing.id
    const id = uid()
    const saved = await run(async () => {
      await db.comandas.add({
        id,
        tableId,
        tableName: table.name,
        openedAt: Date.now(),
        closedAt: null,
        status: 'open',
      })
      await reload()
    })
    return saved ? id : null
  }

  async function addProductToComanda(comandaId: string, productId: string, qty = 1) {
    const comanda = comandas.value.find((row) => row.id === comandaId && row.status === 'open')
    const product = products.value.find((row) => row.id === productId)
    if (!comanda || !product?.active) {
      flash('Não dá para lançar esse item.')
      return false
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) return false
    const existing = items.value.find(
      (item) =>
        item.comandaId === comandaId &&
        item.productId === product.id &&
        item.status === 'open' &&
        item.unitPriceCents === product.priceCents,
    )
    if (existing) return changeItemQty(existing.id, existing.qty + qty)
    if (product.trackStock && product.stockQty < qty) {
      flash(product.stockQty < 1 ? `Sem estoque de ${product.name}.` : `Só tem ${product.stockQty} de ${product.name} no estoque.`)
      return false
    }
    return run(async () => {
      await db.transaction('rw', db.items, db.products, db.movements, async () => {
        await db.items.add({
          id: uid(),
          comandaId,
          productId: product.id,
          name: product.name,
          unitPriceCents: product.priceCents,
          qty,
          status: 'open',
          createdAt: Date.now(),
        })
        if (product.trackStock) {
          await db.products.update(product.id, { stockQty: product.stockQty - qty })
          await db.movements.add({
            id: uid(),
            productId: product.id,
            delta: -qty,
            reason: 'sale',
            createdAt: Date.now(),
            note: '',
          })
        }
      })
      await record('Item lançado', `${qty} × ${product.name} em ${comanda.tableName}`)
      await reload()
    })
  }

  async function changeItemQty(itemId: string, nextQty: number) {
    const item = items.value.find((row) => row.id === itemId)
    if (!item || item.status !== 'open') return false
    if (!Number.isInteger(nextQty) || nextQty < 0 || nextQty > 999 || nextQty === item.qty) return false
    const product = products.value.find((row) => row.id === item.productId) ?? null
    const soldDelta = nextQty === 0 ? -item.qty : nextQty - item.qty
    if (soldDelta > 0 && product?.trackStock && product.stockQty < soldDelta) {
      flash(`Só tem ${product.stockQty} de ${product.name} no estoque.`)
      return false
    }
    return run(async () => {
      await db.transaction('rw', db.items, db.products, db.movements, async () => {
        if (nextQty === 0) {
          await db.items.update(item.id, { status: 'cancelled' })
        } else {
          await db.items.update(item.id, { qty: nextQty })
        }
        if (product?.trackStock && soldDelta !== 0) {
          await db.products.update(product.id, { stockQty: product.stockQty - soldDelta })
          await db.movements.add({
            id: uid(),
            productId: product.id,
            delta: -soldDelta,
            reason: soldDelta > 0 ? 'sale' : 'cancel',
            createdAt: Date.now(),
            note: '',
          })
        }
      })
      const where = comandas.value.find((row) => row.id === item.comandaId)?.tableName ?? 'comanda'
      const detail = nextQty === 0 ? `${item.name} em ${where}` : `${item.name} ${item.qty} → ${nextQty} em ${where}`
      await record(nextQty === 0 ? 'Item cancelado' : 'Quantidade', detail)
      await reload()
    })
  }

  async function payItems(comandaId: string, selections: ItemSelection[], method: PaymentMethod) {
    const comanda = comandas.value.find((row) => row.id === comandaId && row.status === 'open')
    if (!comanda) return 'failed' as const
    if (selections.length === 0) {
      flash('Marque pelo menos um item.')
      return 'failed' as const
    }
    const splits: { item: ComandaItem; qty: number }[] = []
    let amount = 0
    for (const selection of selections) {
      const item = items.value.find(
        (row) => row.id === selection.itemId && row.comandaId === comandaId && row.status === 'open',
      )
      if (!item || !Number.isInteger(selection.qty) || selection.qty < 1 || selection.qty > item.qty) {
        flash('A seleção mudou. Tente de novo.')
        return 'failed' as const
      }
      amount += item.unitPriceCents * selection.qty
      splits.push({ item, qty: selection.qty })
    }
    if (amount < 1) {
      flash('Esses itens não têm valor para cobrar.')
      return 'failed' as const
    }
    if (amount > dueOf(comandaId)) {
      flash('Esse valor passa do que ainda está em aberto. Quite o restante em valor.')
      return 'failed' as const
    }
    const tableName = nameForComanda(comandaId)
    const shouldClose = amount === dueOf(comandaId)
    const outcome: { value: 'partial' | 'closed' } = { value: 'partial' }
    const saved = await run(async () => {
      let closed = false
      await db.transaction('rw', db.items, db.payments, db.comandas, db.mesas, async () => {
        const paidIds: string[] = []
        for (const split of splits) {
          if (split.qty === split.item.qty) {
            await db.items.update(split.item.id, { status: 'paid' })
            paidIds.push(split.item.id)
          } else {
            const paidId = uid()
            await db.items.update(split.item.id, { qty: split.item.qty - split.qty })
            await db.items.add({
              id: paidId,
              comandaId,
              productId: split.item.productId,
              name: split.item.name,
              unitPriceCents: split.item.unitPriceCents,
              qty: split.qty,
              status: 'paid',
              createdAt: Date.now(),
            })
            paidIds.push(paidId)
          }
        }
        await db.payments.add({
          id: uid(),
          comandaId,
          amountCents: amount,
          method,
          itemIds: paidIds,
          payerName: '',
          createdAt: Date.now(),
        })
        closed = await settle(comandaId, comanda.tableId, tableName, shouldClose)
      })
      await record('Pagamento', `${formatCents(amount)} · ${methodLabel[method]} · itens · ${tableName}`)
      if (closed) await record('Mesa fechada', tableName)
      await reload()
      outcome.value = closed ? 'closed' : 'partial'
    })
    if (!saved) return 'failed' as const
    flash(outcome.value === 'closed' ? `${tableName} fechada.` : 'Pagamento registrado.')
    return outcome.value
  }

  async function payAmount(comandaId: string, amountCents: number, method: PaymentMethod, payerName: string) {
    const comanda = comandas.value.find((row) => row.id === comandaId && row.status === 'open')
    if (!comanda) return 'failed' as const
    const who = payerName.trim()
    if (!who || who.length > 40) {
      flash('Diga quem pagou.')
      return 'failed' as const
    }
    const due = dueOf(comandaId)
    if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > due) {
      flash('Informe um valor até o que está em aberto.')
      return 'failed' as const
    }
    const tableName = nameForComanda(comandaId)
    const shouldClose = amountCents === due
    const outcome: { value: 'partial' | 'closed' } = { value: 'partial' }
    const saved = await run(async () => {
      let closed = false
      await db.transaction('rw', db.payments, db.items, db.comandas, db.mesas, async () => {
        await db.payments.add({
          id: uid(),
          comandaId,
          amountCents,
          method,
          itemIds: [],
          payerName: who,
          createdAt: Date.now(),
        })
        closed = await settle(comandaId, comanda.tableId, tableName, shouldClose)
      })
      await record('Pagamento', `${formatCents(amountCents)} · ${methodLabel[method]} · ${who} · ${tableName}`)
      if (closed) await record('Mesa fechada', tableName)
      await reload()
      outcome.value = closed ? 'closed' : 'partial'
    })
    if (!saved) return 'failed' as const
    flash(outcome.value === 'closed' ? `${tableName} fechada.` : `${who} pagou ${tableName}.`)
    return outcome.value
  }

  async function closeComanda(comandaId: string) {
    const comanda = comandas.value.find((row) => row.id === comandaId && row.status === 'open')
    if (!comanda) return false
    if (dueOf(comandaId) > 0) {
      flash('Ainda há valor em aberto.')
      return false
    }
    const tableName = nameForComanda(comandaId)
    const saved = await run(async () => {
      await db.transaction('rw', db.items, db.comandas, db.mesas, async () => {
        const rows = await db.items.where('comandaId').equals(comandaId).toArray()
        for (const item of rows) {
          if (item.status === 'open') await db.items.update(item.id, { status: 'paid' })
        }
        await db.comandas.update(comandaId, {
          status: 'closed',
          closedAt: Date.now(),
          tableName,
        })
        await db.mesas.delete(comanda.tableId)
      })
      await record('Mesa fechada', tableName)
      await reload()
    })
    if (saved) flash(`${tableName} fechada.`)
    return saved
  }

  async function saveProduct(draft: ProductDraft) {
    const name = draft.name.trim()
    const category = draft.category.trim() || 'Geral'
    if (!name || name.length > 40) {
      flash('Dê um nome ao produto.')
      return false
    }
    if (category.length > 24) {
      flash('Encurte o nome da categoria.')
      return false
    }
    if (!Number.isInteger(draft.priceCents) || draft.priceCents < 0 || draft.priceCents > 10_000_000) {
      flash('Preço inválido.')
      return false
    }
    if (draft.lowStockAt !== null && (!Number.isInteger(draft.lowStockAt) || draft.lowStockAt < 0)) {
      flash('O aviso de estoque precisa ser um número inteiro.')
      return false
    }
    const existing = draft.id ? products.value.find((product) => product.id === draft.id) : undefined
    if (draft.id && !existing) {
      flash('Produto não encontrado.')
      return false
    }
    if (!existing && (draft.openingQty === null || !Number.isInteger(draft.openingQty) || draft.openingQty < 0)) {
      flash('Informe a quantidade em estoque.')
      return false
    }
    const saved = await run(async () => {
      await db.transaction('rw', db.products, db.movements, async () => {
        if (!existing) {
          const id = uid()
          const stockQty = draft.openingQty ?? 0
          await db.products.add({
            id,
            name,
            priceCents: draft.priceCents,
            category,
            trackStock: true,
            stockQty,
            lowStockAt: draft.lowStockAt,
            active: true,
          })
          if (stockQty > 0) {
            await db.movements.add({
              id: uid(),
              productId: id,
              delta: stockQty,
              reason: 'purchase',
              createdAt: Date.now(),
              note: 'Saldo inicial',
            })
          }
          return
        }
        await db.products.update(existing.id, {
          name,
          priceCents: draft.priceCents,
          category,
          trackStock: true,
          lowStockAt: draft.lowStockAt,
        })
      })
      await record(existing ? 'Produto editado' : 'Produto criado', `${name} · ${formatCents(draft.priceCents)}`)
      await reload()
    })
    if (saved) flash('Produto salvo.')
    return saved
  }

  async function setProductActive(id: string, active: boolean) {
    const product = products.value.find((row) => row.id === id)
    if (!product || product.active === active) return false
    const saved = await run(async () => {
      await db.products.update(id, { active })
      await record(active ? 'Produto reativado' : 'Produto arquivado', product.name)
      await reload()
    })
    if (saved) flash(active ? 'Produto reativado.' : 'Produto arquivado.')
    return saved
  }

  async function deleteProduct(id: string) {
    const product = products.value.find((row) => row.id === id)
    if (!product) return false
    const openLines = items.value.filter((item) => item.productId === id && item.status === 'open')
    if (openLines.length) {
      const names = [...new Set(openLines.map((item) => comandas.value.find((row) => row.id === item.comandaId)?.tableName ?? 'uma mesa'))]
      flash(`${product.name} está em ${names.join(', ')}. Tire da mesa antes de apagar.`)
      return false
    }
    const saved = await run(async () => {
      await db.transaction('rw', db.products, db.movements, async () => {
        await db.movements.where('productId').equals(id).delete()
        await db.products.delete(id)
      })
      await record('Produto apagado', product.name)
      await reload()
    })
    if (saved) flash('Produto apagado.')
    return saved
  }

  async function receiveStock(productId: string, qty: number, note: string) {
    const product = products.value.find((row) => row.id === productId)
    if (!product) return false
    if (!Number.isInteger(qty) || qty < 1 || qty > 100_000) {
      flash('Informe uma quantidade inteira.')
      return false
    }
    const saved = await run(async () => {
      await db.transaction('rw', db.products, db.movements, async () => {
        await db.products.update(product.id, { stockQty: product.stockQty + qty })
        await db.movements.add({
          id: uid(),
          productId: product.id,
          delta: qty,
          reason: 'purchase',
          createdAt: Date.now(),
          note: note.trim().slice(0, 80),
        })
      })
      const noteText = note.trim()
      await record('Entrada', `${product.name} +${qty}${noteText ? ` · ${noteText}` : ''}`)
      await reload()
    })
    if (saved) flash('Entrada registrada.')
    return saved
  }

  async function adjustStock(productId: string, newQty: number, note: string) {
    const product = products.value.find((row) => row.id === productId)
    if (!product) return false
    if (!Number.isInteger(newQty) || newQty < 0 || newQty > 100_000) {
      flash('Informe a quantidade contada.')
      return false
    }
    if (newQty === product.stockQty) {
      flash('O estoque já está nessa quantidade.')
      return false
    }
    const delta = newQty - product.stockQty
    const saved = await run(async () => {
      await db.transaction('rw', db.products, db.movements, async () => {
        await db.products.update(product.id, { stockQty: newQty })
        await db.movements.add({
          id: uid(),
          productId: product.id,
          delta,
          reason: 'adjustment',
          createdAt: Date.now(),
          note: note.trim().slice(0, 80),
        })
      })
      await record('Ajuste', `${product.name} agora ${newQty}`)
      await reload()
    })
    if (saved) flash('Estoque ajustado.')
    return saved
  }

  function exportBackup() {
    const payload = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      products: products.value,
      tables: tables.value,
      comandas: comandas.value,
      items: items.value,
      payments: payments.value,
      movements: movements.value,
      audits: audits.value,
      ...(pix.value.key ? { pix: pix.value } : {}),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `balcao-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    void record('Backup exportado', 'JSON').then(() => reload())
    flash('Backup baixado.')
  }

  async function importBackup(file: File) {
    if (file.size > 5_000_000) {
      flash('Arquivo grande demais.')
      return false
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      flash('Não consegui ler esse arquivo.')
      return false
    }
    const backup = parseBackup(parsed)
    if (!backup) {
      flash('Esse arquivo não é um backup do Balcão.')
      return false
    }
    const saved = await run(async () => {
      await db.transaction('rw', [db.products, db.mesas, db.comandas, db.items, db.payments, db.movements, db.audits, db.meta], async () => {
        await db.products.clear()
        await db.mesas.clear()
        await db.comandas.clear()
        await db.items.clear()
        await db.payments.clear()
        await db.movements.clear()
        await db.audits.clear()
        if (backup.products.length) await db.products.bulkAdd(backup.products)
        if (backup.tables.length) await db.mesas.bulkAdd(backup.tables)
        if (backup.comandas.length) await db.comandas.bulkAdd(backup.comandas)
        if (backup.items.length) await db.items.bulkAdd(backup.items)
        if (backup.payments.length) await db.payments.bulkAdd(backup.payments)
        if (backup.movements.length) await db.movements.bulkAdd(backup.movements)
        if (backup.audits.length) await db.audits.bulkAdd(backup.audits)
        await db.meta.put({ key: 'initialized', value: '1' })
        if (backup.pix) {
          await db.meta.put({ key: 'pixKey', value: backup.pix.key })
          await db.meta.put({ key: 'pixName', value: backup.pix.name })
          await db.meta.put({ key: 'pixCity', value: backup.pix.city })
        }
      })
      await tidy()
      await record('Backup importado', `${backup.products.length} produtos`)
      await reload()
    })
    if (saved) flash('Backup restaurado.')
    return saved
  }

  async function savePix(draft: PixProfile) {
    const key = normalizePixKey(draft.key)
    const name = normalizePixLabel(draft.name, 25)
    const city = normalizePixLabel(draft.city, 15)
    if (!key) {
      flash('Use CPF, CNPJ, e-mail, celular com DDD ou chave aleatória.')
      return false
    }
    if (!name) {
      flash('O nome de quem recebe precisa ter letras ou números.')
      return false
    }
    if (!city) {
      flash('A cidade precisa ter letras ou números.')
      return false
    }
    const saved = await run(async () => {
      await db.transaction('rw', db.meta, async () => {
        await db.meta.put({ key: 'pixKey', value: key })
        await db.meta.put({ key: 'pixName', value: name })
        await db.meta.put({ key: 'pixCity', value: city })
      })
      await record('Chave Pix', 'Dados do QR atualizados')
      await reload()
    })
    if (saved) flash('Chave Pix salva.')
    return saved
  }

  return {
    ready,
    busy,
    notice,
    dialog,
    products,
    tables,
    comandas,
    items,
    payments,
    movements,
    audits,
    pix,
    lowStockProducts,
    flash,
    dismissNotice,
    ask,
    answer,
    init,
    openComandaFor,
    itemsOf,
    dueOf,
    consumptionOf,
    paidOf,
    nameForComanda,
    productById,
    latestMovement,
    tableItemQty,
    openTable,
    ensureComanda,
    addProductToComanda,
    changeItemQty,
    payItems,
    payAmount,
    closeComanda,
    saveProduct,
    setProductActive,
    deleteProduct,
    receiveStock,
    adjustStock,
    exportBackup,
    importBackup,
    savePix,
    trace,
  }
})
