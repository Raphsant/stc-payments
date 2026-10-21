<script setup lang="ts">
useSeoMeta({
  title: 'Alphas - STC Pagos',
  description: 'Miembros Alpha del Stock Trading Club y el estado de su membresía.',
})

const { formatDate, expiryState, expiryBadge, statusBadge, visiblePages } = useMemberFormat()

const { data: rows, pending, refresh } = useFetch<any[]>('/api/alphas', { default: () => [] })

// ── filters ───────────────────────────────────────────────
type Filtro = 'todos' | 'activos' | 'pausados' | 'por-vencer' | 'vencidos' | 'sin-datos'
const q = ref('')
const filtro = ref<Filtro>('todos')
const page = ref(1)

function isPaused(r: any) { return r.status === 'paused' }
function missingData(r: any) { return !r.purchasedAt || !r.expiresAt || !r.paymentCount || !r.contractCount }

const FILTERS: { key: Filtro; label: string; test: (r: any) => boolean }[] = [
  { key: 'todos',      label: 'Todos',      test: () => true },
  { key: 'activos',    label: 'Activos',    test: r => !isPaused(r) },
  { key: 'pausados',   label: 'Pausados',   test: r => isPaused(r) },
  { key: 'por-vencer', label: 'Por vencer', test: r => !isPaused(r) && expiryState(r.expiresAt) === 'soon' },
  { key: 'vencidos',   label: 'Vencidos',   test: r => !isPaused(r) && expiryState(r.expiresAt) === 'expired' },
  { key: 'sin-datos',  label: 'Faltan datos', test: r => missingData(r) },
]

const counts = computed(() =>
  Object.fromEntries(FILTERS.map(f => [f.key, rows.value.filter(f.test).length])) as Record<Filtro, number>,
)

const filtered = computed(() => {
  const test = FILTERS.find(f => f.key === filtro.value)!.test
  const needle = q.value.trim().toLowerCase()
  return rows.value
    .filter(test)
    .filter(r => !needle || r.username.toLowerCase().includes(needle) || r._id.includes(needle))
    // soonest expiry first; no date last
    .sort((a, b) => {
      const ea = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity
      const eb = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity
      return ea - eb || a.username.localeCompare(b.username)
    })
})

const PAGE_SIZE = 15
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const pageRows = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
watch([q, filtro], () => { page.value = 1 })

// ── actions ───────────────────────────────────────────────
const action = ref<'pause' | 'resume' | 'remove' | null>(null)
const target = ref<any>(null)
function openAction(a: typeof action.value, r: any) { target.value = r; action.value = a }
function closeAction() { action.value = null; target.value = null }
async function onDone() { closeAction(); await refresh() }
</script>

<template>
  <div class="p-page-head">
    <div>
      <div class="p-page-title">Alphas</div>
      <div class="p-page-sub">Miembros con el rol Alpha y el estado de su membresía.</div>
    </div>
    <div class="p-count-pill">
      <UIcon name="i-lucide-crown" class="w-[15px] h-[15px]" style="color:var(--gold)" />
      <b>{{ rows.length }}</b>
      <span>alphas</span>
    </div>
  </div>

  <!-- ── Tiles ─────────────────────────────────────────────── -->
  <div class="p-tiles">
    <button class="stc-panel stc-tile text-left" @click="filtro = 'activos'">
      <div class="stc-tile-head"><span class="lbl">Activos</span><UIcon name="i-lucide-circle-check" class="w-4 h-4" /></div>
      <div class="stc-tile-val gold">{{ counts.activos }}</div>
    </button>
    <button class="stc-panel stc-tile text-left" @click="filtro = 'por-vencer'">
      <div class="stc-tile-head"><span class="lbl">Por vencer · 30d</span><UIcon name="i-lucide-hourglass" class="w-4 h-4" /></div>
      <div class="stc-tile-val">{{ counts['por-vencer'] }}</div>
    </button>
    <button class="stc-panel stc-tile text-left" @click="filtro = 'vencidos'">
      <div class="stc-tile-head"><span class="lbl">Vencidos</span><UIcon name="i-lucide-calendar-x" class="w-4 h-4" /></div>
      <div class="stc-tile-val" :style="counts.vencidos ? 'color:var(--red)' : ''">{{ counts.vencidos }}</div>
    </button>
    <button class="stc-panel stc-tile text-left" @click="filtro = 'pausados'">
      <div class="stc-tile-head"><span class="lbl">Pausados</span><UIcon name="i-lucide-circle-pause" class="w-4 h-4" /></div>
      <div class="stc-tile-val">{{ counts.pausados }}</div>
    </button>
  </div>

  <!-- ── Filters ───────────────────────────────────────────── -->
  <section class="stc-panel p-filters">
    <div class="p-frow">
      <div class="p-search">
        <UIcon name="i-lucide-search" class="p-s-ico" />
        <input v-model="q" type="text" placeholder="Buscar por usuario o ID…">
        <button v-if="q" class="p-clr-q" title="Borrar búsqueda" @click="q = ''">
          <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
        </button>
      </div>
      <div class="p-seg">
        <button v-for="f in FILTERS" :key="f.key" :class="{ on: filtro === f.key }" @click="filtro = f.key">
          {{ f.label }} <span class="n">{{ counts[f.key] }}</span>
        </button>
      </div>
      <span class="p-summary stc-mono">Mostrando <b>{{ filtered.length }}</b> de {{ rows.length }}</span>
    </div>
  </section>

  <!-- ── Table ─────────────────────────────────────────────── -->
  <section class="stc-panel">
    <div class="p-thead p-tgrid a-grid">
      <div class="stc-eyebrow">Usuario</div>
      <div class="stc-eyebrow">Estado</div>
      <div class="stc-eyebrow a-col-buy">Compra</div>
      <div class="stc-eyebrow">Vencimiento</div>
      <div class="stc-eyebrow a-col-docs">Documentos</div>
      <div class="stc-eyebrow" style="text-align:right">Acciones</div>
    </div>

    <div v-if="pending && !rows.length">
      <div v-for="i in 6" :key="i" class="p-trow p-tgrid a-grid">
        <div class="flex items-center gap-3">
          <USkeleton class="w-9 h-9 rounded-lg" />
          <USkeleton class="h-3.5 w-28" />
        </div>
        <USkeleton class="h-5 w-16 rounded-md" />
        <USkeleton class="h-3.5 w-20 a-col-buy" />
        <USkeleton class="h-5 w-24 rounded-md" />
        <USkeleton class="h-5 w-24 rounded-md a-col-docs" />
        <div class="flex justify-end gap-1.5">
          <USkeleton class="w-8 h-8 rounded-lg" />
          <USkeleton class="w-8 h-8 rounded-lg" />
        </div>
      </div>
    </div>

    <div v-else-if="!pageRows.length" class="p-empty">Ningún Alpha coincide con los filtros.</div>

    <template v-else>
      <div v-for="r in pageRows" :key="r._id" class="p-trow p-tgrid a-grid">
        <NuxtLink :to="`/miembros/${r._id}`" class="p-ucell">
          <MemberAvatar :username="r.username" :avatar-url="r.avatarUrl" />
          <div class="p-uname">
            <div class="p-nm">{{ r.username }}</div>
            <div class="p-uid stc-mono">{{ r._id }}</div>
          </div>
        </NuxtLink>

        <div>
          <span class="p-rbadge" :class="statusBadge(r.status).cls">
            <UIcon :name="statusBadge(r.status).icon" class="w-3 h-3" />
            {{ statusBadge(r.status).text }}
          </span>
          <div v-if="r.status === 'paused' && r.resumesAt" class="p-cell-sub stc-mono">hasta {{ formatDate(r.resumesAt) }}</div>
        </div>

        <div class="a-col-buy">
          <div class="p-cell-main stc-mono">{{ formatDate(r.purchasedAt) }}</div>
        </div>

        <div>
          <span class="p-rbadge" :class="expiryBadge(r.expiresAt).cls">{{ expiryBadge(r.expiresAt).text }}</span>
          <div v-if="r.expiresAt" class="p-cell-sub stc-mono">{{ formatDate(r.expiresAt) }}</div>
        </div>

        <div class="p-docs a-col-docs">
          <span class="p-doc" :class="{ ok: r.paymentCount }" title="Comprobantes de pago">
            <UIcon name="i-lucide-receipt" class="w-3 h-3" /> {{ r.paymentCount }}
          </span>
          <span class="p-doc" :class="{ ok: r.contractCount }" title="Contrato firmado">
            <UIcon name="i-lucide-file-signature" class="w-3 h-3" /> {{ r.contractCount }}
          </span>
        </div>

        <div class="p-ractions">
          <NuxtLink :to="`/miembros/${r._id}`" class="p-rbtn" title="Ver ficha">
            <UIcon name="i-lucide-file-text" class="w-[15px] h-[15px]" />
          </NuxtLink>
          <button v-if="r.status === 'paused'" class="p-rbtn" title="Reanudar" @click="openAction('resume', r)">
            <UIcon name="i-lucide-circle-play" class="w-[15px] h-[15px]" />
          </button>
          <button v-else class="p-rbtn blue" title="Pausar membresía" @click="openAction('pause', r)">
            <UIcon name="i-lucide-circle-pause" class="w-[15px] h-[15px]" />
          </button>
          <button class="p-rbtn danger" title="Quitar Alpha" @click="openAction('remove', r)">
            <UIcon name="i-lucide-user-minus" class="w-[15px] h-[15px]" />
          </button>
        </div>
      </div>
    </template>

    <div v-if="filtered.length > PAGE_SIZE" class="p-pager">
      <button class="p-pbtn" :disabled="page === 1" @click="page--">
        <UIcon name="i-lucide-chevron-left" class="w-[15px] h-[15px]" />
      </button>
      <template v-for="p in visiblePages(page, totalPages)" :key="p">
        <span v-if="p === '...'" class="p-pbtn" style="border:none; cursor:default">…</span>
        <button v-else class="p-pbtn" :class="{ on: p === page }" @click="page = (p as number)">{{ p }}</button>
      </template>
      <button class="p-pbtn" :disabled="page === totalPages" @click="page++">
        <UIcon name="i-lucide-chevron-right" class="w-[15px] h-[15px]" />
      </button>
    </div>
  </section>

  <MemberActionModal :action="action" :member="target" @close="closeAction" @done="onDone" />
</template>

<style scoped>
.a-grid { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr) 112px; }
.stc-tile { cursor: pointer; transition: border-color .14s; }
.stc-tile:hover { border-color: var(--gold-ring); }

@media (max-width: 1100px) {
  .a-grid { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.2fr) 112px; }
  .a-col-buy, .a-col-docs { display: none; }
}
@media (max-width: 767px) {
  .p-trow.a-grid { grid-template-columns: 1fr auto; gap: 8px 10px; }
  .p-trow.a-grid > .p-ucell { grid-column: 1 / -1; }
}
</style>
