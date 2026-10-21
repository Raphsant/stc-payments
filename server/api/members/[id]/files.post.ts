import { randomUUID } from 'node:crypto'

// multipart/form-data: `kind` ('payment' | 'contract') + one or more `file`
// parts. Each file is stored in S3 and attached to the member.
export default defineEventHandler(async (event) => {
    const id = requireDiscordId(event)
    const actor = await requireActor(event)
    await requireDiscordUser(id)

    const parts = await readMultipartFormData(event)
    if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No se recibió ningún archivo' })

    const kind = parts.find(p => p.name === 'kind')?.data.toString() as FileKind
    if (!FILE_KINDS.includes(kind)) {
        throw createError({ statusCode: 400, statusMessage: 'Tipo de archivo inválido' })
    }

    const files = parts.filter(p => p.name === 'file' && p.filename)
    if (!files.length) throw createError({ statusCode: 400, statusMessage: 'No se recibió ningún archivo' })
    for (const f of files) {
        if (!ALLOWED_FILE_MIME[f.type || '']) {
            throw createError({ statusCode: 400, statusMessage: `Formato no permitido: ${f.filename} (PNG, JPG, WEBP, GIF o PDF)` })
        }
        if (f.data.length > MAX_FILE_BYTES) {
            throw createError({ statusCode: 413, statusMessage: `${f.filename} es demasiado grande (máx. 15MB)` })
        }
    }

    const added = []
    for (const f of files) {
        const key = `${PAYMENTS_PREFIX}${id}/${kind}/${randomUUID()}.${ALLOWED_FILE_MIME[f.type!]}`
        await putObject(key, f.data, f.type!)
        added.push({ kind, key, fileName: f.filename!.slice(0, 200), contentType: f.type!, size: f.data.length, uploadedBy: actor })
    }

    const m = await Membership.findByIdAndUpdate(
        id,
        {
            $push: {
                files: { $each: added },
                history: {
                    $each: added.map(f => historyEntry(kind === 'payment' ? 'payment-proof-added' : 'contract-added', actor, f.fileName)),
                },
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()

    return serializeMembership(m)
})
