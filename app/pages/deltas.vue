<script setup lang="ts">
useSeoMeta({
  title: 'Deltas - STC Pagos',
  description: 'Miembros sin Alpha que pueden ser promovidos.',
})

const { formatDate, visiblePages } = useMemberFormat()

const { data: rows, pending, refresh } = useFetch<any[]>('/api/candidates', { default: () => [] })

type Filtro = 'delta' | 'sin-rol' | 'ex-alpha' | 'todos'
const q = ref('')
const filtro = ref<Filtro>('delta')
const page = ref(1)

const FILTERS: { key: Filtro; label: string; test: (r: any) => boolean }[] = [
  { key: 'delta',    label: 'Delta',    test: r => !!r.deltaRole },
  { key: 'sin-rol',  label: 'Sin rol',  test: r => !r.deltaRole },
  { key: 'ex-alpha', label: 'Ex Alpha', test: r => r.formerAlpha },
  { key: 'todos',    label: 'Todos',    test: () => true },
]

const counts = computed(() =>
  Object.fromEntries(FILTERS.map(f => [f.key, rows.value.filter(f.test).length])) as Record<Filtro, number>,
)

const filtered = computed(() => {
  const test = FILTERS.find(f => f.key === filtro.value)!.test
  const needle = q.value.trim().toLowerCase()
  return rows.value.filter(test).filter(r => !needle || r.username.toLowerCase().includes(needle) || r._id.includes(needle))
})

const PAGE_SIZE = 15
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const pageRows = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
watch([q, filtro], () => { page.value = 1 })

const target = ref<any>(null)
async function onDone() {
  const id = target.value?._id
  target.value = null
  await refresh()
  if (id) await navigateTo(`/miembros/${id}`)
}
</script>

<template>
  <div class="p-page-head">
    <div>
      <div class="p-page-title">Deltas</div>
      <div class="p-page-sub">Miembros sin <b style="color:var(--text)">Alpha</b> ni <b style="color:var(--text)">Alpha.</b> — promuévelos cuando paguen.</div>
    </div>
    <div class="p-count-pill">
      <UIcon name="i-lucide-users" class="w-[15px] h-[15px]" style="color:var(--dim)" />
      <b>{{ rows.length }}</b>
      <span>candidatos</span>
    </div>
  </div>

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

  <section class="stc-panel">
    <div class="p-thead p-tgrid d-grid">
      <div class="stc-eyebrow">Usuario</div>
      <div class="stc-eyebrow">Rol</div>
      <div class="stc-eyebrow d-col-since">Miembro desde</div>
      <div class="stc-eyebrow d-col-msgs">Mensajes</div>
      <div class="stc-eyebrow" style="text-align:right">Acciones</div>
    </div>

    <div v-if="pending && !rows.length">
      <div v-for="i in 6" :key="i" class="p-trow p-tgrid d-grid">
        <div class="flex items-center gap-3">
          <USkeleton class="w-9 h-9 rounded-lg" />
          <USkeleton class="h-3.5 w-28" />
        </div>
        <USkeleton class="h-5 w-14 rounded-md" />
        <USkeleton class="h-3.5 w-20 d-col-since" />
        <USkeleton class="h-3.5 w-12 d-col-msgs" />
        <div class="flex justify-end"><USkeleton class="h-8 w-28 rounded-lg" /></div>
      </div>
    </div>

    <div v-else-if="!pageRows.length" class="p-empty">Nadie coincide con los filtros.</div>

    <template v-else>
      <div v-for="r in pageRows" :key="r._id" class="p-trow p-tgrid d-grid">
        <NuxtLink :to="`/miembros/${r._id}`" class="p-ucell">
          <MemberAvatar :username="r.username" :avatar-url="r.avatarUrl" />
          <div class="p-uname">
            <div class="p-nm">{{ r.username }}</div>
            <div class="p-uid stc-mono">{{ r._id }}</div>
          </div>
        </NuxtLink>

        <div class="flex gap-1.5 flex-wrap">
          <span v-if="r.deltaRole" class="p-rbadge delta">{{ r.deltaRole }}</span>
          <span v-else class="p-rbadge none">Sin rol</span>
          <span v-if="r.formerAlpha" class="p-rbadge neutral" title="Tuvo Alpha y se le removió">Ex Alpha</span>
        </div>

        <div class="p-cell-main stc-mono d-col-since">{{ formatDate(r.joinedAt) }}</div>
        <div class="p-cell-main stc-mono d-col-msgs">{{ r.messageCount.toLocaleString() }}</div>

        <div class="p-ractions">
          <NuxtLink :to="`/miembros/${r._id}`" class="p-rbtn" title="Ver ficha">
            <UIcon name="i-lucide-file-text" class="w-[15px] h-[15px]" />
          </NuxtLink>
          <button class="stc-btn gold-soft sm" @click="target = r">
            <UIcon name="i-lucide-crown" class="w-3.5 h-3.5" />
            Hacer Alpha
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

  <MemberActionModal :action="target ? 'promote' : null" :member="target" @close="target = null" @done="onDone" />
</template>

<style scoped>
.d-grid { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, .7fr) 170px; }
@media (max-width: 1100px) {
  .d-grid { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) 170px; }
  .d-col-since, .d-col-msgs { display: none; }
}
@media (max-width: 767px) {
  .p-trow.d-grid { grid-template-columns: 1fr auto; gap: 8px 10px; }
  .p-trow.d-grid > .p-ucell { grid-column: 1 / -1; }
}
</style>
