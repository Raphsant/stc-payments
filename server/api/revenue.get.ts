// Every recorded Alpha payment in [from, to] (YYYY-MM-DD, both inclusive, UTC),
// whatever the member's current status — a removed Alpha's past payments are
// still revenue. Bucketing by day/week/month happens on the client.
export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const from = parseOptionalDate(query.from, 'from')
    const to = parseOptionalDate(query.to, 'to')

    const paidAt: Record<string, Date> = {}
    if (from) paidAt.$gte = from
    if (to) paidAt.$lt = new Date(to.getTime() + 86_400_000)

    const rows = await Membership.aggregate([
        { $unwind: '$payments' },
        ...(Object.keys(paidAt).length ? [{ $match: { 'payments.paidAt': paidAt } }] : []),
        { $project: { _id: 0, memberId: '$_id', payment: '$payments' } },
        { $sort: { 'payment.paidAt': 1 } },
    ])

    const users = await DiscordUser.find(
        { _id: { $in: [...new Set(rows.map(r => r.memberId))] } },
        { username: 1 },
    ).lean()
    const names = new Map(users.map(u => [u._id, u.username]))

    return rows.map(r => ({
        _id: String(r.payment._id),
        memberId: r.memberId,
        username: names.get(r.memberId) ?? r.memberId,
        amount: r.payment.amount,
        paidAt: r.payment.paidAt,
        note: r.payment.note,
    }))
})
