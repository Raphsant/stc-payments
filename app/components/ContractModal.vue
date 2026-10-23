<script setup lang="ts">
// Create or edit a contract: what the membership is worth and, optionally,
// how it's paid (down payment + installments). A plan must add up to the
// contract value; the server enforces the same rule.

const props = defineProps<{
  open: boolean
  memberId: string
  contract: any | null          // existing contract summary → edit; null → new
  unassigned: any[]             // payments on no contract, offered on create
  defaultStart: string          // YYYY-MM-DD
}>()
const emit = defineEmits<{ close: []; saved: [membership: any] }>()

const toast = useToast()
const { formatDate, formatMoney, currency } = useMemberFormat()

const busy = ref(false)
const error = ref('')

type Row = { key: number; dueAt: string; amount: string }
let rowKey = 0
const form = reactive({
  startsAt: '',
  value: '',
  note: '',
  mode: 'single' as 'single' | 'plan',
  rows: [] as Row[],
  assign: [] as string[],
})
// plan generator
const gen = reactive({ down: '', count: 2, every: 1, first: '' })

const cents = (n: number) => Math.round(n * 100) / 100
const toNum = (s: string | number) => Number(String(s).replace(/[,\s$]/g, '')) || 0

function addMonths(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

watch(() => props.open, (open) => {
  if (!open) return
  error.value = ''
  const c = props.contract
  form.startsAt = c ? c.startsAt.slice(0, 10) : props.defaultStart
  form.value = c ? String(c.value) : ''
  form.note = c?.note ?? ''
  form.mode = c?.hasPlan ? 'plan' : 'single'
  form.rows = c?.hasPlan
    ? c.installments.map((i: any) => ({ key: rowKey++, dueAt: i.dueAt.slice(0, 10), amount: String(i.amount) }))
    : []
  form.assign = c ? [] : props.unassigned.map(p => p._id)
  gen.down = ''
  gen.count = 2
  gen.every = 1
  gen.first = addMonths(form.startsAt, 1)
}, { immediate: true })

watch(() => form.startsAt, (s) => { if (s && !props.contract) gen.first = addMonths(s, 1) })

// Down payment on the start date, the rest split evenly; the last installment
// absorbs the rounding so the plan always adds up to the value.
function generate() {
  const value = toNum(form.value)
  const down = Math.min(toNum(gen.down), value)
  const n = Math.max(1, Math.min(60, Math.floor(gen.count) || 1))
  const each = cents((value - down) / n)
  const rows: Row[] = []
  if (down > 0) rows.push({ key: rowKey++, dueAt: form.startsAt, amount: String(down) })
  for (let i = 0; i < n; i++) {
    const amount = i === n - 1 ? cents(value - down - each * (n - 1)) : each
    rows.push({ key: rowKey++, dueAt: addMonths(gen.first || form.startsAt, i * (gen.every || 1)), amount: String(amount) })
  }
  form.rows = rows
}

function addRow() {
  const last = form.rows[form.rows.length - 1]
  form.rows.push({ key: rowKey++, dueAt: last ? addMonths(last.dueAt, 1) : form.startsAt, amount: '' })
}

const planSum = computed(() => cents(form.rows.reduce((s, r) => s + toNum(r.amount), 0)))
const planDiff = computed(() => cents(toNum(form.value) - planSum.value))
const canSave = computed(() =>
  !!form.startsAt && toNum(form.value) > 0
  && (form.mode === 'single' || (form.rows.length > 0 && planDiff.value === 0 && form.rows.every(r => r.dueAt && toNum(r.amount) > 0))),
)

async function save() {
  if (!canSave.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const body = {
      startsAt: form.startsAt,
      value: toNum(form.value),
      note: form.note,
      installments: form.mode === 'plan'
        ? [...form.rows].sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map(r => ({ dueAt: r.dueAt, amount: toNum(r.amount) }))
        : [],
      ...(props.contract ? {} : { assignPaymentIds: form.assign }),
    }
    const membership = props.contract
      ? await $fetch(`/api/members/${props.memberId}/contracts/${props.contract._id}`, { method: 'PATCH', body })
      : await $fetch(`/api/members/${props.memberId}/contracts`, { method: 'POST', body })
    toast.add({ title: props.contract ? 'Contrato actualizado.' : 'Contrato creado.', color: 'success' })
    emit('saved', membership)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Algo salió mal'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    :open="open" :dismissible="!busy" :ui="{ content: 'sm:max-w-2xl' }"
    @update:open="v => { if (!v && !busy) emit('close') }"
  >
    <template #content>
      <form class="p-modal cm" @submit.prevent="save">
        <div class="p-modal-head">
          <span class="p-modal-glyph"><UIcon name="i-lucide-file-pen-line" class="w-5 h-5" /></span>
          <h3 class="p-modal-title">{{ contract ? 'Editar contrato' : 'Nuevo contrato' }}</h3>
        </div>

        <div class="p-field-row">
          <label class="p-field">
            <span class="stc-eyebrow">Inicio</span>
            <input v-model="form.startsAt" type="date" required class="stc-input">
          </label>
          <label class="p-field">
            <span class="stc-eyebrow">Valor de la membresía ({{ currency }})</span>
            <input v-model="form.value" type="number" min="0.01" step="0.01" inputmode="decimal" required class="stc-input" placeholder="0.00">
          </label>
        </div>

        <div class="cm-section">
          <span class="stc-eyebrow">Forma de pago</span>
          <div class="p-seg cm-mode" role="group" aria-label="Forma de pago">
            <button type="button" :class="{ on: form.mode === 'single' }" :aria-pressed="form.mode === 'single'" @click="form.mode = 'single'">Pago único</button>
            <button type="button" :class="{ on: form.mode === 'plan' }" :aria-pressed="form.mode === 'plan'" @click="form.mode = 'plan'">Plan de pagos</button>
          </div>
          <p v-if="form.mode === 'single'" class="cm-hint">
            Se espera el total el {{ form.startsAt ? formatDate(form.startsAt) : 'día de inicio' }}.
          </p>
        </div>

        <template v-if="form.mode === 'plan'">
          <!-- generator -->
          <div class="cm-gen">
            <label class="p-field">
              <span class="stc-eyebrow">Enganche</span>
              <input v-model="gen.down" type="number" min="0" step="0.01" inputmode="decimal" class="stc-input" placeholder="0.00">
            </label>
            <label class="p-field">
              <span class="stc-eyebrow">Cuotas</span>
              <input v-model.number="gen.count" type="number" min="1" max="60" step="1" class="stc-input">
            </label>
            <label class="p-field">
              <span class="stc-eyebrow">Cada (meses)</span>
              <input v-model.number="gen.every" type="number" min="1" max="12" step="1" class="stc-input">
            </label>
            <label class="p-field">
              <span class="stc-eyebrow">Primera cuota</span>
              <input v-model="gen.first" type="date" class="stc-input">
            </label>
            <button type="button" class="stc-btn gold-soft cm-gen-btn" :disabled="!(toNum(form.value) > 0)" :title="toNum(form.value) > 0 ? '' : 'Pon primero el valor'" @click="generate">
              <UIcon name="i-lucide-wand-sparkles" class="w-4 h-4" /> Generar
            </button>
          </div>

          <!-- rows -->
          <div class="cm-rows">
            <div v-for="(r, i) in form.rows" :key="r.key" class="cm-row">
              <span class="cm-n stc-mono">{{ i + 1 }}</span>
              <input v-model="r.dueAt" type="date" required class="stc-input" :aria-label="`Fecha de la cuota ${i + 1}`">
              <input v-model="r.amount" type="number" min="0.01" step="0.01" inputmode="decimal" required class="stc-input" placeholder="0.00" :aria-label="`Monto de la cuota ${i + 1}`">
              <button type="button" class="p-rbtn danger" style="width:32px; height:32px" title="Quitar cuota" @click="form.rows.splice(i, 1)">
                <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
              </button>
            </div>
            <div v-if="!form.rows.length" class="cm-hint" style="margin:0">
              Usa <b>Generar</b> o agrega las cuotas una por una (por ejemplo: 1,000 hoy, 2,000 en dos meses, 2,000 en tres).
            </div>
          </div>
          <div class="cm-sum">
            <button type="button" class="stc-btn sm" @click="addRow"><UIcon name="i-lucide-plus" class="w-3.5 h-3.5" /> Agregar cuota</button>
            <span class="stc-mono" :class="{ bad: form.rows.length && planDiff !== 0 }">
              Suma {{ formatMoney(planSum) }} de {{ formatMoney(toNum(form.value)) }}
              <template v-if="form.rows.length && planDiff > 0"> · faltan {{ formatMoney(planDiff) }}</template>
              <template v-else-if="form.rows.length && planDiff < 0"> · sobran {{ formatMoney(-planDiff) }}</template>
            </span>
          </div>
        </template>

        <label class="p-field" style="margin-top:16px">
          <span class="stc-eyebrow">Nota</span>
          <input v-model="form.note" type="text" maxlength="500" class="stc-input" placeholder="Plan anual, descuento, acuerdos…">
        </label>

        <div v-if="!contract && unassigned.length" class="cm-section">
          <span class="stc-eyebrow">Pagos ya registrados para este contrato</span>
          <label v-for="p in unassigned" :key="p._id" class="p-check" style="margin-top:8px">
            <input v-model="form.assign" type="checkbox" :value="p._id">
            <span class="stc-mono" style="color:var(--text)">{{ formatMoney(p.amount) }}</span>
            <span class="stc-mono">· {{ formatDate(p.paidAt) }}</span>
          </label>
        </div>

        <div v-if="error" class="p-modal-err"><UIcon name="i-lucide-circle-alert" class="w-4 h-4" /> {{ error }}</div>

        <div class="p-modal-foot">
          <button type="button" class="stc-btn" :disabled="busy" @click="emit('close')">Cancelar</button>
          <button type="submit" class="stc-btn gold" :disabled="busy || !canSave">
            <UIcon :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-save'" class="w-4 h-4" :class="{ 'p-spin': busy }" />
            {{ busy ? 'Guardando…' : contract ? 'Guardar cambios' : 'Crear contrato' }}
          </button>
        </div>
      </form>
    </template>
  </UModal>
</template>

<style scoped>
.cm { max-height: calc(100dvh - 2rem); overflow-y: auto; }
.cm-section { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
.cm-mode { align-self: flex-start; }
.cm-hint { font-size: 12.5px; color: var(--dim); margin: 2px 0 0; }
.cm-hint b { color: var(--text); font-weight: 600; }

.cm-gen {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) auto; gap: 10px; align-items: end;
  margin-top: 14px; padding: 12px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--inset);
}
.cm-gen-btn { height: 40px; }

.cm-rows { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.cm-row { display: grid; grid-template-columns: 22px minmax(0, 1fr) minmax(0, 1fr) 32px; gap: 8px; align-items: center; }
.cm-n { font-size: 11px; color: var(--faint); text-align: right; }

.cm-sum { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 10px; font-size: 12px; color: var(--dim); }
.cm-sum .bad { color: var(--red); }

@media (max-width: 640px) {
  .cm-row { grid-template-columns: 14px minmax(0, 1.3fr) minmax(0, 1fr) 32px; gap: 6px; }
  .cm-row .stc-input { padding-left: 9px; padding-right: 6px; font-size: 13px; }
  .cm-gen { grid-template-columns: 1fr 1fr; }
  .cm-gen-btn { grid-column: 1 / -1; }
}
</style>
