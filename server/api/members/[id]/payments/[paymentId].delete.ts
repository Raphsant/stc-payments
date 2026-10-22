export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const actor = await requireActor(event)
    const paymentId = getRouterParam(event, 'paymentId')

    const m = await Membership.findById(id)
    const payment = m?.payments?.find((p: any) => String(p._id) === paymentId)
    if (!m || !payment) throw createError({ statusCode: 404, statusMessage: 'Pago no encontrado' })

    m.payments.pull(payment._id)
    m.history.push(historyEntry('payment-deleted', actor, `${payment.amount} · ${payment.paidAt.toISOString().slice(0, 10)}`))
    await m.save()

    return serializeMembership(m.toObject())
})
