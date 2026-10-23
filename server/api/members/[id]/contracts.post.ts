// New contract (first sale or a renewal). `assignPaymentIds` links payments
// that aren't on any contract yet, e.g. a down payment logged before the plan.
export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const actor = await requireActor(event)
    await requireDiscordUser(id)
    const body = await readBody(event)
    const contract = { ...parseContractBody(body), by: actor }

    const m = await Membership.findByIdAndUpdate(
        id,
        {
            $push: {
                contracts: contract,
                history: historyEntry('contract-created', actor, `${contract.value} · ${contract.installments.length || 1}`),
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    const assign: string[] = Array.isArray(body?.assignPaymentIds) ? body.assignPaymentIds.map(String) : []
    if (assign.length) {
        const created = m!.contracts[m!.contracts.length - 1]!
        for (const p of m!.payments) {
            if (!p.contractId && assign.includes(String(p._id))) p.contractId = String(created._id)
        }
        await m!.save()
    }

    return serializeMembership(m!.toObject())
})
