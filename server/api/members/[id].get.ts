export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const user = await requireDiscordUser(id)
    const membership = await Membership.findById(id).lean()

    return {
        user: {
            _id: user._id,
            username: user.username,
            avatarUrl: user.avatarUrl,
            roles: user.roles,
            joinedAt: user.joinedAt,
            removedAt: user.removedAt,
        },
        hasAlphaRole: (user.roles || []).includes(ALPHA_ROLE),
        membership: serializeMembership(membership),
    }
})
