// Members who can be promoted: no "Alpha" and no "Alpha." role, still in the
// server, and not currently paused (paused Alphas belong on the Alphas list).
export default defineEventHandler(async () => {
    const paused = await Membership.find({ status: 'paused' }, { _id: 1 }).lean()

    const users = await DiscordUser.find(
        {
            removedAt: null,
            roles: { $nin: [ALPHA_ROLE, ALPHA_DOT_ROLE] },
            _id: { $nin: paused.map(m => m._id) },
        },
        { username: 1, avatarUrl: 1, roles: 1, joinedAt: 1, messageCount: 1 },
    ).sort({ joinedAt: -1 }).lean()

    const previous = await Membership.find(
        { _id: { $in: users.map(u => u._id) } },
        { status: 1 },
    ).lean()
    const prevById = new Map(previous.map(m => [m._id, m.status]))

    return users.map(u => ({
        _id: u._id,
        username: u.username,
        avatarUrl: u.avatarUrl,
        joinedAt: u.joinedAt,
        messageCount: u.messageCount ?? 0,
        deltaRole: (u.roles || []).find((r: string) => DELTA_ROLES.includes(r)) ?? null,
        formerAlpha: prevById.get(u._id) === 'removed',
    }))
})
