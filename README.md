# stc-payments

Panel de pagos para las membresías **Alpha** del Stock Trading Club. Hermano de
[`stc-front`](../../WebstormProjects/stc-front) y [`stcbot`](../../WebstormProjects/stcbot).

- **Alphas** (`/`): todos los miembros con el rol `Alpha` (no `Alpha.`) más los que están pausados.
  Filtros por vencimiento, pausas y datos faltantes.
- **Ficha** (`/miembros/:id`): fecha de compra, vencimiento, notas, comprobantes de pago
  (capturas/PDF) y contrato DocuSign firmado (PDF), historial de acciones.
  Botones para pausar X meses, reanudar y quitar Alpha.
- **Pagos** (en la ficha): cada pago recibido con monto, fecha, nota y comprobante opcional.
  Las renovaciones son pagos nuevos.
- **Ingresos** (`/ingresos`): total, número de pagos y gráfica de ingresos por día, semana o mes
  para el año en curso, 30/90 días, 12 meses, todo o un rango personalizado. Todos los montos van en
  una sola moneda (`NUXT_PUBLIC_CURRENCY`, por defecto `USD`).
- **Deltas** (`/deltas`): miembros sin `Alpha` ni `Alpha.` — botón para hacerlos Alpha.

## Compartido con stc-front

- Mismo MongoDB (`discordusers`, `users`) + colección nueva `memberships`.
- Misma autenticación (`nuxt-auth-utils`, colección `users`, `NUXT_SESSION_PASSWORD`): las mismas cuentas sirven en ambos.
- Mismo bucket S3; los archivos van bajo `payments/<discordId>/<payment|contract>/`.
  Las subidas pasan por este servidor (el CORS del bucket solo permite los orígenes de stc-front).

## Bot

Los cambios de rol los hace stcbot (`POST`/`DELETE /api/members/:id/alpha`, rama
`feat/alpha-role-api`), protegido con `BOT_API_KEY`. Nada es automático: pausar
quita el rol ahora y alguien debe presionar **Reanudar** cuando termine la pausa.

## Env

Copia el `.env` de stc-front y agrega:

```
NUXT_BOT_URL=https://stc.snuuy.com
NUXT_BOT_API_KEY=<el BOT_API_KEY de stcbot>
```

## Dev

```bash
npm install
npm run dev   # http://localhost:3002
```

## Docker

Igual que stc-front: `.github/workflows/publish.yml` construye y publica
`ghcr.io/<owner>/stc-payments` en cada push a `master`. La imagen escucha en el
puerto **29051** (stc-front usa 29050).

```bash
docker compose up -d   # usa docker-compose.yml + .env
```

El `.env` no entra en la imagen (`.dockerignore`): pásalo en runtime con
`env_file`. Las variables `MY_AWS_*` / `S3_BUCKET` se leen en runtime, así que el
mismo `.env` de stc-front funciona sin renombrar nada.
