// Detaches the file from the member. The S3 object is kept on purpose: payment
// evidence shouldn't be destroyed by a misclick.
export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const actor = await requireActor(event)
    const fileId = getRouterParam(event, 'fileId')

    const m = await Membership.findById(id)
    const file = m?.files?.find((f: any) => String(f._id) === fileId)
    if (!m || !file) throw createError({ statusCode: 404, statusMessage: 'Archivo no encontrado' })

    m.files.pull(file._id)
    m.history.push(historyEntry('file-deleted', actor, file.fileName))
    await m.save()

    return serializeMembership(m.toObject())
})
