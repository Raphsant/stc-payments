<script setup lang="ts">
import type { RevenueBucket } from '~/components/RevenueChart.vue'

useSeoMeta({
  title: 'Cobranza - STC Pagos',
  description: 'Dinero por cobrar de los contratos Alpha: vencido, próximos cobros y saldo por miembro.',
})

const { formatDate, formatMoney, moneyParts, localToday, currency } = useMemberFormat()

const { data, pending } = useFetch<{ members: any[]; installments: any[] }>('/api/receivables', {
  default: () => ({ members: [], installments: [] }),
})

const DAY = 86_400_000
const today = localToday()
const in30 = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * DAY).toISOString().slice(0, 10)
const dayOf = (d: string) => d.slice(0, 10)

// ── stats ─────────────────────────────────────────────────
const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100
const totalDue = computed(() => sum(data.value.members.map(m => m.due)))
const totalOverdue = computed(() => sum(data.value.members.map(m => m.overdue)))
const dueSoon = computed(() => sum(
  data.value.installments.filter(i => i.status !== 'overdue' && dayOf(i.dueAt) <= in30).map(i => i.remaining),
))
const dueParts = computed(() => moneyParts(totalDue.value))
const overdueParts = computed(() => moneyParts(totalOverdue.value))
const soonParts = computed(() => moneyParts(dueSoon.value))

// ── expected collections by month (not yet overdue) ───────
const fMonthShort = new Intl.DateTimeFormat('es-MX', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const fMonthLong = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const buckets = computed<RevenueBucket[]>(() => {
  const upcoming = data.value.installments.filter(i => i.status !== 'overdue')
  const now = new Date(`${today}T00:00:00Z`)
  const monthIdx = (iso: string) => {
    const d = new Date(iso)
    return (d.getUTCFullYear() - now.getUTCFullYear()) * 12 + d.getUTCMonth() - now.getUTCMonth()
  }
  const last = Math.max(5, ...upcoming.map(i => monthIdx(i.dueAt)))
  const n = Math.min(24, last + 1)
  const out: RevenueBucket[] = Array.from({ length: n }, (_, k) => {
    const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1)
    return { key: new Date(t).toISOString().slice(0, 7), label: fMonthShort.format(t), title: fMonthLong.format(t), total: 0, count: 0 }
  })
  for (const i of upcoming) {
    const b = out[monthIdx(i.dueAt)]
    if (!b) continue
    b.total = Math.round((b.total + i.remaining) * 100) / 100
    b.count++
  }
  return out
})
const beyond = computed(() => {
  const lastKey = buckets.value[buckets.value.length - 1]?.key
  return lastKey ? sum(data.value.installments.filter(i => i.status !== 'overdue' && i.dueAt.slice(0, 7) > lastKey).map(i => i.remaining)) : 0
})

// ── members ───────────────────────────────────────────────
type Filtro = 'todos' | 'vencidos' | 'proximos'
const filtro = ref<Filtro>('todos')
const q = ref('')
const FILTERS: { key: Filtro; label: string; test: (m: any) => boolean }[] = [
  { key: 'todos',    label: 'Todos',            test: () => true },
  { key: 'vencidos', label: 'Vencidos',         test: m => m.overdue > 0 },
  { key: 'proximos', label: 'Próx. 30 días', test: m => !!m.nextDue && dayOf(m.nextDue.dueAt) <= in30 },
]
const counts = computed(() =>
  Object.fromEntries(FILTERS.map(f => [f.key, data.value.members.filter(f.test).length])) as Record<Filtro, number>,
)
const rows = computed(() => {
  const test = FILTERS.find(f => f.key === filtro.value)!.test
  const needle = q.value.trim().toLowerCase()
  return data.value.members
    .filter(test)
    .filter(m => !needle || m.username.toLowerCase().includes(needle) || m._id.includes(needle))
    // most overdue first, then whoever pays next
    .sort((a, b) =>
      (b.overdueDays - a.overdueDays)
      || ((a.nextDue ? Date.parse(a.nextDue.dueAt) : Infinity) - (b.nextDue ? Date.parse(b.nextDue.dueAt) : Infinity))
      || a.username.localeCompare(b.username))
})

const LIST_STEP = 25
const listLimit = ref(LIST_STEP)
watch([filtro, q], () => { listLimit.value = LIST_STEP })
</script>

<template>
  <div class="p-page-head">
    <div>
      <div class="p-page-title">Cobranza</div>
      <div class="p-page-sub">Lo que falta por cobrar de los contratos Alpha, al <span class="whitespace-nowrap">{{ formatDate(today) }}</span>.</div>
    </div>
  </div>

  <!-- ── Tiles ─────────────────────────────────────────────── -->
  <div class="p-tiles">
    <div class="stc-panel stc-tile">
      <div class="stc-tile-head"><span class="lbl">Por cobrar <span class="p-cur-code">{{ currency }}</span></span><UIcon name="i-lucide-hand-coins" class="w-4 h-4" /></div>
      <div class="stc-tile-val gold" :title="formatMoney(totalDue)">
        <span class="p-money-sym">{{ dueParts.symbol }}</span>{{ dueParts.int }}<span class="p-money-frac">{{ dueParts.frac }}</span>
      </div>
    </div>
    <button class="stc-panel stc-tile c-tile-btn text-left" :class="{ on: filtro === 'vencidos' }" @click="filtro = 'vencidos'">
      <div class="stc-tile-head"><span class="lbl">Vencido <span class="p-cur-code">{{ currency }}</span></span><UIcon name="i-lucide-circle-alert" class="w-4 h-4" /></div>
      <div class="stc-tile-val" :style="totalOverdue ? 'color:var(--red)' : ''" :title="formatMoney(totalOverdue)">
        <span class="p-money-sym">{{ overdueParts.symbol }}</span>{{ overdueParts.int }}<span class="p-money-frac">{{ overdueParts.frac }}</span>
      </div>
    </button>
    <button class="stc-panel stc-tile c-tile-btn text-left" :class="{ on: filtro === 'proximos' }" @click="filtro = 'proximos'">
      <div class="stc-tile-head"><span class="lbl" title="Vence en los próximos 30 días">Próx. 30 días <span class="p-cur-code">{{ currency }}</span></span><UIcon name="i-lucide-calendar-clock" class="w-4 h-4" /></div>
      <div class="stc-tile-val" :title="formatMoney(dueSoon)">
        <span class="p-money-sym">{{ soonParts.symbol }}</span>{{ soonParts.int }}<span class="p-money-frac">{{ soonParts.frac }}</span>
      </div>
    </button>
    <button class="stc-panel stc-tile c-tile-btn text-left" :class="{ on: filtro === 'todos' }" @click="filtro = 'todos'">
      <div class="stc-tile-head"><span class="lbl" title="Miembros con saldo">Con saldo</span><UIcon name="i-lucide-users" class="w-4 h-4" /></div>
      <div class="stc-tile-val">{{ data.members.length }}</div>
    </button>
  </div>

  <!-- ── Expected by month ─────────────────────────────────── -->
  <section class="stc-panel">
    <div class="stc-panel-head">
      <div class="stc-panel-title"><UIcon name="i-lucide-calendar-range" class="w-5 h-5" /> Cobros programados</div>
      <span class="c-head-note">
        Cuotas pendientes por mes<template v-if="totalOverdue"> · sin el vencido</template><template v-if="beyond"> · {{ formatMoney(beyond) }} después</template>
      </span>
    </div>
    <div class="c-chart">
      <RevenueChart :buckets="buckets" :dimmed="pending" :unit="['cuota', 'cuotas']" label="Cobros programados por mes" />
      <div v-if="!pending && !buckets.some(b => b.total)" class="c-nodata stc-mono">Sin cuotas pendientes.</div>
    </div>
  </section>

  <!-- ── Members ───────────────────────────────────────────── -->
  <section class="stc-panel p-filters">
    <div class="p-frow">
      <div class="p-search">
        <UIcon name="i-lucide-search" class="p-s-ico" />
        <input v-model="q" type="text" placeholder="Buscar por usuario o ID…" aria-label="Buscar miembro">
        <button v-if="q" class="p-clr-q" title="Borrar búsqueda" @click="q = ''">
          <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
        </button>
      </div>
      <div class="p-seg" role="group" aria-label="Filtro">
        <button v-for="f in FILTERS" :key="f.key" :class="{ on: filtro === f.key }" :aria-pressed="filtro === f.key" @click="filtro = f.key">
          {{ f.label }} <span class="n">{{ counts[f.key] }}</span>
        </button>
      </div>
    </div>
  </section>

  <section class="stc-panel c-list">
    <div class="p-thead p-tgrid c-grid">
      <div class="stc-eyebrow">Miembro</div>
      <div class="stc-eyebrow c-col-num">Valor</div>
      <div class="stc-eyebrow c-col-num">Pagado</div>
      <div class="stc-eyebrow c-col-num">Por cobrar</div>
      <div class="stc-eyebrow">Estado</div>
    </div>

    <div v-if="pending && !data.members.length" class="p-empty">Cargando…</div>
    <div v-else-if="!rows.length" class="p-empty">
      {{ data.members.length ? 'Nadie coincide con los filtros.' : 'Nadie debe nada. Los saldos aparecen al registrar contratos en la ficha de cada miembro.' }}
    </div>

    <template v-else>
      <NuxtLink v-for="m in rows.slice(0, listLimit)" :key="m._id" :to="`/miembros/${m._id}`" class="p-trow p-tgrid c-grid c-row">
        <div class="p-ucell">
          <MemberAvatar :username="m.username" :avatar-url="m.avatarUrl" />
          <div class="p-uname">
            <div class="p-nm">{{ m.username }}</div>
            <div class="p-uid stc-mono">
              <template v-if="m.removedAt">Fuera del servidor</template>
              <template v-else-if="m.status === 'paused'">Pausado</template>
              <template v-else-if="!m.hasAlphaRole">Sin Alpha</template>
              <template v-else>{{ m.contracts > 1 ? `${m.contracts} contratos` : 'Alpha' }}</template>
            </div>
          </div>
        </div>
        <div class="p-cell-main stc-mono c-col-num c-hide-narrow">{{ formatMoney(m.value) }}</div>
        <div class="p-cell-main stc-mono c-col-num c-hide-narrow">{{ formatMoney(m.paid) }}</div>
        <div class="p-cell-main stc-mono c-col-num c-due" :style="{ color: m.overdue ? 'var(--red)' : 'var(--text)' }">
          {{ formatMoney(m.due) }}
          <div class="p-cell-sub c-show-narrow">de {{ formatMoney(m.value) }}</div>
        </div>
        <div class="c-state">
          <span v-if="m.overdue" class="p-rbadge red">
            <UIcon name="i-lucide-circle-alert" class="w-3 h-3" /> Vencido {{ formatMoney(m.overdue) }} · {{ m.overdueDays }}d
          </span>
          <span v-else class="p-rbadge alpha">Al corriente</span>
          <div v-if="m.nextDue" class="p-cell-sub stc-mono">Próx. {{ formatMoney(m.nextDue.amount) }} · {{ formatDate(m.nextDue.dueAt) }}</div>
        </div>
      </NuxtLink>
      <div v-if="rows.length > listLimit" class="p-pager">
        <button class="stc-btn sm" @click="listLimit += LIST_STEP">
          <UIcon name="i-lucide-chevron-down" class="w-3.5 h-3.5" />
          Ver más <span class="stc-mono" style="color:var(--faint)">{{ listLimit }} de {{ rows.length }}</span>
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.c-tile-btn { cursor: pointer; transition: border-color .14s; }
.c-tile-btn:hover, .c-tile-btn.on { border-color: var(--gold-ring); }

.c-head-note { font-size: 12px; color: var(--dim); }
.c-chart { position: relative; padding: 16px 20px 12px; }
.c-nodata { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; font-size: 13px; color: var(--faint); }

.c-row { text-decoration: none; color: inherit; }
.c-row:hover .p-nm { color: var(--gold-soft); }
.c-grid { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.6fr); }
.c-col-num { text-align: right; }
.c-due { font-weight: 600; }
.c-state { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
.c-state .p-cell-sub { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.c-show-narrow { display: none; font-weight: 400; }

/* Layout follows the list's own width (the sidebar eats into tablets). */
.c-list { container-type: inline-size; }
@container (max-width: 760px) {
  .c-list .p-thead { display: none; }
  .c-list .p-trow { padding: 12px 16px; }
  .c-grid { grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; }
  .c-hide-narrow { display: none; }
  .c-show-narrow { display: block; }
  .c-state { grid-column: 1 / -1; flex-direction: row; align-items: center; flex-wrap: wrap; gap: 6px 10px; padding-left: 49px; }
}

@media (max-width: 767px) {
  .c-chart { padding: 12px 10px 8px 6px; }
  .c-head-note { display: none; }
}
@media (max-width: 640px) {
  .p-filters .p-seg { width: 100%; }
  .p-filters .p-seg button { flex: 1; justify-content: center; padding-inline: 8px; }
}
</style>
