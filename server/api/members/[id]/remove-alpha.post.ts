export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const actor = await requireActor(event)
    await requireDiscordUser(id)
    const body = await readBody(event).catch(() => ({}))
    const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 400) : ''

    await setAlphaRole(id, false, `Alpha removido por ${actor} (stc-payments)${reason ? `: ${reason}` : ''}`)

    // Removing also closes any open pause — the member is out, not on hold.
    const existing = await Membership.findById(id)
    const m = existing ?? new Membership({ _id: id })
    m.status = 'removed'
    for (const p of m.pauses) if (!p.resumedAt) p.resumedAt = new Date()
    m.history.push(historyEntry('removed', actor, reason))
    await m.save()

    return serializeMembership(m.toObject())
})
