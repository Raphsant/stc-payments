// Move a payment to another contract, or unassign it: { contractId: string | null }.
export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const actor = await requireActor(event)
    const body = await readBody(event)

    const m = await Membership.findById(id)
    const payment = m?.payments?.find((p: any) => String(p._id) === getRouterParam(event, 'paymentId'))
    if (!m || !payment) throw createError({ statusCode: 404, statusMessage: 'Pago no encontrado' })

    const contractId = body?.contractId ? String(requireContract(m, String(body.contractId))._id) : null
    payment.contractId = contractId
    m.history.push(historyEntry('payment-assigned', actor, `${payment.amount} · ${payment.paidAt.toISOString().slice(0, 10)}`))
    await m.save()

    return serializeMembership(m.toObject())
})
