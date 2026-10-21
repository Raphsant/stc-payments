export const ALPHA_ROLE = 'Alpha'
// "Alpha." and "Delta." are separate tiers in the server — never treat them as
// the plain role.
export const ALPHA_DOT_ROLE = 'Alpha.'
export const DELTA_ROLES = ['Delta', 'Delta.']

export async function requireActor(event: any): Promise<string> {
    const { user } = await requireUserSession(event)
    return (user as any).username
}

export function requireDiscordId(event: any): string {
    const id = getRouterParam(event, 'id')
    if (!id || !/^\d{15,21}$/.test(id)) {
        throw createError({ statusCode: 400, statusMessage: 'ID de Discord inválido' })
    }
    return id
}

export async function requireDiscordUser(id: string) {
    const user = await DiscordUser.findById(id).lean()
    if (!user) throw createError({ statusCode: 404, statusMessage: 'Usuario no encontrado' })
    return user
}

export function parseOptionalDate(value: unknown, field: string): Date | null | undefined {
    if (value === undefined) return undefined
    if (value === null || value === '') return null
    const d = new Date(value as string)
    if (Number.isNaN(d.getTime())) {
        throw createError({ statusCode: 400, statusMessage: `Fecha inválida: ${field}` })
    }
    return d
}

export function addMonths(date: Date, months: number): Date {
    const d = new Date(date)
    d.setUTCMonth(d.getUTCMonth() + months)
    return d
}

export function historyEntry(action: string, by: string, detail = '') {
    return { action, by, detail, at: new Date() }
}

// Shape sent to the client: never leak S3 keys, files are fetched through
// /api/members/:id/files/:fileId which redirects to a short-lived signed URL.
export function serializeMembership(m: any) {
    if (!m) return null
    const openPause = (m.pauses || []).find((p: any) => !p.resumedAt) || null
    return {
        status: m.status,
        purchasedAt: m.purchasedAt,
        expiresAt: m.expiresAt,
        notes: m.notes,
        files: (m.files || []).map((f: any) => ({
            _id: String(f._id),
            kind: f.kind,
            fileName: f.fileName,
            contentType: f.contentType,
            size: f.size,
            uploadedAt: f.uploadedAt,
            uploadedBy: f.uploadedBy,
        })),
        pauses: m.pauses || [],
        currentPause: openPause,
        history: [...(m.history || [])].reverse(),
    }
}
