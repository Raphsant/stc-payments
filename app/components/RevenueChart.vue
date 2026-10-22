<script setup lang="ts">
// Single-series bar chart of revenue per bucket. Plain SVG, sized to its
// container; each bar is its own hover/focus target with a tooltip.
export interface RevenueBucket {
  key: string
  label: string      // short x-axis label
  title: string      // full period, for the tooltip
  total: number
  count: number
}

const props = defineProps<{ buckets: RevenueBucket[]; dimmed?: boolean }>()
const { formatMoney } = useMemberFormat()

const el = ref<HTMLElement | null>(null)
const width = ref(800)

let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(([e]) => { width.value = Math.max(160, Math.floor(e!.contentRect.width)) })
  ro.observe(el.value!)
})
onBeforeUnmount(() => ro?.disconnect())

// Shorter on phones so the chart doesn't take the whole screen.
const HEIGHT = computed(() => (width.value < 480 ? 220 : 280))

// 1/2/2.5/5 × 10^n step so there are about 4 gridlines.
const ticks = computed(() => {
  const max = Math.max(0, ...props.buckets.map(b => b.total))
  if (!max) return [0, 1]
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw)!
  const out = []
  for (let v = 0; v < max + step; v += step) out.push(v)
  return out
})
const yMax = computed(() => ticks.value[ticks.value.length - 1]!)

// Left gutter fits the widest y label (11px digits ≈ 6.6px each).
const PAD = computed(() => ({
  top: 12, right: 4, bottom: 28,
  left: 12 + Math.ceil(Math.max(...ticks.value.map(t => formatMoney(t, true).length)) * 6.6),
}))
const plotW = computed(() => width.value - PAD.value.left - PAD.value.right)
const plotH = computed(() => HEIGHT.value - PAD.value.top - PAD.value.bottom)
const y = (v: number) => PAD.value.top + plotH.value - (v / yMax.value) * plotH.value

const slot = computed(() => plotW.value / Math.max(1, props.buckets.length))
const gap = computed(() => (slot.value > 6 ? 2 : slot.value > 3 ? 1 : 0))
const barW = computed(() => Math.max(1, Math.min(56, slot.value - gap.value)))
const barX = (i: number) => PAD.value.left + i * slot.value + (slot.value - barW.value) / 2

// Rounded top (4px), square at the baseline.
function barPath(i: number, v: number) {
  const x = barX(i), w = barW.value, top = y(v), base = y(0)
  const r = Math.min(4, w / 2, base - top)
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`
}

// Thin x labels so they never collide (~64px each).
const labelEvery = computed(() => Math.max(1, Math.ceil(64 / slot.value)))

const hover = ref<number | null>(null)
const tip = computed(() => {
  if (hover.value === null) return null
  const b = props.buckets[hover.value]
  if (!b) return null
  const cx = barX(hover.value) + barW.value / 2
  // keep the tooltip inside the chart; it's at most 220px wide
  const half = Math.min(110, width.value / 2)
  // ~52px tall, drawn above its anchor: never anchor it higher than that, or the panel clips it
  return { b, left: Math.min(Math.max(cx, half), width.value - half), top: Math.max(y(b.total), 60) }
})
</script>

<template>
  <div ref="el" class="rc" :class="{ dimmed }" @mouseleave="hover = null">
    <svg :width="width" :height="HEIGHT" role="img" aria-label="Ingresos por periodo">
      <g class="rc-grid">
        <template v-for="t in ticks" :key="t">
          <line :x1="PAD.left" :x2="width - PAD.right" :y1="y(t)" :y2="y(t)" :class="{ base: t === 0 }" />
          <text :x="PAD.left - 10" :y="y(t)" dy="0.32em" text-anchor="end">{{ formatMoney(t, true) }}</text>
        </template>
      </g>

      <g>
        <template v-for="(b, i) in buckets" :key="b.key">
          <path v-if="b.total > 0" :d="barPath(i, b.total)" class="rc-bar" :class="{ on: hover === i }" />
          <!-- full-height hit target, bigger than the bar -->
          <rect
            :x="PAD.left + i * slot" :y="PAD.top" :width="slot" :height="plotH"
            class="rc-hit" tabindex="0" :aria-label="`${b.title}: ${formatMoney(b.total)}`"
            @mouseenter="hover = i" @focus="hover = i" @blur="hover = null"
          />
        </template>
      </g>

      <g class="rc-x">
        <template v-for="(b, i) in buckets" :key="b.key">
          <text v-if="i % labelEvery === 0" :x="barX(i) + barW / 2" :y="HEIGHT - 8" text-anchor="middle">{{ b.label }}</text>
        </template>
      </g>
    </svg>

    <div v-if="tip" class="rc-tip" :style="{ left: `${tip.left}px`, top: `${tip.top}px` }">
      <div class="rc-tip-val">{{ formatMoney(tip.b.total) }}</div>
      <div class="rc-tip-lbl">{{ tip.b.title }} · {{ tip.b.count }} {{ tip.b.count === 1 ? 'pago' : 'pagos' }}</div>
    </div>
  </div>
</template>

<style scoped>
.rc { position: relative; width: 100%; transition: opacity .15s; }
.rc.dimmed { opacity: .5; }
.rc svg { display: block; overflow: visible; }

.rc-grid line { stroke: var(--line); stroke-width: 1; }
.rc-grid line.base { stroke: var(--line-2); }
.rc-grid text, .rc-x text { font-family: var(--mono); font-size: 11px; fill: var(--faint); }

.rc-bar { fill: var(--gold); transition: fill .12s; }
.rc-bar.on { fill: var(--gold-soft); }
.rc-hit { fill: transparent; outline: none; cursor: default; }

.rc-tip {
  position: absolute; transform: translate(-50%, calc(-100% - 10px)); pointer-events: none;
  background: var(--panel-2); border: 1px solid var(--line-2); border-radius: var(--r-sm);
  padding: 8px 11px; width: max-content; max-width: min(220px, 100%); box-shadow: 0 6px 20px rgba(0,0,0,.35);
}
.rc-tip-val { font-family: var(--mono); font-size: 14px; font-weight: 600; color: var(--text); }
.rc-tip-lbl { font-size: 11.5px; color: var(--dim); margin-top: 2px; }
</style>
