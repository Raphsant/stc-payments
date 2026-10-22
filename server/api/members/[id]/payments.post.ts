// Record money received for the membership: { amount, paidAt, note?, fileId? }.
// fileId optionally links one of the member's payment proofs.
export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const actor = await requireActor(event)
    await requireDiscordUser(id)
    const body = await readBody(event)

    const amount = parseAmount(body?.amount)
    const paidAt = parseOptionalDate(body?.paidAt, 'paidAt')
    if (!paidAt) throw createError({ statusCode: 400, statusMessage: 'Falta la fecha del pago' })
    const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : ''

    let fileId: string | null = null
    if (body?.fileId) {
        const existing = await Membership.findById(id, { files: 1 }).lean()
        const file = existing?.files?.find((f: any) => String(f._id) === String(body.fileId) && f.kind === 'payment')
        if (!file) throw createError({ statusCode: 400, statusMessage: 'Comprobante no encontrado' })
        fileId = String(file._id)
    }

    const m = await Membership.findByIdAndUpdate(
        id,
        {
            $push: {
                payments: { amount, paidAt, note, fileId, by: actor },
                history: historyEntry('payment-added', actor, `${amount} · ${paidAt.toISOString().slice(0, 10)}`),
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    return serializeMembership(m)
})
