// Everyone with the plain "Alpha" role, plus members we paused (their role is
// gone while paused, but they're still Alphas as far as payments go).
export default defineEventHandler(async () => {
    const paused = await Membership.find({ status: 'paused' }, { _id: 1 }).lean()
    const pausedIds = paused.map(m => m._id)

    const users = await DiscordUser.find(
        { removedAt: null, $or: [{ roles: ALPHA_ROLE }, { _id: { $in: pausedIds } }] },
        { username: 1, avatarUrl: 1, roles: 1, joinedAt: 1 },
    ).lean()

    const memberships = await Membership.find(
        { _id: { $in: users.map(u => u._id) } },
        { status: 1, purchasedAt: 1, expiresAt: 1, files: 1, pauses: 1 },
    ).lean()
    const byId = new Map(memberships.map(m => [m._id, m]))

    return users.map((u) => {
        const m: any = byId.get(u._id)
        const openPause = m?.pauses?.find((p: any) => !p.resumedAt) ?? null
        return {
            _id: u._id,
            username: u.username,
            avatarUrl: u.avatarUrl,
            joinedAt: u.joinedAt,
            hasAlphaRole: (u.roles || []).includes(ALPHA_ROLE),
            status: m?.status ?? 'untracked',
            purchasedAt: m?.purchasedAt ?? null,
            expiresAt: m?.expiresAt ?? null,
            paymentCount: m?.files?.filter((f: any) => f.kind === 'payment').length ?? 0,
            contractCount: m?.files?.filter((f: any) => f.kind === 'contract').length ?? 0,
            resumesAt: openPause?.resumesAt ?? null,
        }
    })
})
