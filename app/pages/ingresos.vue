<script setup lang="ts">
import type { RevenueBucket } from '~/components/RevenueChart.vue'

useSeoMeta({
  title: 'Ingresos - STC Pagos',
  description: 'Ingresos por membresías Alpha en el periodo seleccionado.',
})

const { formatDate, formatMoney, moneyParts, localToday, currency } = useMemberFormat()

// ── range ─────────────────────────────────────────────────
// Dates are YYYY-MM-DD and handled as UTC midnight, same as stored payments.
type Preset = 'ytd' | '30d' | '90d' | '12m' | 'todo' | 'custom'
type Gran = 'day' | 'week' | 'month'
const DAY = 86_400_000

const toKey = (t: number) => new Date(t).toISOString().slice(0, 10)
const fromKey = (s: string) => Date.parse(`${s}T00:00:00Z`)

const PRESETS: { key: Preset; label: string; gran: Gran }[] = [
  { key: 'ytd',  label: 'Año en curso', gran: 'month' },
  { key: '30d',  label: '30 días',      gran: 'day' },
  { key: '90d',  label: '90 días',      gran: 'week' },
  { key: '12m',  label: '12 meses',     gran: 'month' },
  { key: 'todo', label: 'Todo',         gran: 'month' },
  { key: 'custom', label: 'Personalizado', gran: 'day' },
]
const GRANS: { key: Gran; label: string }[] = [
  { key: 'day', label: 'Días' }, { key: 'week', label: 'Semanas' }, { key: 'month', label: 'Meses' },
]

const preset = ref<Preset>('ytd')
const gran = ref<Gran>('month')
const custom = reactive({ from: '', to: '' })

function presetRange(p: Preset): { from: string | null; to: string } {
  const today = localToday()
  const t = fromKey(today)
  switch (p) {
    case 'ytd': return { from: `${today.slice(0, 4)}-01-01`, to: today }
    case '30d': return { from: toKey(t - 29 * DAY), to: today }
    case '90d': return { from: toKey(t - 89 * DAY), to: today }
    case '12m': {
      const d = new Date(t)
      d.setUTCMonth(d.getUTCMonth() - 11, 1)
      return { from: toKey(d.getTime()), to: today }
    }
    case 'todo': return { from: null, to: today }
    case 'custom': return { from: custom.from || null, to: custom.to || today }
  }
}

function pickPreset(p: Preset) {
  if (p === 'custom' && preset.value !== 'custom') {
    const r = presetRange(preset.value)
    custom.from = r.from ?? ''
    custom.to = r.to
  }
  preset.value = p
  gran.value = PRESETS.find(x => x.key === p)!.gran
}

const range = computed(() => presetRange(preset.value))

const { data: payments, pending } = useFetch<any[]>('/api/revenue', {
  query: computed(() => ({ from: range.value.from ?? undefined, to: range.value.to })),
  default: () => [],
})

// ── buckets ───────────────────────────────────────────────
function truncate(t: number, g: Gran) {
  const d = new Date(t)
  if (g === 'week') return t - ((d.getUTCDay() + 6) % 7) * DAY // Monday
  if (g === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}
function next(t: number, g: Gran) {
  if (g === 'day') return t + DAY
  if (g === 'week') return t + 7 * DAY
  const d = new Date(t)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
}

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', { ...o, timeZone: 'UTC' })
const fDayShort = fmt({ day: 'numeric', month: 'short' })
const fDayLong = fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const fMonthShort = fmt({ month: 'short', year: '2-digit' })
const fMonthLong = fmt({ month: 'long', year: 'numeric' })

function bucketLabels(t: number, g: Gran) {
  if (g === 'day') return { label: fDayShort.format(t), title: fDayLong.format(t) }
  if (g === 'month') return { label: fMonthShort.format(t), title: fMonthLong.format(t) }
  return { label: fDayShort.format(t), title: `Semana del ${fDayShort.format(t)} al ${fDayShort.format(t + 6 * DAY)}` }
}

const buckets = computed<RevenueBucket[]>(() => {
  const rows = payments.value
  const firstPaid = rows.length ? rows[0].paidAt.slice(0, 10) : null
  const start = range.value.from ?? firstPaid ?? range.value.to
  const end = fromKey(range.value.to)
  if (fromKey(start) > end) return []

  const sums = new Map<number, { total: number; count: number }>()
  for (const p of rows) {
    const k = truncate(Date.parse(p.paidAt), gran.value)
    const s = sums.get(k) ?? { total: 0, count: 0 }
    s.total += p.amount
    s.count++
    sums.set(k, s)
  }

  const out: RevenueBucket[] = []
  for (let t = truncate(fromKey(start), gran.value); t <= end; t = next(t, gran.value)) {
    const s = sums.get(t) ?? { total: 0, count: 0 }
    out.push({ key: toKey(t), ...bucketLabels(t, gran.value), total: Math.round(s.total * 100) / 100, count: s.count })
  }
  return out
})

// ── stats ─────────────────────────────────────────────────
const total = computed(() => payments.value.reduce((sum, p) => sum + p.amount, 0))
const totalParts = computed(() => moneyParts(total.value))
const avgParts = computed(() => (count.value ? moneyParts(total.value / count.value) : null))
const count = computed(() => payments.value.length)
const members = computed(() => new Set(payments.value.map(p => p.memberId)).size)
const best = computed(() => buckets.value.reduce<RevenueBucket | null>((a, b) => (b.total > (a?.total ?? 0) ? b : a), null))

const rangeText = computed(() => {
  const from = range.value.from ?? payments.value[0]?.paidAt
  return from ? `${formatDate(from)} – ${formatDate(range.value.to)}` : `Hasta ${formatDate(range.value.to)}`
})

const view = ref<'chart' | 'table'>('chart')
const recent = computed(() => [...payments.value].reverse())
const LIST_STEP = 20
const listLimit = ref(LIST_STEP)
watch(range, () => { listLimit.value = LIST_STEP })
</script>

<template>
  <div class="p-page-head">
    <div>
      <div class="p-page-title">Ingresos</div>
      <div class="p-page-sub">Dinero recibido por membresías Alpha · <span class="whitespace-nowrap">{{ rangeText }}</span></div>
    </div>
  </div>

  <!-- ── Filters ───────────────────────────────────────────── -->
  <section class="stc-panel p-filters">
    <div class="r-frow">
      <!-- six presets don't fit a phone: segmented on wide screens, a select on narrow ones -->
      <div class="p-seg r-presets" role="group" aria-label="Periodo">
        <button v-for="p in PRESETS" :key="p.key" :class="{ on: preset === p.key }" :aria-pressed="preset === p.key" @click="pickPreset(p.key)">{{ p.label }}</button>
      </div>
      <label class="r-presets-sel">
        <span class="sr-only">Periodo</span>
        <select class="stc-input" :value="preset" @change="pickPreset(($event.target as HTMLSelectElement).value as Preset)">
          <option v-for="p in PRESETS" :key="p.key" :value="p.key">{{ p.label }}</option>
        </select>
      </label>
      <div class="p-seg r-gran" role="group" aria-label="Agrupar por">
        <button v-for="g in GRANS" :key="g.key" :class="{ on: gran === g.key }" :aria-pressed="gran === g.key" @click="gran = g.key">{{ g.label }}</button>
      </div>
    </div>
    <div v-if="preset === 'custom'" class="r-dates">
      <label class="r-date"><span class="stc-eyebrow">Desde</span><input v-model="custom.from" type="date" class="stc-input" :max="custom.to || undefined"></label>
      <label class="r-date"><span class="stc-eyebrow">Hasta</span><input v-model="custom.to" type="date" class="stc-input" :min="custom.from || undefined"></label>
    </div>
  </section>

  <!-- ── Tiles ─────────────────────────────────────────────── -->
  <div class="p-tiles">
    <div class="stc-panel stc-tile">
      <div class="stc-tile-head"><span class="lbl">Total <span class="p-cur-code">{{ currency }}</span></span><UIcon name="i-lucide-banknote" class="w-4 h-4" /></div>
      <div class="stc-tile-val gold" :title="formatMoney(total)">
        <span class="p-money-sym">{{ totalParts.symbol }}</span>{{ totalParts.int }}<span class="p-money-frac">{{ totalParts.frac }}</span>
      </div>
    </div>
    <div class="stc-panel stc-tile">
      <div class="stc-tile-head"><span class="lbl">Pagos</span><UIcon name="i-lucide-receipt" class="w-4 h-4" /></div>
      <div class="stc-tile-val">{{ count }}</div>
    </div>
    <div class="stc-panel stc-tile">
      <div class="stc-tile-head"><span class="lbl" title="Promedio por pago">Promedio <span class="p-cur-code">{{ currency }}</span></span><UIcon name="i-lucide-divide" class="w-4 h-4" /></div>
      <div v-if="avgParts" class="stc-tile-val" :title="formatMoney(total / count)">
        <span class="p-money-sym">{{ avgParts.symbol }}</span>{{ avgParts.int }}<span class="p-money-frac">{{ avgParts.frac }}</span>
      </div>
      <div v-else class="stc-tile-val">—</div>
    </div>
    <div class="stc-panel stc-tile">
      <div class="stc-tile-head"><span class="lbl" title="Miembros que pagaron">Miembros</span><UIcon name="i-lucide-users" class="w-4 h-4" /></div>
      <div class="stc-tile-val">{{ members }}</div>
    </div>
  </div>

  <!-- ── Chart / table ─────────────────────────────────────── -->
  <section class="stc-panel">
    <div class="stc-panel-head">
      <div class="stc-panel-title">
        <UIcon name="i-lucide-chart-column" class="w-5 h-5" />
        Por {{ gran === 'day' ? 'día' : gran === 'week' ? 'semana' : 'mes' }}
      </div>
      <div class="r-head-right">
        <span v-if="best" class="r-best stc-mono">Mejor: <b>{{ best.title }}</b> · {{ formatMoney(best.total) }}</span>
        <div class="p-seg">
          <button :class="{ on: view === 'chart' }" title="Gráfica" aria-label="Ver gráfica" :aria-pressed="view === 'chart'" @click="view = 'chart'"><UIcon name="i-lucide-chart-column" class="w-3.5 h-3.5" /></button>
          <button :class="{ on: view === 'table' }" title="Tabla" aria-label="Ver tabla" :aria-pressed="view === 'table'" @click="view = 'table'"><UIcon name="i-lucide-table" class="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </div>

    <div v-if="!buckets.length" class="p-empty">{{ pending ? 'Cargando…' : 'Rango de fechas inválido.' }}</div>
    <div v-else-if="view === 'chart'" class="r-chart">
      <RevenueChart :buckets="buckets" :dimmed="pending" />
      <div v-if="!pending && !count" class="r-nodata stc-mono">Sin pagos registrados en este periodo.</div>
    </div>
    <div v-else class="r-table" :class="{ dimmed: pending }">
      <div class="p-thead p-tgrid r-bgrid">
        <div class="stc-eyebrow">Periodo</div>
        <div class="stc-eyebrow" style="text-align:right">Pagos</div>
        <div class="stc-eyebrow" style="text-align:right">Total</div>
      </div>
      <div v-for="b in buckets" :key="b.key" class="p-trow p-tgrid r-bgrid">
        <div class="p-cell-main r-ellip">{{ b.title }}</div>
        <div class="p-cell-main stc-mono" style="text-align:right">{{ b.count }}</div>
        <div class="p-cell-main stc-mono" style="text-align:right" :style="{ color: b.total ? 'var(--text)' : 'var(--faint)' }">{{ formatMoney(b.total) }}</div>
      </div>
    </div>
  </section>

  <!-- ── Payments in range ─────────────────────────────────── -->
  <section class="stc-panel r-list">
    <div class="stc-panel-head">
      <div class="stc-panel-title"><UIcon name="i-lucide-list" class="w-5 h-5" /> Pagos del periodo</div>
      <span class="stc-mono" style="font-size:12px; color:var(--faint)">{{ count }}</span>
    </div>
    <div v-if="!recent.length" class="p-empty">{{ pending ? 'Cargando…' : 'Sin pagos en este periodo.' }}</div>
    <template v-else>
      <div class="p-thead p-tgrid r-pgrid">
        <div class="stc-eyebrow">Fecha</div>
        <div class="stc-eyebrow">Miembro</div>
        <div class="stc-eyebrow r-col-note">Nota</div>
        <div class="stc-eyebrow" style="text-align:right">Monto</div>
      </div>
      <div v-for="p in recent.slice(0, listLimit)" :key="p._id" class="p-trow p-tgrid r-pgrid">
        <div class="p-cell-main stc-mono r-col-date">{{ formatDate(p.paidAt) }}</div>
        <div class="min-w-0">
          <NuxtLink :to="`/miembros/${p.memberId}`" class="p-cell-main r-member">{{ p.username }}</NuxtLink>
          <div class="p-cell-sub r-ellip r-note-inline stc-mono">{{ formatDate(p.paidAt) }}<template v-if="p.note"> · {{ p.note }}</template></div>
        </div>
        <div class="p-cell-sub r-col-note r-ellip" style="margin:0" :title="p.note">{{ p.note }}</div>
        <div class="p-cell-main stc-mono" style="text-align:right; font-weight:600">{{ formatMoney(p.amount) }}</div>
      </div>
      <div v-if="recent.length > listLimit" class="p-pager">
        <button class="stc-btn sm" @click="listLimit += LIST_STEP">
          <UIcon name="i-lucide-chevron-down" class="w-3.5 h-3.5" />
          Ver más <span class="stc-mono" style="color:var(--faint)">{{ listLimit }} de {{ recent.length }}</span>
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.r-frow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.r-presets-sel { display: none; }
.r-dates { display: flex; gap: 12px; flex-wrap: wrap; }
.r-date { display: flex; align-items: center; gap: 8px; }
.r-date .stc-input { width: auto; }

.r-head-right { display: flex; align-items: center; gap: 12px; min-width: 0; margin-left: auto; }
.r-best { font-size: 12px; color: var(--dim); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-best b { color: var(--text); font-weight: 600; }
.r-head-right .p-seg { overflow: visible; }

.r-ellip { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-note-inline { display: none; }

/* Presets: below ~1100px the segmented control would wrap or scroll, use the select. */
@media (max-width: 1099px) {
  .r-presets { display: none; }
  .r-presets-sel { display: block; flex: 1 1 180px; max-width: 260px; }
}
@media (max-width: 640px) {
  .r-frow { gap: 10px; }
  .r-presets-sel { max-width: none; }
  .r-gran { flex: 1 1 100%; }
  .r-gran button { flex: 1; justify-content: center; }
  .r-dates { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .r-date { flex-direction: column; align-items: stretch; gap: 6px; }
  .r-date .stc-input { width: 100%; min-width: 0; }
  .r-best { display: none; }
}

.r-chart { position: relative; padding: 16px 20px 12px; }
.r-nodata {
  position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none;
  font-size: 13px; color: var(--faint);
}
.r-table { max-height: 480px; overflow-y: auto; transition: opacity .15s; }
.r-table.dimmed { opacity: .5; }
.r-bgrid { grid-template-columns: minmax(0, 1fr) 80px 140px; }
.r-pgrid { grid-template-columns: 130px minmax(0, 1fr) minmax(0, 1.5fr) 130px; }
.r-member { display: block; text-decoration: none; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-member:hover { color: var(--gold-soft); }

@media (max-width: 767px) {
  .r-chart { padding: 12px 10px 8px 6px; }
  .r-bgrid { grid-template-columns: minmax(0, 1fr) 48px auto; }
}

/* The list switches on its own width (the sidebar eats into tablets):
   narrow → member on top, date · note underneath, amount on the right. */
.r-list { container-type: inline-size; }
@container (max-width: 720px) {
  .r-list .p-thead { display: none; }
  .r-list .p-trow { padding: 12px 16px; }
  .r-pgrid { grid-template-columns: minmax(0, 1fr) auto; gap: 12px; }
  .r-col-date, .r-col-note { display: none; }
  .r-note-inline { display: block; }
}
</style>
