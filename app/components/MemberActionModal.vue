<script setup lang="ts">
// One modal for every action that touches the Discord role. Each one goes
// through stcbot, so the copy says so — the admin should know Discord changes
// the moment they confirm.

const props = defineProps<{
  action: 'promote' | 'pause' | 'resume' | 'remove' | null
  member: { _id: string; username: string; expiresAt?: string | null } | null
}>()
const emit = defineEmits<{ close: []; done: [membership: any] }>()

const toast = useToast()
const { formatDate } = useMemberFormat()

const open = computed({
  get: () => !!props.action && !!props.member,
  set: (v) => { if (!v && !busy.value) emit('close') },
})

const busy = ref(false)
const error = ref('')
const months = ref(1)
const reason = ref('')
const extendExpiry = ref(true)
const purchasedAt = ref('')
const expiresAt = ref('')

watch(() => [props.action, props.member?._id], () => {
  error.value = ''
  months.value = 1
  reason.value = ''
  extendExpiry.value = true
  purchasedAt.value = new Date().toISOString().slice(0, 10)
  expiresAt.value = ''
})

function plusMonths(base: string, n: number) {
  const d = new Date(base || Date.now())
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

const resumesOn = computed(() => plusMonths(new Date().toISOString().slice(0, 10), months.value || 0))

const CONFIG = {
  promote: { title: 'Promover a Alpha', icon: 'i-lucide-crown',        glyph: '',     btn: 'gold',   label: 'Dar rol Alpha',  busyLabel: 'Promoviendo…' },
  pause:   { title: 'Pausar membresía', icon: 'i-lucide-circle-pause', glyph: 'blue', btn: 'gold-soft', label: 'Pausar',     busyLabel: 'Pausando…' },
  resume:  { title: 'Reanudar',         icon: 'i-lucide-circle-play',  glyph: '',     btn: 'gold',   label: 'Reanudar',      busyLabel: 'Reanudando…' },
  remove:  { title: 'Quitar Alpha',     icon: 'i-lucide-user-minus',   glyph: 'red',  btn: 'danger', label: 'Quitar rol',    busyLabel: 'Quitando…' },
} as const

const cfg = computed(() => CONFIG[props.action ?? 'promote'])

async function confirm() {
  if (!props.member || !props.action || busy.value) return
  busy.value = true
  error.value = ''
  const id = props.member._id
  try {
    let body: Record<string, any> = {}
    if (props.action === 'promote') body = { purchasedAt: purchasedAt.value || null, expiresAt: expiresAt.value || null }
    if (props.action === 'pause')   body = { months: Number(months.value), reason: reason.value, extendExpiry: extendExpiry.value }
    if (props.action === 'remove')  body = { reason: reason.value }

    const path = props.action === 'remove' ? 'remove-alpha' : props.action
    const membership = await $fetch(`/api/members/${id}/${path}`, { method: 'POST', body })

    const done = {
      promote: `${props.member.username} ahora es Alpha.`,
      pause:   `Membresía de ${props.member.username} pausada ${months.value} mes(es).`,
      resume:  `${props.member.username} recuperó el rol Alpha.`,
      remove:  `Rol Alpha removido de ${props.member.username}.`,
    }[props.action]
    toast.add({ title: done, color: 'success' })
    emit('done', membership)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Algo salió mal'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :dismissible="!busy">
    <template #content>
      <form v-if="member && action" class="p-modal" @submit.prevent="confirm">
        <div class="p-modal-head">
          <span class="p-modal-glyph" :class="cfg.glyph">
            <UIcon :name="cfg.icon" class="w-5 h-5" />
          </span>
          <h3 class="p-modal-title">{{ cfg.title }}</h3>
        </div>

        <!-- Promote -->
        <template v-if="action === 'promote'">
          <p class="p-modal-p">
            El bot le dará el rol <b>Alpha</b> a <b>{{ member.username }}</b> en Discord.
            Puedes registrar las fechas ahora o después en su ficha.
          </p>
          <div class="p-field-row" style="margin-top:18px">
            <label class="p-field">
              <span class="stc-eyebrow">Fecha de compra</span>
              <input v-model="purchasedAt" type="date" class="stc-input">
            </label>
            <label class="p-field">
              <span class="stc-eyebrow">Vence</span>
              <input v-model="expiresAt" type="date" class="stc-input">
            </label>
          </div>
          <div class="flex gap-2 flex-wrap" style="margin-top:10px">
            <button
              v-for="n in [1, 3, 6, 12]" :key="n" type="button" class="stc-btn sm"
              @click="expiresAt = plusMonths(purchasedAt, n)"
            >+{{ n }} {{ n === 1 ? 'mes' : 'meses' }}</button>
          </div>
        </template>

        <!-- Pause -->
        <template v-else-if="action === 'pause'">
          <p class="p-modal-p">
            El bot le quitará el rol <b>Alpha</b> a <b>{{ member.username }}</b> ahora mismo.
            No se reanuda sola: cuando termine la pausa, presiona <b>Reanudar</b> en su ficha.
          </p>
          <div class="p-field-row" style="margin-top:18px">
            <label class="p-field">
              <span class="stc-eyebrow">Meses</span>
              <input v-model.number="months" type="number" min="1" max="24" step="1" class="stc-input" required>
            </label>
            <div class="p-field">
              <span class="stc-eyebrow">Termina</span>
              <div class="stc-input stc-mono" style="color:var(--dim)">{{ formatDate(resumesOn) }}</div>
            </div>
          </div>
          <label class="p-field" style="margin-top:12px">
            <span class="stc-eyebrow">Motivo (opcional)</span>
            <input v-model="reason" type="text" class="stc-input" maxlength="400" placeholder="Viaje, problema de pago…">
          </label>
          <label v-if="member.expiresAt" class="p-check" style="margin-top:14px">
            <input v-model="extendExpiry" type="checkbox">
            Extender el vencimiento {{ months || 0 }} mes(es)
            <span class="stc-mono" style="color:var(--faint)">({{ formatDate(member.expiresAt) }} → {{ formatDate(plusMonths(member.expiresAt.slice(0, 10), months || 0)) }})</span>
          </label>
        </template>

        <!-- Resume -->
        <template v-else-if="action === 'resume'">
          <p class="p-modal-p">
            El bot le devolverá el rol <b>Alpha</b> a <b>{{ member.username }}</b> y la pausa quedará cerrada.
          </p>
        </template>

        <!-- Remove -->
        <template v-else>
          <p class="p-modal-p">
            El bot le quitará el rol <b>Alpha</b> a <b>{{ member.username }}</b> en Discord.
            Su ficha, comprobantes y contrato se conservan.
          </p>
          <label class="p-field" style="margin-top:18px">
            <span class="stc-eyebrow">Motivo (opcional)</span>
            <input v-model="reason" type="text" class="stc-input" maxlength="400" placeholder="Cancelación, reembolso…">
          </label>
        </template>

        <div v-if="error" class="p-modal-err">
          <UIcon name="i-lucide-triangle-alert" class="w-4 h-4 flex-shrink-0" />
          {{ error }}
        </div>

        <div class="p-modal-foot">
          <button type="button" class="stc-btn" :disabled="busy" @click="emit('close')">Cancelar</button>
          <button type="submit" class="stc-btn" :class="cfg.btn" :disabled="busy">
            <UIcon :name="busy ? 'i-lucide-loader-circle' : cfg.icon" class="w-3.5 h-3.5" :class="{ 'p-spin': busy }" />
            {{ busy ? cfg.busyLabel : cfg.label }}
          </button>
        </div>
      </form>
    </template>
  </UModal>
</template>
