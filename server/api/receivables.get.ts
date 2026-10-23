// Everything still owed on contracts ("por cobrar"), per member, plus each
// open installment so the client can chart expected collections by month.
// Members who left or lost Alpha still appear: they may still owe money.
export default defineEventHandler(async () => {
    const memberships = await Membership.find(
        { 'contracts.0': { $exists: true } },
        { contracts: 1, payments: 1, status: 1 },
    ).lean()

    const users = await DiscordUser.find(
        { _id: { $in: memberships.map(m => m._id) } },
        { username: 1, avatarUrl: 1, roles: 1, removedAt: 1 },
    ).lean()
    const byId = new Map(users.map(u => [u._id, u]))

    const members = []
    const installments = []
    for (const m of memberships) {
        const contracts = summarizeContracts(m)
        const owing = contracts.filter(c => c.due > 0)
        if (!owing.length) continue

        const u: any = byId.get(m._id)
        const nextDue = owing
            .map(c => c.nextDue)
            .filter(Boolean)
            .sort((a: any, b: any) => a.dueAt.getTime() - b.dueAt.getTime())[0] ?? null

        members.push({
            _id: m._id,
            username: u?.username ?? m._id,
            avatarUrl: u?.avatarUrl ?? null,
            hasAlphaRole: (u?.roles || []).includes(ALPHA_ROLE),
            removedAt: u?.removedAt ?? null,
            status: m.status,
            value: owing.reduce((s, c) => s + c.value, 0),
            paid: owing.reduce((s, c) => s + c.paid, 0),
            due: owing.reduce((s, c) => s + c.due, 0),
            overdue: owing.reduce((s, c) => s + c.overdue, 0),
            overdueDays: Math.max(...owing.map(c => c.overdueDays)),
            nextDue,
            contracts: owing.length,
        })
        for (const c of owing) {
            for (const i of c.installments) {
                if (i.remaining > 0) installments.push({ memberId: m._id, dueAt: i.dueAt, remaining: i.remaining, status: i.status })
            }
        }
    }

    return { members, installments }
})
