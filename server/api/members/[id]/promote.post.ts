export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const actor = await requireActor(event)
    const user = await requireDiscordUser(id)
    const body = await readBody(event).catch(() => ({}))

    if ((user.roles || []).includes(ALPHA_DOT_ROLE)) {
        throw createError({ statusCode: 409, statusMessage: 'El usuario tiene el rol Alpha.' })
    }

    const purchasedAt = parseOptionalDate(body?.purchasedAt, 'purchasedAt')
    const expiresAt = parseOptionalDate(body?.expiresAt, 'expiresAt')

    await setAlphaRole(id, true, `Promovido a Alpha por ${actor} (stc-payments)`)

    const $set: Record<string, any> = { status: 'active' }
    if (purchasedAt !== undefined) $set.purchasedAt = purchasedAt
    if (expiresAt !== undefined) $set.expiresAt = expiresAt

    const m = await Membership.findByIdAndUpdate(
        id,
        { $set, $push: { history: historyEntry('promoted', actor) } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    return serializeMembership(m)
})
