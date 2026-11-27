import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { parseBackup } from '../backup'
import { db } from '../db'
import { methodLabel } from '../labels'
import { formatCents } from '../money'
import type {
  AuditEntry,
  BarTable,
  CashDrop,
  CashSession,
  Comanda,
  ComandaItem,
  Debt,
  ItemSelection,
  ItemStatus,
  Payment,
  PaymentMethod,
  Product,
  ProductDraft,
  StockMovement,
} from '../types'

export interface ConfirmLine {
  label: string
  value: string
  strong?: boolean
}

export interface ConfirmState {
  title: string
  body: string
  lines: ConfirmLine[]
  note: string
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
  const sessions = ref<CashSession[]>([])
  const drops = ref<CashDrop[]>([])
  const debts = ref<Debt[]>([])
  const monthGoalCents = ref<number | null>(null)

  let noticeTimer = 0
  let resolver: ((value: boolean) => void) | null = null

  const openSession = computed(() => sessions.value.find((session) => session.status === 'open') ?? null)
  const openDebts = computed(() =>
    debts.value.filter((debt) => debt.status === 'open').sort((a, b) => a.createdAt - b.createdAt),
  )

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

  function ask(
    title: string,
    body: string,
    confirmLabel = 'Confirmar',
    details?: { lines?: ConfirmLine[]; note?: string },
  ) {
    if (resolver) resolver(false)
    return new Promise<boolean>((resolve) => {
      resolver = resolve
      dialog.value = {
        title,
        body,
        lines: details?.lines ?? [],
        note: details?.note ?? '',
        confirmLabel,
      }
    })
  }

  function answer(value: boolean) {
    dialog.value = null
    const resolve = resolver
    resolver = null
    resolve?.(value)
  }

  async function reload() {
    const [productRows, tableRows, comandaRows, itemRows, paymentRows, movementRows, auditRows, sessionRows, dropRows, debtRows, goalRow] = await Promise.all([
      db.products.toArray(),
      db.mesas.toArray(),
      db.comandas.toArray(),
      db.items.toArray(),
      db.payments.toArray(),
      db.movements.toArray(),
      db.audits.toArray(),
      db.sessions.toArray(),
      db.drops.toArray(),
      db.debts.toArray(),
      db.meta.get('monthGoalCents'),
    ])
    products.value = productRows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    tables.value = tableRows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'))
    comandas.value = comandaRows
    items.value = itemRows
    payments.value = paymentRows.map((payment) => ({
      ...payment,
      payerName: typeof payment.payerName === 'string' ? payment.payerName : '',
      debtId: typeof payment.debtId === 'string' ? payment.debtId : '',
    }))
    movements.value = movementRows
    audits.value = auditRows.sort((a, b) => b.createdAt - a.createdAt)
    sessions.value = sessionRows.sort((a, b) => b.openedAt - a.openedAt)
    drops.value = dropRows.sort((a, b) => b.createdAt - a.createdAt)
    debts.value = debtRows.sort((a, b) => b.createdAt - a.createdAt)
    const goal = goalRow ? Number(goalRow.value) : null
    monthGoalCents.value = goal !== null && Number.isInteger(goal) && goal > 0 ? goal : null
  }

  async function setMonthGoal(cents: number | null) {
    if (cents !== null && (!Number.isInteger(cents) || cents < 1 || cents > 100_000_000)) {
      flash('Digite a meta com até duas casas. Ex.: 8000,00')
      return false
    }
    const saved = await run(async () => {
      if (cents === null) await db.meta.delete('monthGoalCents')
      else await db.meta.put({ key: 'monthGoalCents', value: String(cents) })
      await record('Meta', cents === null ? 'Tirou a meta mensal.' : `Definiu a meta mensal em ${formatCents(cents)}.`)
      await reload()
    })
    if (saved) flash(cents === null ? 'Meta removida.' : 'Meta salva.')
    return saved
  }

  function cashPosition(session: CashSession) {
    const end = session.closedAt ?? Number.POSITIVE_INFINITY
    const inSession = (createdAt: number) => createdAt >= session.openedAt && createdAt < end
    const sum = (method: PaymentMethod) =>
      payments.value
        .filter((payment) => payment.method === method && inSession(payment.createdAt))
        .reduce((total, payment) => total + payment.amountCents, 0)
    const cash = sum('cash')
    const pix = sum('pix')
    const card = sum('card')
    const sangria = drops.value
      .filter((drop) => drop.sessionId === session.id)
      .reduce((total, drop) => total + drop.amountCents, 0)
    return { cash, pix, card, sangria, drawer: session.openingCents + cash - sangria }
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
      .filter((payment) => payment.comandaId === comandaId && payment.itemIds.length === 0 && !payment.debtId)
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
      .filter((payment) => payment.comandaId === comandaId && !payment.debtId)
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
      await record('Mesa aberta', `Abriu a mesa ${trimmed} para atendimento.`)
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
      const left = product.trackStock ? ` Estoque ficou em ${product.stockQty - qty}.` : ''
      await record('Item lançado', `${qty} × ${product.name} a ${formatCents(product.priceCents)} na mesa ${comanda.tableName}.${left}`)
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
      const stockLeft = product?.trackStock ? product.stockQty - soldDelta : null
      const detail =
        nextQty === 0
          ? `Tirou ${item.qty} × ${item.name} da mesa ${where}.${stockLeft !== null ? ` Estoque voltou para ${stockLeft}.` : ''}`
          : `${item.name} na mesa ${where}: quantidade de ${item.qty} para ${nextQty}.${stockLeft !== null ? ` Estoque ficou em ${stockLeft}.` : ''}`
      await record(nextQty === 0 ? 'Item cancelado' : 'Quantidade', detail)
      await reload()
    })
  }

  async function payItems(comandaId: string, selections: ItemSelection[], method: PaymentMethod, payerName = '') {
    const comanda = comandas.value.find((row) => row.id === comandaId && row.status === 'open')
    if (!comanda) return 'failed' as const
    if (!openSession.value) {
      flash('Abra o caixa antes de receber.')
      return 'failed' as const
    }
    const who = payerName.trim()
    if (!who || who.length > 40) {
      flash(method === 'fiado' ? 'Diga quem ficou devendo.' : 'Diga quem pagou.')
      return 'failed' as const
    }
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
      await db.transaction('rw', db.items, db.payments, db.debts, db.comandas, db.mesas, async () => {
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
        const createdAt = Date.now()
        await db.payments.add({
          id: uid(),
          comandaId,
          amountCents: amount,
          method,
          itemIds: paidIds,
          payerName: who,
          debtId: '',
          createdAt,
        })
        if (method === 'fiado') {
          const namesForDebt = splits.map((split) => `${split.qty} × ${split.item.name}`).join(', ')
          await db.debts.add({
            id: uid(),
            personName: who,
            comandaId,
            tableName,
            detail: namesForDebt.slice(0, 160),
            originalCents: amount,
            remainingCents: amount,
            status: 'open',
            createdAt,
            paidAt: null,
          })
        }
        closed = await settle(comandaId, comanda.tableId, tableName, shouldClose)
      })
      const names = splits.map((split) => `${split.qty} × ${split.item.name}`).join(', ')
      const rest = closed ? 'A mesa fechou.' : `Ainda ficou ${formatCents(dueOf(comandaId) - amount)} em aberto.`
      if (method === 'fiado') {
        await record('Fiado', `Anotou ${formatCents(amount)} no fiado de ${who} na mesa ${tableName}. ${names}. Não entrou no caixa.`)
        if (closed) await record('Mesa fechada', `${tableName} saiu da lista com ${formatCents(amount)} no fiado de ${who}.`)
      } else {
        await record('Pagamento', `Recebeu ${formatCents(amount)} em ${methodLabel[method].toLowerCase()} de ${who} na mesa ${tableName}. Itens: ${names}. ${rest}`)
        if (closed) await record('Mesa fechada', `${tableName} saiu da lista depois do pagamento de ${formatCents(amount)} em ${methodLabel[method].toLowerCase()}, feito por ${who}.`)
      }
      await reload()
      outcome.value = closed ? 'closed' : 'partial'
    })
    if (!saved) return 'failed' as const
    if (method === 'fiado') flash(outcome.value === 'closed' ? `${tableName} fechada. Fiado de ${who}.` : `Fiado de ${who} anotado.`)
    else flash(outcome.value === 'closed' ? `${tableName} fechada.` : `${who} pagou ${tableName}.`)
    return outcome.value
  }

  async function payAmount(comandaId: string, amountCents: number, method: PaymentMethod, payerName: string) {
    const comanda = comandas.value.find((row) => row.id === comandaId && row.status === 'open')
    if (!comanda) return 'failed' as const
    if (!openSession.value) {
      flash('Abra o caixa antes de receber.')
      return 'failed' as const
    }
    const who = payerName.trim()
    if (!who || who.length > 40) {
      flash(method === 'fiado' ? 'Diga quem ficou devendo.' : 'Diga quem pagou.')
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
      await db.transaction('rw', db.payments, db.items, db.debts, db.comandas, db.mesas, async () => {
        const createdAt = Date.now()
        await db.payments.add({
          id: uid(),
          comandaId,
          amountCents,
          method,
          itemIds: [],
          payerName: who,
          debtId: '',
          createdAt,
        })
        if (method === 'fiado') {
          await db.debts.add({
            id: uid(),
            personName: who,
            comandaId,
            tableName,
            detail: 'Valor',
            originalCents: amountCents,
            remainingCents: amountCents,
            status: 'open',
            createdAt,
            paidAt: null,
          })
        }
        closed = await settle(comandaId, comanda.tableId, tableName, shouldClose)
      })
      const rest = closed ? 'A mesa fechou.' : `Ainda ficou ${formatCents(due - amountCents)} em aberto.`
      if (method === 'fiado') {
        await record('Fiado', `Anotou ${formatCents(amountCents)} no fiado de ${who} na mesa ${tableName}. Não entrou no caixa. ${rest}`)
        if (closed) await record('Mesa fechada', `${tableName} saiu da lista com ${formatCents(amountCents)} no fiado de ${who}.`)
      } else {
        await record('Pagamento', `Recebeu ${formatCents(amountCents)} em ${methodLabel[method].toLowerCase()} de ${who} na mesa ${tableName}. ${rest}`)
        if (closed) await record('Mesa fechada', `${tableName} saiu da lista depois do pagamento de ${formatCents(amountCents)} em ${methodLabel[method].toLowerCase()}, feito por ${who}.`)
      }
      await reload()
      outcome.value = closed ? 'closed' : 'partial'
    })
    if (!saved) return 'failed' as const
    if (method === 'fiado') flash(outcome.value === 'closed' ? `${tableName} fechada. Fiado de ${who}.` : `Fiado de ${who} anotado.`)
    else flash(outcome.value === 'closed' ? `${tableName} fechada.` : `${who} pagou ${tableName}.`)
    return outcome.value
  }

  async function payDebt(debtId: string, amountCents: number, method: Exclude<PaymentMethod, 'fiado'>) {
    const debt = debts.value.find((row) => row.id === debtId && row.status === 'open')
    if (!debt) {
      flash('Esse fiado já foi quitado.')
      return false
    }
    if (!openSession.value) {
      flash('Abra o caixa antes de receber.')
      return false
    }
    if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > debt.remainingCents) {
      flash(`Informe um valor até ${formatCents(debt.remainingCents)}.`)
      return false
    }
    const saved = await run(async () => {
      const left = debt.remainingCents - amountCents
      const paidAt = Date.now()
      await db.transaction('rw', db.payments, db.debts, async () => {
        await db.payments.add({
          id: uid(),
          comandaId: debt.comandaId,
          amountCents,
          method,
          itemIds: [],
          payerName: debt.personName,
          debtId: debt.id,
          createdAt: paidAt,
        })
        await db.debts.update(debt.id, {
          remainingCents: left,
          status: left === 0 ? 'paid' : 'open',
          paidAt: left === 0 ? paidAt : null,
        })
      })
      const rest = left === 0 ? 'O fiado foi quitado.' : `Ainda ficou ${formatCents(left)}.`
      await record('Fiado recebido', `${debt.personName} pagou ${formatCents(amountCents)} em ${methodLabel[method].toLowerCase()} do fiado da mesa ${debt.tableName}. ${rest}`)
      await reload()
    })
    if (saved) flash(`${debt.personName} pagou ${formatCents(amountCents)}.`)
    return saved
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
      await record('Mesa fechada', `${tableName} foi fechada sem valor em aberto e saiu da lista.`)
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
      const created = `${name}, categoria ${category}, a ${formatCents(draft.priceCents)}, com ${draft.openingQty ?? 0} no estoque.`
      const changes: string[] = []
      if (existing && existing.name !== name) changes.push(`nome de ${existing.name} para ${name}`)
      if (existing && existing.priceCents !== draft.priceCents) changes.push(`preço de ${formatCents(existing.priceCents)} para ${formatCents(draft.priceCents)}`)
      if (existing && existing.category !== category) changes.push(`categoria de ${existing.category} para ${category}`)
      if (existing && existing.lowStockAt !== draft.lowStockAt) changes.push(`aviso de estoque de ${existing.lowStockAt ?? 'nenhum'} para ${draft.lowStockAt ?? 'nenhum'}`)
      const edited = changes.length ? `${name}: ${changes.join('; ')}.` : `${name} foi salvo sem mudança de preço, nome ou categoria.`
      await record(existing ? 'Produto editado' : 'Produto criado', existing ? edited : created)
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
      await record(
        active ? 'Produto reativado' : 'Produto arquivado',
        active
          ? `${product.name} voltou para a venda, com ${product.stockQty} no estoque.`
          : `${product.name} saiu da lista de venda. O estoque de ${product.stockQty} ficou guardado.`,
      )
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
      await record('Produto apagado', `${product.name} foi apagado, junto com o histórico de estoque. As vendas já registradas continuam no caixa.`)
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
      await record('Entrada', `${product.name}: chegaram ${qty}. Estoque foi de ${product.stockQty} para ${product.stockQty + qty}.${noteText ? ` ${noteText}.` : ''}`)
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
      const noteText = note.trim()
      await record('Ajuste', `${product.name}: estoque contado de ${product.stockQty} para ${newQty}.${noteText ? ` ${noteText}.` : ''}`)
      await reload()
    })
    if (saved) flash('Estoque ajustado.')
    return saved
  }

  function backupFileName(date = new Date()) {
    const part = (value: number) => String(value).padStart(2, '0')
    return `balcao-${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}-${part(date.getHours())}-${part(date.getMinutes())}-${part(date.getSeconds())}.json`
  }

  function backupPayload() {
    return {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      products: products.value,
      tables: tables.value,
      comandas: comandas.value,
      items: items.value,
      payments: payments.value,
      movements: movements.value,
      audits: audits.value,
      sessions: sessions.value,
      drops: drops.value,
      debts: debts.value,
      monthGoalCents: monthGoalCents.value,
    }
  }

  function downloadBackup(patch?: { sessions?: CashSession[]; audits?: AuditEntry[] }, when = new Date()) {
    const payload = backupPayload()
    if (patch?.sessions) payload.sessions = patch.sessions
    if (patch?.audits?.length) payload.audits = [...patch.audits, ...payload.audits]
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = backupFileName(when)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    return link.download
  }

  function exportBackup() {
    const fileName = downloadBackup()
    void record('Backup exportado', `Baixou ${fileName} com ${products.value.length} produtos, ${payments.value.length} pagamentos, ${sessions.value.length} caixas e ${openDebts.value.length} fiados.`).then(() => reload())
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
      await db.transaction('rw', [db.products, db.mesas, db.comandas, db.items, db.payments, db.movements, db.audits, db.sessions, db.drops, db.debts, db.meta], async () => {
        await db.products.clear()
        await db.mesas.clear()
        await db.comandas.clear()
        await db.items.clear()
        await db.payments.clear()
        await db.movements.clear()
        await db.audits.clear()
        await db.sessions.clear()
        await db.drops.clear()
        await db.debts.clear()
        if (backup.products.length) await db.products.bulkAdd(backup.products)
        if (backup.tables.length) await db.mesas.bulkAdd(backup.tables)
        if (backup.comandas.length) await db.comandas.bulkAdd(backup.comandas)
        if (backup.items.length) await db.items.bulkAdd(backup.items)
        if (backup.payments.length) await db.payments.bulkAdd(backup.payments)
        if (backup.movements.length) await db.movements.bulkAdd(backup.movements)
        if (backup.audits.length) await db.audits.bulkAdd(backup.audits)
        if (backup.sessions.length) await db.sessions.bulkAdd(backup.sessions)
        if (backup.drops.length) await db.drops.bulkAdd(backup.drops)
        if (backup.debts.length) await db.debts.bulkAdd(backup.debts)
        await db.meta.put({ key: 'initialized', value: '1' })
        if (backup.monthGoalCents) await db.meta.put({ key: 'monthGoalCents', value: String(backup.monthGoalCents) })
        else await db.meta.delete('monthGoalCents')
      })
      await tidy()
      await record('Backup importado', `Substituiu os dados deste celular por ${backup.products.length} produtos, ${backup.payments.length} pagamentos, ${backup.sessions.length} caixas e ${backup.debts.length} fiados.`)
      await reload()
    })
    if (saved) flash('Backup restaurado.')
    return saved
  }

  async function openCashier(openingCents: number) {
    if (openSession.value) {
      flash('O caixa já está aberto.')
      return false
    }
    if (!Number.isInteger(openingCents) || openingCents < 0 || openingCents > 100_000_000) {
      flash('Informe o dinheiro que já está na gaveta.')
      return false
    }
    const saved = await run(async () => {
      await db.sessions.add({
        id: uid(),
        openedAt: Date.now(),
        closedAt: null,
        status: 'open',
        openingCents,
        closingExpectedCents: null,
      })
      await record('Caixa aberto', `Abriu o caixa com ${formatCents(openingCents)} de fundo na gaveta.`)
      await reload()
    })
    if (saved) flash('Caixa aberto.')
    return saved
  }

  async function dropCash(amountCents: number, note: string) {
    const session = openSession.value
    if (!session) {
      flash('Abra o caixa antes da sangria.')
      return false
    }
    if (!Number.isInteger(amountCents) || amountCents < 1) {
      flash('Informe quanto vai sair da gaveta.')
      return false
    }
    const position = cashPosition(session)
    if (amountCents > position.drawer) {
      flash(`A gaveta tem ${formatCents(position.drawer)}.`)
      return false
    }
    const reason = note.trim().slice(0, 80)
    const saved = await run(async () => {
      await db.drops.add({
        id: uid(),
        sessionId: session.id,
        amountCents,
        note: reason,
        createdAt: Date.now(),
      })
      const left = position.drawer - amountCents
      await record('Sangria', `Retirou ${formatCents(amountCents)} da gaveta${reason ? ` (${reason})` : ''}. Ficou ${formatCents(left)} em dinheiro.`)
      await reload()
    })
    if (saved) flash('Sangria registrada.')
    return saved
  }

  async function closeCashier() {
    const session = openSession.value
    if (!session) {
      flash('O caixa já está fechado.')
      return false
    }
    const position = cashPosition(session)
    const closedAt = Date.now()
    const closeDetail = `Fechou o caixa. Na gaveta: ${formatCents(position.drawer)}. Dinheiro ${formatCents(position.cash)}, Pix ${formatCents(position.pix)}, cartão ${formatCents(position.card)}, sangrias ${formatCents(position.sangria)}.`
    const when = new Date(closedAt)
    const fileName = backupFileName(when)
    const backupDetail = `Fechamento baixou ${fileName} com ${products.value.length} produtos, ${payments.value.length} pagamentos, ${sessions.value.length} caixas e ${openDebts.value.length} fiados.`
    const closeAudit: AuditEntry = { id: uid(), createdAt: closedAt, action: 'Caixa fechado', detail: closeDetail.slice(0, 160) }
    const backupAudit: AuditEntry = { id: uid(), createdAt: closedAt + 1, action: 'Backup exportado', detail: backupDetail.slice(0, 160) }
    downloadBackup({
      sessions: sessions.value.map((row) =>
        row.id === session.id ? { ...session, status: 'closed', closedAt, closingExpectedCents: position.drawer } : row,
      ),
      audits: [backupAudit, closeAudit],
    }, when)
    const saved = await run(async () => {
      await db.transaction('rw', db.sessions, db.audits, async () => {
        await db.sessions.update(session.id, {
          status: 'closed',
          closedAt,
          closingExpectedCents: position.drawer,
        })
        await db.audits.bulkAdd([closeAudit, backupAudit])
      })
      const count = await db.audits.count()
      if (count > 400) {
        const extra = await db.audits.orderBy('createdAt').limit(count - 300).primaryKeys()
        if (extra.length) await db.audits.bulkDelete(extra)
      }
      await reload()
    })
    if (!saved) return false
    flash('Caixa fechado. Backup baixado.')
    return true
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
    sessions,
    drops,
    debts,
    monthGoalCents,
    openDebts,
    openSession,
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
    payDebt,
    closeComanda,
    saveProduct,
    setProductActive,
    deleteProduct,
    receiveStock,
    adjustStock,
    exportBackup,
    importBackup,
    cashPosition,
    openCashier,
    dropCash,
    closeCashier,
    setMonthGoal,
  }
})
