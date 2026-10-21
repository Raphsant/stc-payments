// Calls stcbot's /api/members/:id/alpha endpoints. The bot does the actual
// Discord role change and writes DiscordUser.roles, so after this resolves the
// DB already reflects the new role list.
export async function setAlphaRole(discordId: string, add: boolean, reason?: string) {
    const { botUrl, botApiKey } = useRuntimeConfig()
    if (!botApiKey) {
        throw createError({ statusCode: 500, statusMessage: 'NUXT_BOT_API_KEY no está configurado' })
    }

    try {
        return await $fetch<{ id: string; roles: string[] }>(`${botUrl}/api/members/${discordId}/alpha`, {
            method: add ? 'POST' : 'DELETE',
            headers: { 'x-api-key': botApiKey as string },
            body: { reason },
            timeout: 15000,
        })
    } catch (e: any) {
        const status = e?.response?.status
        const code = e?.data?.error
        if (status === 404 && code === 'not_in_guild') {
            throw createError({ statusCode: 404, statusMessage: 'El usuario ya no está en el servidor de Discord' })
        }
        if (status === 404) {
            throw createError({ statusCode: 502, statusMessage: 'El bot no tiene el endpoint de Alpha — ¿está desplegada la última versión?' })
        }
        if (status === 401) {
            throw createError({ statusCode: 502, statusMessage: 'El bot rechazó la API key' })
        }
        if (code === 'alpha_role_not_found') {
            throw createError({ statusCode: 502, statusMessage: 'El bot no encontró el rol Alpha' })
        }
        throw createError({ statusCode: 502, statusMessage: 'No se pudo contactar al bot' })
    }
}
