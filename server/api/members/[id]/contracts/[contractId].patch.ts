export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const actor = await requireActor(event)
    const update = parseContractBody(await readBody(event))

    const m = await Membership.findById(id)
    const c = requireContract(m, getRouterParam(event, 'contractId'))
    c.startsAt = update.startsAt
    c.value = update.value
    c.installments = update.installments
    c.note = update.note
    m!.history.push(historyEntry('contract-updated', actor, `${update.value} · ${update.installments.length || 1}`))
    await m!.save()

    return serializeMembership(m!.toObject())
})
