<script setup lang="ts">
const route = useRoute()
const id = computed(() => route.params.id as string)
const toast = useToast()
const { formatDate, formatMoney, localToday, currency, toInputDate, expiryBadge, statusBadge } = useMemberFormat()

const { data, pending, error, refresh } = useFetch<any>(() => `/api/members/${id.value}`)

useSeoMeta({ title: () => `${data.value?.user?.username ?? 'Miembro'} - STC Pagos` })

const user = computed(() => data.value?.user)
const m = computed(() => data.value?.membership)
const hasAlpha = computed(() => !!data.value?.hasAlphaRole)
const hasAlphaDot = computed(() => (user.value?.roles || []).includes('Alpha.'))
const isPaused = computed(() => m.value?.status === 'paused')

// Status shown in the header: a manual Alpha with no Membership yet still reads
// as active, and a "removed" doc whose role came back by hand reads as active.
const displayStatus = computed(() => {
  if (isPaused.value) return 'paused'
  if (hasAlpha.value) return 'active'
  return m.value?.status === 'removed' ? 'removed' : 'none'
})

const visibleRoles = computed(() => (user.value?.roles || []).filter((r: string) => r !== '@everyone'))
function roleCls(r: string) {
  const k = r.toLowerCase()
  if (k.startsWith('alpha')) return 'alpha'
  if (k.startsWith('delta')) return 'delta'
  return 'neutral'
}

// ── details form ─────────────────────────────────────────
const form = reactive({ purchasedAt: '', expiresAt: '', notes: '' })
function resetForm() {
  form.purchasedAt = toInputDate(m.value?.purchasedAt)
  form.expiresAt = toInputDate(m.value?.expiresAt)
  form.notes = m.value?.notes ?? ''
}
watch(m, resetForm, { immediate: true })

const dirty = computed(() =>
  form.purchasedAt !== toInputDate(m.value?.purchasedAt)
  || form.expiresAt !== toInputDate(m.value?.expiresAt)
  || form.notes !== (m.value?.notes ?? ''),
)

function plusMonths(base: string, n: number) {
  const d = new Date(base || Date.now())
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const membership = await $fetch(`/api/members/${id.value}`, {
      method: 'PATCH',
      body: { purchasedAt: form.purchasedAt || null, expiresAt: form.expiresAt || null, notes: form.notes },
    })
    data.value = { ...data.value, membership }
    toast.add({ title: 'Datos guardados.', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'No se pudo guardar', description: e?.data?.statusMessage || e.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

// ── files ────────────────────────────────────────────────
type Kind = 'payment' | 'contract'
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf'
const uploading = ref<Kind | null>(null)
const dragOver = ref<Kind | null>(null)

const filesOf = (kind: Kind) => (m.value?.files || []).filter((f: any) => f.kind === kind)

// Copies the FileList synchronously, so callers may clear the <input> right after.
async function upload(kind: Kind, list: FileList | null | undefined) {
  const files = Array.from(list || [])
  if (!files.length) return
  uploading.value = kind
  try {
    const form = new FormData()
    form.append('kind', kind)
    for (const file of files) form.append('file', file)
    const membership = await $fetch(`/api/members/${id.value}/files`, { method: 'POST', body: form })
    data.value = { ...data.value, membership }
    toast.add({ title: files.length > 1 ? `${files.length} archivos subidos.` : 'Archivo subido.', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Error al subir', description: e?.data?.statusMessage || e.message, color: 'error' })
  } finally {
    uploading.value = null
  }
}

function onDrop(kind: Kind, e: DragEvent) {
  dragOver.value = null
  upload(kind, e.dataTransfer?.files)
}

const fileToDelete = ref<any>(null)
const deleting = ref(false)
async function deleteFile() {
  if (!fileToDelete.value) return
  deleting.value = true
  try {
    const membership = await $fetch(`/api/members/${id.value}/files/${fileToDelete.value._id}`, { method: 'DELETE' })
    data.value = { ...data.value, membership }
    toast.add({ title: 'Archivo quitado.', color: 'success' })
    fileToDelete.value = null
  } catch (e: any) {
    toast.add({ title: 'Error', description: e?.data?.statusMessage || e.message, color: 'error' })
  } finally {
    deleting.value = false
  }
}

function fileSize(b: number) {
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(b / 1024))} KB`
}

// ── payments ─────────────────────────────────────────────
const payments = computed<any[]>(() => m.value?.payments || [])
const paidTotal = computed(() => payments.value.reduce((sum, p) => sum + p.amount, 0))
const proofName = (fileId: string | null) => filesOf('payment').find((f: any) => f._id === fileId)?.fileName

const payForm = reactive({ amount: '', paidAt: '', note: '', fileId: '', contractId: '' })
function resetPayForm() {
  payForm.amount = ''
  payForm.paidAt = localToday()
  payForm.note = ''
  payForm.fileId = ''
  payForm.contractId = contracts.value[0]?._id ?? ''
}

const addingPayment = ref(false)
async function addPayment() {
  addingPayment.value = true
  try {
    const membership = await $fetch(`/api/members/${id.value}/payments`, {
      method: 'POST',
      body: { amount: payForm.amount, paidAt: payForm.paidAt, note: payForm.note, fileId: payForm.fileId || null, contractId: payForm.contractId || null },
    })
    data.value = { ...data.value, membership }
    toast.add({ title: 'Pago registrado.', color: 'success' })
    resetPayForm()
  } catch (e: any) {
    toast.add({ title: 'No se pudo registrar el pago', description: e?.data?.statusMessage || e.message, color: 'error' })
  } finally {
    addingPayment.value = false
  }
}

const paymentToDelete = ref<any>(null)
const deletingPayment = ref(false)
async function deletePayment() {
  if (!paymentToDelete.value) return
  deletingPayment.value = true
  try {
    const membership = await $fetch(`/api/members/${id.value}/payments/${paymentToDelete.value._id}`, { method: 'DELETE' })
    data.value = { ...data.value, membership }
    toast.add({ title: 'Pago eliminado.', color: 'success' })
    paymentToDelete.value = null
  } catch (e: any) {
    toast.add({ title: 'Error', description: e?.data?.statusMessage || e.message, color: 'error' })
  } finally {
    deletingPayment.value = false
  }
}

async function assignPayment(p: any, contractId: string) {
  try {
    const membership = await $fetch(`/api/members/${id.value}/payments/${p._id}`, { method: 'PATCH', body: { contractId: contractId || null } })
    data.value = { ...data.value, membership }
    toast.add({ title: contractId ? 'Pago asignado al contrato.' : 'Pago sin contrato.', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Error', description: e?.data?.statusMessage || e.message, color: 'error' })
  }
}

// ── contracts ────────────────────────────────────────────
// Newest first (server order). The panel shows one at a time; older ones are a click away.
const contracts = computed<any[]>(() => m.value?.contracts || [])
const contractLabel = (c: any) => `Desde ${formatDate(c.startsAt)}`
const contractById = (cid: string | null) => contracts.value.find(c => c._id === cid)
const unassigned = computed(() => payments.value.filter(p => !p.contractId || !contractById(p.contractId)))

const shownContractId = ref<string | null>(null)
const shownContract = computed(() => contractById(shownContractId.value) ?? contracts.value[0] ?? null)
watch(contracts, (list, old) => {
  // a new contract becomes the one shown, and the default for new payments
  if (list.length !== old?.length) {
    shownContractId.value = list[0]?._id ?? null
    payForm.contractId = list[0]?._id ?? ''
  }
}, { immediate: true })
resetPayForm()

const editing = ref<{ contract: any | null } | null>(null)
function onContractSaved(membership: any) {
  data.value = { ...data.value, membership }
  editing.value = null
}

const contractToDelete = ref<any>(null)
const deletingContract = ref(false)
async function deleteContract() {
  if (!contractToDelete.value) return
  deletingContract.value = true
  try {
    const membership = await $fetch(`/api/members/${id.value}/contracts/${contractToDelete.value._id}`, { method: 'DELETE' })
    data.value = { ...data.value, membership }
    toast.add({ title: 'Contrato eliminado.', color: 'success' })
    contractToDelete.value = null
  } catch (e: any) {
    toast.add({ title: 'Error', description: e?.data?.statusMessage || e.message, color: 'error' })
  } finally {
    deletingContract.value = false
  }
}

const INSTALLMENT: Record<string, { text: string; cls: string }> = {
  paid:    { text: 'Pagada',    cls: 'green' },
  partial: { text: 'Parcial',   cls: 'alpha' },
  overdue: { text: 'Vencida',   cls: 'red' },
  pending: { text: 'Pendiente', cls: 'none' },
}

// ── role actions ─────────────────────────────────────────
const action = ref<'promote' | 'pause' | 'resume' | 'remove' | null>(null)
const actionMember = computed(() => user.value ? { _id: user.value._id, username: user.value.username, expiresAt: m.value?.expiresAt ?? null } : null)
async function onActionDone() {
  action.value = null
  await refresh()
}

const HISTORY: Record<string, { label: string; icon: string }> = {
  'promoted':            { label: 'Promovido a Alpha',      icon: 'i-lucide-crown' },
  'removed':             { label: 'Alpha removido',         icon: 'i-lucide-user-minus' },
  'paused':              { label: 'Membresía pausada',      icon: 'i-lucide-circle-pause' },
  'resumed':             { label: 'Membresía reanudada',    icon: 'i-lucide-circle-play' },
  'updated':             { label: 'Datos actualizados',     icon: 'i-lucide-pencil' },
  'payment-proof-added': { label: 'Comprobante agregado',   icon: 'i-lucide-receipt' },
  'contract-added':      { label: 'Contrato agregado',      icon: 'i-lucide-file-signature' },
  'file-deleted':        { label: 'Archivo quitado',        icon: 'i-lucide-file-x' },
  'payment-added':       { label: 'Pago registrado',        icon: 'i-lucide-banknote' },
  'payment-deleted':     { label: 'Pago eliminado',         icon: 'i-lucide-banknote' },
  'payment-assigned':    { label: 'Pago movido de contrato', icon: 'i-lucide-arrow-right-left' },
  'contract-created':    { label: 'Contrato creado',        icon: 'i-lucide-file-pen-line' },
  'contract-updated':    { label: 'Contrato editado',       icon: 'i-lucide-file-pen-line' },
  'contract-deleted':    { label: 'Contrato eliminado',     icon: 'i-lucide-file-x' },
}
const FIELD_LABEL: Record<string, string> = { purchasedAt: 'compra', expiresAt: 'vencimiento', notes: 'notas' }
function historyDetail(h: any) {
  if (h.action === 'updated') return h.detail.split(', ').map((f: string) => FIELD_LABEL[f] ?? f).join(', ')
  if (h.action === 'contract-created' || h.action === 'contract-updated') {
    const [value, n] = h.detail.split(' · ')
    return `${formatMoney(Number(value))} · ${n === '1' ? 'pago único' : `${n} cuotas`}`
  }
  if (h.action === 'contract-deleted') return formatMoney(Number(h.detail))
  if (h.action === 'payment-added' || h.action === 'payment-deleted' || h.action === 'payment-assigned') {
    const [amount, date] = h.detail.split(' · ')
    return `${formatMoney(Number(amount))} · ${formatDate(date)}`
  }
  return h.detail
}
function formatDateTime(d: string) {
  return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <NuxtLink :to="hasAlpha || isPaused ? '/' : '/deltas'" class="mb-back">
    <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
    {{ hasAlpha || isPaused ? 'Alphas' : 'Deltas' }}
  </NuxtLink>

  <div v-if="pending && !data" class="stc-panel" style="padding:28px">
    <div class="flex items-center gap-4">
      <USkeleton class="w-16 h-16 rounded-xl" />
      <div class="space-y-2"><USkeleton class="h-6 w-48" /><USkeleton class="h-3.5 w-32" /></div>
    </div>
  </div>

  <div v-else-if="error" class="stc-panel p-empty">
    {{ error.statusCode === 404 ? 'Usuario no encontrado.' : 'No se pudo cargar el usuario.' }}
  </div>

  <template v-else-if="user">
    <!-- ── Hero ───────────────────────────────────────────── -->
    <section class="stc-panel mb-hero">
      <div class="flex items-center gap-4 min-w-0">
        <MemberAvatar :username="user.username" :avatar-url="user.avatarUrl" :size="64" />
        <div class="min-w-0">
          <div class="mb-name">{{ user.username }}</div>
          <div class="p-uid stc-mono" style="font-size:12px">{{ user._id }}</div>
          <div class="flex gap-1.5 flex-wrap" style="margin-top:9px">
            <span v-if="displayStatus !== 'none'" class="p-rbadge" :class="statusBadge(displayStatus).cls">
              <UIcon :name="statusBadge(displayStatus).icon" class="w-3 h-3" />
              {{ statusBadge(displayStatus).text }}
            </span>
            <span v-for="r in visibleRoles" :key="r" class="p-rbadge" :class="roleCls(r)">{{ r }}</span>
            <span v-if="user.removedAt" class="p-rbadge red">Fuera del servidor</span>
          </div>
        </div>
      </div>

      <div class="mb-actions">
        <template v-if="isPaused">
          <button class="stc-btn gold" @click="action = 'resume'">
            <UIcon name="i-lucide-circle-play" class="w-4 h-4" /> Reanudar
          </button>
          <button class="stc-btn danger" @click="action = 'remove'">
            <UIcon name="i-lucide-user-minus" class="w-4 h-4" /> Quitar Alpha
          </button>
        </template>
        <template v-else-if="hasAlpha">
          <button class="stc-btn gold-soft" @click="action = 'pause'">
            <UIcon name="i-lucide-circle-pause" class="w-4 h-4" /> Pausar membresía
          </button>
          <button class="stc-btn danger" @click="action = 'remove'">
            <UIcon name="i-lucide-user-minus" class="w-4 h-4" /> Quitar Alpha
          </button>
        </template>
        <button v-else-if="!hasAlphaDot && !user.removedAt" class="stc-btn gold" @click="action = 'promote'">
          <UIcon name="i-lucide-crown" class="w-4 h-4" /> Hacer Alpha
        </button>
      </div>
    </section>

    <div v-if="isPaused && m?.currentPause" class="mb-banner">
      <UIcon name="i-lucide-circle-pause" class="w-4 h-4 flex-shrink-0" />
      <span>
        Pausada desde <b>{{ formatDate(m.currentPause.startedAt) }}</b> por {{ m.currentPause.months }} mes(es) — termina el
        <b>{{ formatDate(m.currentPause.resumesAt) }}</b>.
        <template v-if="new Date(m.currentPause.resumesAt) < new Date()"> Ya puede reanudarse.</template>
        <template v-if="m.currentPause.reason"> Motivo: {{ m.currentPause.reason }}</template>
      </span>
    </div>

    <div class="mb-grid">
      <div class="flex flex-col" style="gap:18px">
      <!-- ── Contract ───────────────────────────────────────── -->
      <section class="stc-panel">
        <div class="stc-panel-head">
          <div class="stc-panel-title"><UIcon name="i-lucide-file-pen-line" class="w-5 h-5" /> Contrato</div>
          <button class="stc-btn sm" @click="editing = { contract: null }">
            <UIcon name="i-lucide-plus" class="w-3.5 h-3.5" /> {{ contracts.length ? 'Renovación' : 'Nuevo contrato' }}
          </button>
        </div>

        <div v-if="!shownContract" class="mb-body mb-empty">
          <p>Sin contrato. Registra cuánto vale la membresía y, si paga en partes, su plan de pagos.</p>
          <button class="stc-btn gold" @click="editing = { contract: null }">
            <UIcon name="i-lucide-file-pen-line" class="w-4 h-4" /> Registrar contrato
          </button>
        </div>

        <div v-else class="mb-body">
          <div v-if="contracts.length > 1" class="p-seg mb-ctabs" role="tablist" aria-label="Contratos">
            <button
              v-for="c in contracts" :key="c._id" role="tab" :aria-selected="shownContract._id === c._id"
              :class="{ on: shownContract._id === c._id }" @click="shownContractId = c._id"
            >
              {{ formatDate(c.startsAt) }}
              <UIcon v-if="c.due === 0" name="i-lucide-check" class="w-3 h-3" />
            </button>
          </div>

          <div class="mb-cstats">
            <div><span class="stc-eyebrow">Valor</span><b class="stc-mono">{{ formatMoney(shownContract.value) }}</b></div>
            <div><span class="stc-eyebrow">Pagado</span><b class="stc-mono">{{ formatMoney(shownContract.paid) }}</b></div>
            <div>
              <span class="stc-eyebrow">Por cobrar</span>
              <b class="stc-mono" :style="{ color: shownContract.overdue ? 'var(--red)' : shownContract.due ? 'var(--gold-soft)' : 'var(--green)' }">{{ formatMoney(shownContract.due) }}</b>
            </div>
          </div>
          <div
            class="mb-cbar" role="progressbar" aria-label="Pagado del contrato"
            :aria-valuenow="Math.round(Math.min(1, shownContract.paid / shownContract.value) * 100)" aria-valuemin="0" aria-valuemax="100"
          >
            <span :style="{ width: `${Math.min(100, (shownContract.paid / shownContract.value) * 100)}%` }" />
          </div>

          <div class="mb-cstatus">
            <span v-if="shownContract.overdue" class="p-rbadge red">
              <UIcon name="i-lucide-circle-alert" class="w-3 h-3" /> Vencido {{ formatMoney(shownContract.overdue) }} · hace {{ shownContract.overdueDays }}d
            </span>
            <span v-else-if="shownContract.due === 0" class="p-rbadge green">
              <UIcon name="i-lucide-circle-check" class="w-3 h-3" /> Liquidado
            </span>
            <span v-else class="p-rbadge alpha">
              <UIcon name="i-lucide-calendar-clock" class="w-3 h-3" /> Al corriente
            </span>
            <span v-if="shownContract.nextDue" class="mb-cnext">
              Próximo: <b class="stc-mono">{{ formatMoney(shownContract.nextDue.amount) }}</b> el {{ formatDate(shownContract.nextDue.dueAt) }}
            </span>
            <span v-if="shownContract.credit" class="mb-cnext">Saldo a favor: <b class="stc-mono">{{ formatMoney(shownContract.credit) }}</b></span>
          </div>

          <div class="mb-plan">
            <div class="stc-eyebrow" style="margin-bottom:8px">{{ shownContract.hasPlan ? `Plan de pagos · ${shownContract.installments.length} cuotas` : 'Pago único' }}</div>
            <div v-for="(i, n) in shownContract.installments" :key="i._id" class="mb-inst">
              <span class="mb-inst-n stc-mono">{{ n + 1 }}</span>
              <span class="mb-inst-date stc-mono">{{ formatDate(i.dueAt) }}</span>
              <span class="mb-inst-amt stc-mono">
                {{ formatMoney(i.amount) }}
                <small v-if="i.paid && i.remaining">faltan {{ formatMoney(i.remaining) }}</small>
              </span>
              <span class="p-rbadge mb-inst-badge" :class="INSTALLMENT[i.status]!.cls">{{ INSTALLMENT[i.status]!.text }}</span>
            </div>
          </div>

          <p v-if="shownContract.note" class="mb-cnote">{{ shownContract.note }}</p>

          <div class="flex justify-end gap-2" style="margin-top:14px">
            <button class="stc-btn sm danger" @click="contractToDelete = shownContract">
              <UIcon name="i-lucide-trash-2" class="w-3.5 h-3.5" /> Eliminar
            </button>
            <button class="stc-btn sm" @click="editing = { contract: shownContract }">
              <UIcon name="i-lucide-pencil" class="w-3.5 h-3.5" /> Editar
            </button>
          </div>
        </div>
      </section>

      <!-- ── Payments ───────────────────────────────────────── -->
      <section class="stc-panel">
        <div class="stc-panel-head">
          <div class="stc-panel-title"><UIcon name="i-lucide-banknote" class="w-5 h-5" /> Pagos</div>
          <span v-if="payments.length" class="stc-mono" style="font-size:12px; color:var(--dim)">
            Total <b style="color:var(--text); font-weight:600">{{ formatMoney(paidTotal) }}</b>
          </span>
        </div>
        <div class="mb-body">
          <div v-if="payments.length" class="mb-files">
            <div v-for="p in payments" :key="p._id" class="mb-file">
              <span class="mb-pay-amt stc-mono">{{ formatMoney(p.amount) }}</span>
              <div class="flex-1 min-w-0">
                <div class="mb-file-meta stc-mono" style="display:block">
                  {{ formatDate(p.paidAt) }}<template v-if="p.by"> · {{ p.by }}</template>
                  <template v-if="contracts.length > 1 && contractById(p.contractId)"> · contrato {{ formatDate(contractById(p.contractId).startsAt) }}</template>
                </div>
                <label v-if="contracts.length && !contractById(p.contractId)" class="mb-pay-assign">
                  <UIcon name="i-lucide-link-2-off" class="w-3 h-3" />
                  <span class="sr-only">Asignar a contrato</span>
                  <select class="mb-pay-assign-sel" :value="''" @change="assignPayment(p, ($event.target as HTMLSelectElement).value)">
                    <option value="" disabled>Sin contrato · asignar a…</option>
                    <option v-for="c in contracts" :key="c._id" :value="c._id">{{ contractLabel(c) }} · {{ formatMoney(c.value) }}</option>
                  </select>
                </label>
                <div v-if="p.note || p.fileId" class="mb-pay-note">
                  <a v-if="p.fileId && proofName(p.fileId)" :href="`/api/members/${id}/files/${p.fileId}`" target="_blank" rel="noopener" class="mb-pay-proof" :title="proofName(p.fileId)">
                    <UIcon name="i-lucide-receipt" class="w-3 h-3" /> comprobante
                  </a>
                  {{ p.note }}
                </div>
              </div>
              <button class="p-rbtn danger" style="width:28px; height:28px" title="Eliminar pago" @click="paymentToDelete = p">
                <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <form @submit.prevent="addPayment">
            <div class="p-field-row">
              <label class="p-field">
                <span class="stc-eyebrow">Monto ({{ currency }})</span>
                <input v-model="payForm.amount" type="number" min="0.01" step="0.01" inputmode="decimal" required class="stc-input" placeholder="0.00">
              </label>
              <label class="p-field">
                <span class="stc-eyebrow">Fecha del pago</span>
                <input v-model="payForm.paidAt" type="date" required class="stc-input">
              </label>
            </div>
            <label v-if="contracts.length" class="p-field" style="margin-top:12px">
              <span class="stc-eyebrow">Contrato</span>
              <select v-model="payForm.contractId" class="stc-input">
                <option v-for="c in contracts" :key="c._id" :value="c._id">
                  {{ contractLabel(c) }} · por cobrar {{ formatMoney(c.due) }}
                </option>
                <option value="">Sin contrato</option>
              </select>
            </label>
            <div class="p-field-row" style="margin-top:12px">
              <label class="p-field">
                <span class="stc-eyebrow">Comprobante</span>
                <select v-model="payForm.fileId" class="stc-input" :disabled="!filesOf('payment').length">
                  <option value="">{{ filesOf('payment').length ? 'Ninguno' : 'Sin comprobantes subidos' }}</option>
                  <option v-for="f in filesOf('payment')" :key="f._id" :value="f._id">{{ f.fileName }}</option>
                </select>
              </label>
              <label class="p-field">
                <span class="stc-eyebrow">Nota</span>
                <input v-model="payForm.note" type="text" maxlength="500" class="stc-input" placeholder="Plan, método…">
              </label>
            </div>
            <div class="flex justify-end" style="margin-top:14px">
              <button type="submit" class="stc-btn gold" :disabled="addingPayment || !payForm.amount || !payForm.paidAt">
                <UIcon :name="addingPayment ? 'i-lucide-loader-circle' : 'i-lucide-plus'" class="w-4 h-4" :class="{ 'p-spin': addingPayment }" />
                {{ addingPayment ? 'Registrando…' : 'Registrar pago' }}
              </button>
            </div>
          </form>
        </div>
      </section>
      </div>

      <!-- ── Files ──────────────────────────────────────────── -->
      <div class="flex flex-col" style="gap:18px">
        <!-- ── Membership details ─────────────────────────────── -->
        <section class="stc-panel">
          <div class="stc-panel-head">
            <div class="stc-panel-title"><UIcon name="i-lucide-badge-dollar-sign" class="w-5 h-5" /> Membresía</div>
            <span v-if="m?.expiresAt" class="p-rbadge" :class="expiryBadge(m.expiresAt).cls">{{ expiryBadge(m.expiresAt).text }}</span>
          </div>
          <form class="mb-body" @submit.prevent="save">
            <div class="p-field-row">
              <label class="p-field">
                <span class="stc-eyebrow">Fecha de compra</span>
                <input v-model="form.purchasedAt" type="date" class="stc-input">
              </label>
              <label class="p-field">
                <span class="stc-eyebrow">Vence</span>
                <input v-model="form.expiresAt" type="date" class="stc-input">
              </label>
            </div>
            <div class="flex items-center gap-2 flex-wrap" style="margin-top:10px">
              <span class="stc-eyebrow" style="margin-right:2px">Vence a</span>
              <button
                v-for="n in [1, 3, 6, 12]" :key="n" type="button" class="stc-btn sm"
                :disabled="!form.purchasedAt" :title="form.purchasedAt ? '' : 'Pon primero la fecha de compra'"
                @click="form.expiresAt = plusMonths(form.purchasedAt, n)"
              >+{{ n }} {{ n === 1 ? 'mes' : 'meses' }}</button>
            </div>
            <label class="p-field" style="margin-top:16px">
              <span class="stc-eyebrow">Notas</span>
              <textarea v-model="form.notes" class="stc-input" maxlength="4000" placeholder="Método de pago, monto, plan, acuerdos…" />
            </label>
            <div class="flex justify-end gap-2" style="margin-top:16px">
              <button type="button" class="stc-btn" :disabled="!dirty || saving" @click="resetForm">Descartar</button>
              <button type="submit" class="stc-btn gold" :disabled="!dirty || saving">
                <UIcon :name="saving ? 'i-lucide-loader-circle' : 'i-lucide-save'" class="w-4 h-4" :class="{ 'p-spin': saving }" />
                {{ saving ? 'Guardando…' : 'Guardar' }}
              </button>
            </div>
          </form>
        </section>

        <section
          v-for="kind in (['payment', 'contract'] as const)" :key="kind"
          class="stc-panel"
        >
          <div class="stc-panel-head">
            <div class="stc-panel-title">
              <UIcon :name="kind === 'payment' ? 'i-lucide-receipt' : 'i-lucide-file-signature'" class="w-5 h-5" />
              {{ kind === 'payment' ? 'Comprobantes de pago' : 'Contrato DocuSign' }}
            </div>
            <span class="stc-mono" style="font-size:12px; color:var(--faint)">{{ filesOf(kind).length }}</span>
          </div>
          <div class="mb-body">
            <div v-if="filesOf(kind).length" class="mb-files">
              <div v-for="f in filesOf(kind)" :key="f._id" class="mb-file">
                <UIcon :name="f.contentType === 'application/pdf' ? 'i-lucide-file-text' : 'i-lucide-image'" class="w-4 h-4 flex-shrink-0" style="color:var(--gold)" />
                <a :href="`/api/members/${id}/files/${f._id}`" target="_blank" rel="noopener" class="mb-file-name" :title="f.fileName">{{ f.fileName }}</a>
                <span class="mb-file-meta stc-mono">{{ fileSize(f.size) }} · {{ formatDate(f.uploadedAt) }}<template v-if="f.uploadedBy"> · {{ f.uploadedBy }}</template></span>
                <button class="p-rbtn danger" style="width:28px; height:28px" title="Quitar" @click="fileToDelete = f">
                  <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <label
              class="mb-drop"
              :class="{ over: dragOver === kind, busy: uploading === kind }"
              @dragover.prevent="dragOver = kind"
              @dragleave="dragOver = null"
              @drop.prevent="onDrop(kind, $event)"
            >
              <input
                type="file" :accept="ACCEPT" multiple hidden
                :disabled="!!uploading"
                @change="e => { const el = e.target as HTMLInputElement; upload(kind, el.files); el.value = '' }"
              >
              <UIcon :name="uploading === kind ? 'i-lucide-loader-circle' : 'i-lucide-cloud-upload'" class="w-6 h-6" :class="{ 'p-spin': uploading === kind }" />
              <span>{{ uploading === kind ? 'Subiendo…' : kind === 'payment' ? 'Arrastra la captura del pago o haz clic' : 'Arrastra el PDF firmado o haz clic' }}</span>
              <span class="stc-mono" style="font-size:11px; color:var(--faint)">PNG, JPG, WEBP, GIF o PDF · máx. 15 MB</span>
            </label>
          </div>
        </section>
      </div>
    </div>

    <!-- ── History ────────────────────────────────────────── -->
    <section v-if="m?.history?.length" class="stc-panel">
      <div class="stc-panel-head">
        <div class="stc-panel-title"><UIcon name="i-lucide-history" class="w-5 h-5" /> Historial</div>
      </div>
      <div class="mb-hist">
        <div v-for="(h, i) in m.history" :key="i" class="mb-hrow">
          <span class="mb-hicon"><UIcon :name="HISTORY[h.action]?.icon ?? 'i-lucide-dot'" class="w-3.5 h-3.5" /></span>
          <div class="flex-1 min-w-0">
            <div style="font-size:13.5px; color:var(--text)">
              {{ HISTORY[h.action]?.label ?? h.action }}
              <span v-if="historyDetail(h)" style="color:var(--dim)"> — {{ historyDetail(h) }}</span>
            </div>
            <div class="stc-mono" style="font-size:11px; color:var(--faint); margin-top:2px">{{ formatDateTime(h.at) }}<template v-if="h.by"> · {{ h.by }}</template></div>
          </div>
        </div>
      </div>
    </section>
  </template>

  <MemberActionModal :action="action" :member="actionMember" @close="action = null" @done="onActionDone" />

  <UModal :open="!!fileToDelete" :dismissible="!deleting" @update:open="v => { if (!v && !deleting) fileToDelete = null }">
    <template #content>
      <div class="p-modal">
        <div class="p-modal-head">
          <span class="p-modal-glyph red"><UIcon name="i-lucide-file-x" class="w-5 h-5" /></span>
          <h3 class="p-modal-title">Quitar archivo</h3>
        </div>
        <p class="p-modal-p">
          ¿Quitar <b>{{ fileToDelete?.fileName }}</b> de la ficha? El archivo se conserva en S3, solo deja de aparecer aquí.
        </p>
        <div class="p-modal-foot">
          <button class="stc-btn" :disabled="deleting" @click="fileToDelete = null">Cancelar</button>
          <button class="stc-btn danger" :disabled="deleting" @click="deleteFile">
            <UIcon name="i-lucide-x" class="w-3.5 h-3.5" /> {{ deleting ? 'Quitando…' : 'Quitar' }}
          </button>
        </div>
      </div>
    </template>
  </UModal>

  <ContractModal
    :open="!!editing" :member-id="id" :contract="editing?.contract ?? null"
    :unassigned="unassigned" :default-start="m?.purchasedAt ? toInputDate(m.purchasedAt) : localToday()"
    @close="editing = null" @saved="onContractSaved"
  />

  <UModal :open="!!contractToDelete" :dismissible="!deletingContract" @update:open="v => { if (!v && !deletingContract) contractToDelete = null }">
    <template #content>
      <div class="p-modal">
        <div class="p-modal-head">
          <span class="p-modal-glyph red"><UIcon name="i-lucide-file-x" class="w-5 h-5" /></span>
          <h3 class="p-modal-title">Eliminar contrato</h3>
        </div>
        <p class="p-modal-p">
          ¿Eliminar el contrato de <b>{{ formatMoney(contractToDelete?.value) }}</b> desde el <b>{{ formatDate(contractToDelete?.startsAt) }}</b>?
          Sus {{ contractToDelete?.paymentCount }} pago(s) se conservan y siguen contando en los ingresos, pero quedan sin contrato.
        </p>
        <div class="p-modal-foot">
          <button class="stc-btn" :disabled="deletingContract" @click="contractToDelete = null">Cancelar</button>
          <button class="stc-btn danger" :disabled="deletingContract" @click="deleteContract">
            <UIcon name="i-lucide-trash-2" class="w-3.5 h-3.5" /> {{ deletingContract ? 'Eliminando…' : 'Eliminar' }}
          </button>
        </div>
      </div>
    </template>
  </UModal>

  <UModal :open="!!paymentToDelete" :dismissible="!deletingPayment" @update:open="v => { if (!v && !deletingPayment) paymentToDelete = null }">
    <template #content>
      <div class="p-modal">
        <div class="p-modal-head">
          <span class="p-modal-glyph red"><UIcon name="i-lucide-banknote" class="w-5 h-5" /></span>
          <h3 class="p-modal-title">Eliminar pago</h3>
        </div>
        <p class="p-modal-p">
          ¿Eliminar el pago de <b>{{ formatMoney(paymentToDelete?.amount) }}</b> del <b>{{ formatDate(paymentToDelete?.paidAt) }}</b>?
          Deja de contar en los ingresos.
        </p>
        <div class="p-modal-foot">
          <button class="stc-btn" :disabled="deletingPayment" @click="paymentToDelete = null">Cancelar</button>
          <button class="stc-btn danger" :disabled="deletingPayment" @click="deletePayment">
            <UIcon name="i-lucide-x" class="w-3.5 h-3.5" /> {{ deletingPayment ? 'Eliminando…' : 'Eliminar' }}
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.mb-back {
  display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
  font-size: 12.5px; font-weight: 500; color: var(--dim); text-decoration: none; transition: color .14s;
}
.mb-back:hover { color: var(--gold-soft); }

.mb-hero { padding: 22px 24px; display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
.mb-name {
  font-family: var(--disp); font-size: 32px; font-weight: 800; line-height: 1.02;
  text-transform: uppercase; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mb-actions { display: flex; gap: 10px; flex-wrap: wrap; }
@media (max-width: 640px) {
  .mb-hero { padding: 18px 16px; }
  .mb-name { font-size: 26px; }
  .mb-actions { width: 100%; }
  .mb-actions .stc-btn { flex: 1 1 140px; }
  .mb-body { padding: 16px; }
}

.mb-banner {
  display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--blue);
  background: var(--blue-dim); border: 1px solid var(--blue-line); border-radius: var(--r-sm); padding: 11px 14px;
}
.mb-banner b { font-weight: 600; }

.mb-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; align-items: start; }
@media (max-width: 1000px) { .mb-grid { grid-template-columns: minmax(0, 1fr); } }
.mb-body { padding: 18px 20px 20px; }

.mb-files { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.mb-file {
  display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 12px;
  border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--inset);
}
.mb-file-name {
  flex: 1; min-width: 0; font-size: 13px; font-weight: 500; color: var(--text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: none;
}
.mb-file-name:hover { color: var(--gold-soft); text-decoration: underline; }
.mb-file-meta { font-size: 11px; color: var(--faint); white-space: nowrap; }
@media (max-width: 640px) { .mb-file-meta { display: none; } }

.mb-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
.mb-empty p { font-size: 13.5px; color: var(--dim); line-height: 1.5; margin: 0; }
.mb-ctabs { margin-bottom: 16px; }
.mb-cstats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.mb-cstats > div { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.mb-cstats b { font-size: 17px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mb-cbar { height: 6px; border-radius: 99px; background: var(--inset); border: 1px solid var(--line); margin-top: 14px; overflow: hidden; }
.mb-cbar span { display: block; height: 100%; background: var(--gold); border-radius: 99px; }
.mb-cstatus { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; margin-top: 12px; }
.mb-cnext { font-size: 12.5px; color: var(--dim); }
.mb-cnext b { color: var(--text); font-weight: 600; }
.mb-plan { margin-top: 18px; }
.mb-inst { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto 84px; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line); }
.mb-inst-badge { justify-self: end; }
.mb-inst-n { font-size: 11px; color: var(--faint); text-align: right; }
.mb-inst-date { font-size: 13px; color: var(--dim); white-space: nowrap; }
.mb-inst-amt { font-size: 13px; font-weight: 600; color: var(--text); text-align: right; display: flex; flex-direction: column; align-items: flex-end; }
.mb-inst-amt small { font-size: 11px; font-weight: 500; color: var(--red); }
.mb-cnote { font-size: 12.5px; color: var(--dim); margin: 12px 0 0; }
@media (max-width: 480px) {
  .mb-cstats { grid-template-columns: 1fr; gap: 8px; }
  .mb-cstats > div { flex-direction: row; align-items: baseline; justify-content: space-between; gap: 10px; }
  .mb-cstats b { font-size: 15px; }
  .mb-inst { grid-template-columns: 16px minmax(0, 1fr) auto 76px; gap: 8px; }
  .mb-inst-date { font-size: 12px; }
}
.mb-pay-assign { display: flex; align-items: center; gap: 5px; margin-top: 4px; color: var(--gold); font-size: 12px; max-width: 100%; }
.mb-pay-assign .iconify { flex-shrink: 0; }
.mb-pay-assign-sel {
  font: inherit; color: var(--gold-soft); background: transparent; border: 1px dashed var(--gold-ring);
  border-radius: 5px; padding: 2px 6px; min-width: 0; max-width: 100%; text-overflow: ellipsis; cursor: pointer;
}

.mb-pay-amt { font-size: 14px; font-weight: 600; color: var(--text); min-width: 96px; }
.mb-pay-note { font-size: 12px; color: var(--dim); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mb-pay-proof { display: inline-flex; align-items: center; gap: 3px; color: var(--gold); text-decoration: none; margin-right: 4px; }
.mb-pay-proof:hover { text-decoration: underline; }

.mb-drop {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  padding: 22px 16px; text-align: center; font-size: 13px; color: var(--dim);
  border: 1.5px dashed var(--line-2); border-radius: var(--r); cursor: pointer; transition: .15s;
}
.mb-drop:hover, .mb-drop.over { border-color: var(--gold-ring); background: var(--gold-wash); color: var(--text); }
.mb-drop.busy { pointer-events: none; opacity: .7; }
.mb-drop .iconify { color: var(--gold); }

.mb-hist { padding: 6px 20px 12px; }
.mb-hrow { display: flex; gap: 12px; padding: 11px 0; border-top: 1px solid var(--line); }
.mb-hrow:first-child { border-top: none; }
.mb-hicon {
  width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0; display: grid; place-items: center;
  color: var(--gold); background: var(--gold-wash); border: 1px solid var(--gold-ring);
}
</style>
