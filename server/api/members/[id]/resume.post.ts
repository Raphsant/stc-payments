export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const actor = await requireActor(event)
    await requireDiscordUser(id)

    const m = await Membership.findById(id)
    if (!m || m.status !== 'paused') {
        throw createError({ statusCode: 409, statusMessage: 'La membresía no está pausada' })
    }

    await setAlphaRole(id, true, `Membresía reanudada por ${actor} (stc-payments)`)

    m.status = 'active'
    for (const p of m.pauses) if (!p.resumedAt) p.resumedAt = new Date()
    m.history.push(historyEntry('resumed', actor))
    await m.save()

    return serializeMembership(m.toObject())
})
