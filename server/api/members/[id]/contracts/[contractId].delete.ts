// Its payments stay (they're real money received) and become unassigned.
export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const actor = await requireActor(event)
    const contractId = getRouterParam(event, 'contractId')

    const m = await Membership.findById(id)
    const c = requireContract(m, contractId)
    for (const p of m!.payments) if (p.contractId === contractId) p.contractId = null
    m!.contracts.pull(c._id)
    m!.history.push(historyEntry('contract-deleted', actor, String(c.value)))
    await m!.save()

    return serializeMembership(m!.toObject())
})
