// Contract balances. Payments linked to a contract fill its installments in
// due-date order, so a late or partial payment still lands on the oldest
// open installment. Nothing here is stored: it's recomputed on every read.

const DAY = 86_400_000
const cents = (n: number) => Math.round(n * 100) / 100

export type InstallmentStatus = 'paid' | 'partial' | 'overdue' | 'pending'

function todayUtc(now = new Date()) {
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
}

export function summarizeContract(c: any, payments: any[], now = new Date()) {
    const today = todayUtc(now)
    const id = String(c._id)
    const linked = payments.filter(p => p.contractId === id)
    const paid = cents(linked.reduce((s, p) => s + p.amount, 0))

    // No plan → the whole value is due on the start date.
    const plan = (c.installments?.length ? c.installments : [{ _id: 'single', dueAt: c.startsAt, amount: c.value }])
        .map((i: any) => ({ _id: String(i._id), dueAt: new Date(i.dueAt), amount: i.amount }))
        .sort((a: any, b: any) => a.dueAt.getTime() - b.dueAt.getTime())

    let left = paid
    let overdue = 0
    let nextDue: { dueAt: Date; amount: number } | null = null
    let oldestOverdueAt: Date | null = null
    const installments = plan.map((i: any) => {
        const covered = cents(Math.min(i.amount, Math.max(0, left)))
        left = cents(left - covered)
        const remaining = cents(i.amount - covered)
        const late = i.dueAt.getTime() < today
        let status: InstallmentStatus = 'paid'
        if (remaining > 0) {
            status = late ? 'overdue' : covered > 0 ? 'partial' : 'pending'
            if (late) {
                overdue += remaining
                oldestOverdueAt ??= i.dueAt
            } else {
                nextDue ??= { dueAt: i.dueAt, amount: remaining }
            }
        }
        return { ...i, paid: covered, remaining, status }
    })

    const balance = cents(c.value - paid)
    return {
        _id: id,
        startsAt: c.startsAt,
        value: c.value,
        note: c.note ?? '',
        hasPlan: !!c.installments?.length,
        installments,
        paid,
        // never negative: an overpayment shows as credit instead
        due: Math.max(0, balance),
        credit: Math.max(0, -balance),
        overdue: cents(overdue),
        overdueDays: oldestOverdueAt ? Math.round((today - (oldestOverdueAt as Date).getTime()) / DAY) : 0,
        nextDue,
        paymentCount: linked.length,
    }
}

// Newest contract first.
export function summarizeContracts(m: any, now = new Date()) {
    const payments = m?.payments || []
    return [...(m?.contracts || [])]
        .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
        .map(c => summarizeContract(c, payments, now))
}

// { startsAt, value, installments?: [{ dueAt, amount }], note? }. A plan must
// add up to the contract value, so "por cobrar" and the plan never disagree.
export function parseContractBody(body: any) {
    const startsAt = parseOptionalDate(body?.startsAt, 'startsAt')
    if (!startsAt) throw createError({ statusCode: 400, statusMessage: 'Falta la fecha de inicio del contrato' })
    const value = parseAmount(body?.value)

    const raw = Array.isArray(body?.installments) ? body.installments : []
    if (raw.length > 120) throw createError({ statusCode: 400, statusMessage: 'Demasiadas cuotas' })
    const installments = raw.map((i: any, n: number) => {
        const dueAt = parseOptionalDate(i?.dueAt, `cuota ${n + 1}`)
        if (!dueAt) throw createError({ statusCode: 400, statusMessage: `Falta la fecha de la cuota ${n + 1}` })
        return { dueAt, amount: parseAmount(i?.amount) }
    })
    if (installments.length) {
        const sum = cents(installments.reduce((s: number, i: any) => s + i.amount, 0))
        if (Math.abs(sum - value) > 0.009) {
            throw createError({ statusCode: 400, statusMessage: `Las cuotas suman ${sum} y el contrato vale ${value}` })
        }
    }

    const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : ''
    return { startsAt, value, installments, note }
}

export function requireContract(m: any, contractId: string | undefined) {
    const c = m?.contracts?.find((c: any) => String(c._id) === contractId)
    if (!c) throw createError({ statusCode: 404, statusMessage: 'Contrato no encontrado' })
    return c
}
