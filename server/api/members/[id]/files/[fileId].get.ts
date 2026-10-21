// The bucket is private: hand out a short-lived signed URL via redirect so the
// UI can use a plain <a target="_blank">.
export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const fileId = getRouterParam(event, 'fileId')
    const m = await Membership.findById(id, { files: 1 }).lean()
    const file: any = m?.files?.find((f: any) => String(f._id) === fileId)
    if (!file) throw createError({ statusCode: 404, statusMessage: 'Archivo no encontrado' })

    return sendRedirect(event, await createDownloadUrl(file.key, file.fileName), 302)
})
