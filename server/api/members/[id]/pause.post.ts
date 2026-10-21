// Removes the Alpha role now and records when the pause should end. Nothing
// automatic happens at resumesAt — someone presses "Reanudar".
export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const actor = await requireActor(event)
    await requireDiscordUser(id)
    const body = await readBody(event)

    const months = Number(body?.months)
    if (!Number.isInteger(months) || months < 1 || months > 24) {
        throw createError({ statusCode: 400, statusMessage: 'Meses debe ser un entero entre 1 y 24' })
    }
    const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 400) : ''
    const extendExpiry = body?.extendExpiry !== false

    const existing = await Membership.findById(id)
    if (existing?.status === 'paused') {
        throw createError({ statusCode: 409, statusMessage: 'La membresía ya está pausada' })
    }

    await setAlphaRole(id, false, `Membresía pausada ${months} mes(es) por ${actor} (stc-payments)`)

    const now = new Date()
    const m = existing ?? new Membership({ _id: id })
    m.status = 'paused'
    m.pauses.push({ startedAt: now, months, resumesAt: addMonths(now, months), reason, by: actor })
    if (extendExpiry && m.expiresAt) m.expiresAt = addMonths(m.expiresAt, months)
    m.history.push(historyEntry('paused', actor,
        `${months} mes(es)${extendExpiry && m.expiresAt ? ', vencimiento extendido' : ''}${reason ? ` — ${reason}` : ''}`))
    await m.save()

    return serializeMembership(m.toObject())
})
