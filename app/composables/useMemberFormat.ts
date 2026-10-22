// Display helpers shared by the Alphas list, the Deltas list and the member page.

// Same deep, desaturated avatar tones as stc-front's user list.
const AV_COLORS: [string, string][] = [
  ['#3a2c10', '#241a08'], ['#2a2a2e', '#161618'], ['#12302a', '#0a1c18'],
  ['#331a1e', '#1e0e11'], ['#2b2a12', '#19180a'], ['#1a2438', '#0e1522'],
  ['#2e2438', '#1a1422'], ['#33280f', '#1f1808'], ['#123033', '#0a1c1e'],
]

export type ExpiryState = 'none' | 'ok' | 'soon' | 'expired'

const DAY = 86_400_000
export const SOON_DAYS = 30

export function useMemberFormat() {
  const { public: { currency } } = useRuntimeConfig()
  const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency as string })
  // "$" instead of "USD": the panel has a single currency, shown next to big figures.
  const moneyNarrow = new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency as string, currencyDisplay: 'narrowSymbol' })
  const compact = new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 })
  const symbol = moneyNarrow.formatToParts(0).find(p => p.type === 'currency')?.value ?? ''

  // short: "$80 k" for chart axes (es-MX's own compact currency format gives "80 k$").
  function formatMoney(n: number | null | undefined, short = false) {
    return short ? `${symbol}${compact.format(n ?? 0)}` : money.format(n ?? 0)
  }

  // Split for big figures, so the symbol and cents can be set smaller than the integer part.
  function moneyParts(n: number | null | undefined) {
    const out = { symbol: '', int: '', frac: '' }
    for (const p of moneyNarrow.formatToParts(n ?? 0)) {
      if (p.type === 'currency') out.symbol += p.value
      else if (p.type === 'decimal' || p.type === 'fraction') out.frac += p.value
      else if (p.type !== 'literal') out.int += p.value
    }
    return out
  }

  // Today as YYYY-MM-DD in the viewer's timezone (not UTC), for date inputs.
  function localToday() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function avatarGrad(name: string) {
    let h = 0
    for (const c of name) h = ((h * 31 + c.charCodeAt(0)) >>> 0)
    const [a, b] = AV_COLORS[h % AV_COLORS.length]!
    return `linear-gradient(150deg, ${a}, ${b})`
  }

  function initial(name: string) {
    return name.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '?'
  }

  function formatDate(d: string | Date | null | undefined) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
  }

  // For <input type="date"> — dates are stored as UTC midnight.
  function toInputDate(d: string | Date | null | undefined) {
    if (!d) return ''
    return new Date(d).toISOString().slice(0, 10)
  }

  function expiryState(expiresAt: string | Date | null | undefined): ExpiryState {
    if (!expiresAt) return 'none'
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff < 0) return 'expired'
    if (diff < SOON_DAYS * DAY) return 'soon'
    return 'ok'
  }

  function expiryBadge(expiresAt: string | Date | null | undefined): { text: string; cls: string } {
    const state = expiryState(expiresAt)
    if (state === 'none') return { text: 'Sin fecha', cls: 'none' }
    const days = Math.round((new Date(expiresAt!).getTime() - Date.now()) / DAY)
    if (state === 'expired') return { text: `Vencida hace ${Math.abs(days)}d`, cls: 'red' }
    if (state === 'soon') return { text: `Vence en ${days}d`, cls: 'alpha' }
    return { text: `${days}d restantes`, cls: 'green' }
  }

  const STATUS: Record<string, { text: string; cls: string; icon: string }> = {
    active:    { text: 'Activa',      cls: 'green',   icon: 'i-lucide-circle-check' },
    paused:    { text: 'Pausada',     cls: 'delta',   icon: 'i-lucide-circle-pause' },
    removed:   { text: 'Removida',    cls: 'red',     icon: 'i-lucide-circle-x' },
    untracked: { text: 'Sin registro', cls: 'none',   icon: 'i-lucide-circle-dashed' },
  }
  function statusBadge(status: string | null | undefined) {
    return STATUS[status ?? 'untracked'] ?? STATUS.untracked!
  }

  function visiblePages(cur: number, total: number): (number | '...')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    const out: (number | '...')[] = [1]
    if (cur > 3) out.push('...')
    for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) out.push(i)
    if (cur < total - 2) out.push('...')
    out.push(total)
    return out
  }

  return { avatarGrad, initial, formatDate, formatMoney, moneyParts, localToday, currency: currency as string, toInputDate, expiryState, expiryBadge, statusBadge, visiblePages }
}
