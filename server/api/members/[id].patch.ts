// Edit the payment details. Upserts, so an Alpha that was promoted by hand in
// Discord (no Membership doc yet) gets one the first time it's edited.
export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const actor = await requireActor(event)
    await requireDiscordUser(id)
    const body = await readBody(event)

    const $set: Record<string, any> = {}
    const purchasedAt = parseOptionalDate(body?.purchasedAt, 'purchasedAt')
    const expiresAt = parseOptionalDate(body?.expiresAt, 'expiresAt')
    if (purchasedAt !== undefined) $set.purchasedAt = purchasedAt
    if (expiresAt !== undefined) $set.expiresAt = expiresAt
    if (typeof body?.notes === 'string') $set.notes = body.notes.slice(0, 4000)

    if (!Object.keys($set).length) {
        throw createError({ statusCode: 400, statusMessage: 'Nada que actualizar' })
    }

    const m = await Membership.findByIdAndUpdate(
        id,
        { $set, $push: { history: historyEntry('updated', actor, Object.keys($set).join(', ')) } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    return serializeMembership(m)
})
