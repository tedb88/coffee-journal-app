// BrewNext design system components (the design system's components/bundle.js),
// in TypeScript for the app. Styling lives in components.css; every value is a token.

import { useEffect, useId, type ButtonHTMLAttributes, type ChangeEventHandler, type ReactNode } from 'react'
import { formatTime } from '../domain/recipe/format.js'
import type { Recipe } from '../domain/schemas.js'

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')

/* ---------- Icon ---------- */
type Shape = string | { circle: [number, number, number] } | { rect: [number, number, number, number, number] }
const ICONS: Record<string, Shape[]> = {
  today: ['M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z', 'M16 11h1.5a2.5 2.5 0 0 1 0 5H16', 'M9 3.5c0 1 1 1.5 1 2.5M12.5 3.5c0 1 1 1.5 1 2.5'],
  beans: ['M7 4h10l1 4v12H6V8z', 'M6 8h12'],
  journal: ['M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h11'],
  map: ['M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z', 'M9 4v14M15 6v14'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z', { circle: [12, 13, 3.5] }],
  back: ['M15 5l-7 7 7 7'],
  close: ['M6 6l12 12M18 6L6 18'],
  minus: ['M6 12h12'],
  plus: ['M6 12h12M12 6v12'],
  photos: [{ rect: [4, 5, 16, 14, 2] }, 'M4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 18', { circle: [15.5, 9.5, 1.5] }],
  keyboard: [{ rect: [3, 6, 18, 12, 2] }, 'M7 10h1M11 10h1M15 10h1M8 14h8'],
  awake: [{ circle: [12, 12, 4] }, 'M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  'arrow-down': ['M12 4v16M7 15l5 5 5-5'],
  // The Next handle (BRD D1): a coffee cup whose handle is a forward arrow.
  mark: ['M3.2 7.8h12.4v2.6a6.2 6.2 0 0 1-12.4 0z', 'M18.4 7.5l3 3.4-3 3.4'],
}
export type IconName = keyof typeof ICONS
const HEAVY = new Set(['back', 'close', 'awake', 'mark'])
const HEAVIEST = new Set(['minus', 'plus', 'arrow-down'])

export function Icon({ name, size = 22, strokeWidth, label }: { name: IconName; size?: number; strokeWidth?: number; label?: string }) {
  const stroke = strokeWidth ?? (HEAVIEST.has(name) ? 2 : HEAVY.has(name) ? 1.8 : 1.6)
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const }
  return (
    <svg
      className="bm-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
    >
      {ICONS[name].map((s, i) =>
        typeof s === 'string' ? (
          <path key={i} d={s} />
        ) : 'circle' in s ? (
          <circle key={i} cx={s.circle[0]} cy={s.circle[1]} r={s.circle[2]} />
        ) : (
          <rect key={i} x={s.rect[0]} y={s.rect[1]} width={s.rect[2]} height={s.rect[3]} rx={s.rect[4]} />
        ),
      )}
    </svg>
  )
}

/* ---------- Button ---------- */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'text'
  size?: 'lg' | 'md'
  icon?: IconName
  full?: boolean
}
export function Button({ variant = 'primary', size, icon, full, className, children, type = 'button', ...rest }: ButtonProps) {
  const sz = size ?? (variant === 'primary' ? 'lg' : 'md')
  return (
    <button type={type} className={cx('bm-btn', `bm-btn-${variant}`, `bm-btn-${sz}`, full && 'bm-btn-full', className)} {...rest}>
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  )
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; variant?: 'outline' | 'ghost'; size?: number }) {
  return (
    <button type="button" className={cx('bm-iconbtn', `bm-iconbtn-${variant}`)} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size ?? (variant === 'outline' ? 18 : 22)} />
    </button>
  )
}

/* ---------- FigureStrip ---------- */
export interface Figure {
  label: string
  value: ReactNode
  unit?: string
  note?: string
  changed?: boolean
  span?: number
}
export function FigureStrip({ items, columns, bare }: { items: Figure[]; columns?: number; bare?: boolean }) {
  return (
    <div className={cx('bm-figs', bare && 'bm-figs-bare')} style={{ gridTemplateColumns: `repeat(${columns ?? items.length}, minmax(0, 1fr))` }}>
      {items.map((f) => (
        <div key={f.label} className={cx('bm-fig', f.changed && 'bm-fig-changed')} style={f.span ? { gridColumn: `span ${f.span}` } : undefined}>
          <span className="bm-fig-label">{f.label}</span>
          <span className="bm-fig-value">
            {f.value}
            {/* A value that does not fit wraps inside its column rather than spilling out; the no-break space keeps "255 g" together. */}
            {f.unit ? <span className="bm-fig-unit">{`\u00a0${f.unit}`}</span> : null}
          </span>
          {f.note ? <span className="bm-fig-note">{f.note}</span> : null}
        </div>
      ))}
    </div>
  )
}

/* ---------- Field ---------- */
interface FieldProps {
  label: string
  value: string
  onChange: ChangeEventHandler<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  type?: string
  inputMode?: 'text' | 'numeric' | 'decimal'
  placeholder?: string
  options?: Array<{ value: string; label: string }>
  multiline?: boolean
  /** Why the value needs checking: shows the Check tag, a notice border and this help line (CAP-04). */
  flag?: string | null
  help?: string
  max?: string
  maxLength?: number
  className?: string
  /** Show the flag's reason under the field (default), or leave it to the screen. */
  flagHelp?: boolean
}
export function Field({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
  placeholder,
  options,
  multiline,
  flag,
  help,
  max,
  maxLength,
  className,
  flagHelp = true,
}: FieldProps) {
  const id = useId()
  const helpId = `${id}-help`
  const common = {
    id,
    className: cx('bm-input', flag && 'bm-input-flagged'),
    value,
    onChange,
    placeholder,
    'aria-describedby': (flag && flagHelp) || help ? helpId : undefined,
  }
  const control = options ? (
    <select {...common}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ) : multiline ? (
    <textarea {...common} maxLength={maxLength} rows={3} />
  ) : (
    <input {...common} type={type} inputMode={inputMode} max={max} maxLength={maxLength} />
  )
  return (
    <div className={cx('bm-field', className)}>
      <label className="bm-field-label" htmlFor={id}>
        {label}
        {flag ? <Tag tone="notice">Check</Tag> : null}
      </label>
      {control}
      {flag && flagHelp ? (
        <p className="bm-field-help" id={helpId}>
          {flag}
        </p>
      ) : help ? (
        <p className="meta" id={helpId}>
          {help}
        </p>
      ) : null}
    </div>
  )
}

/* ---------- Chip, Tag, StatusDot ---------- */
export function Chip({ children, selected, onClick, onRemove }: { children: string; selected?: boolean; onClick?: () => void; onRemove?: () => void }) {
  if (onRemove)
    return (
      <span className="bm-chip bm-chip-removable">
        {children}
        <button type="button" className="bm-chip-x" onClick={onRemove} aria-label={`Remove ${children}`}>
          <Icon name="close" size={14} strokeWidth={2} />
        </button>
      </span>
    )
  return (
    <button type="button" className="bm-chip" aria-pressed={selected ? 'true' : 'false'} onClick={onClick}>
      {children}
    </button>
  )
}

export function Tag({ tone = 'neutral', children }: { tone?: 'neutral' | 'ink' | 'notice'; children: ReactNode }) {
  return <span className={cx('bm-tag', `bm-tag-${tone}`)}>{children}</span>
}

export function StatusDot({ tone = 'neutral', children }: { tone?: 'positive' | 'notice' | 'negative' | 'neutral'; children: ReactNode }) {
  return (
    <span className={cx('bm-status', `bm-status-${tone}`)}>
      <span className="bm-status-dot" aria-hidden="true" />
      {children}
    </span>
  )
}

/* ---------- Scale (LOG-02) ---------- */
export function Scale({
  kind = 'rating',
  legend,
  value,
  valueLabel,
  onChange,
  ends,
  optionLabels,
}: {
  kind?: 'rating' | 'balance'
  legend: string
  /** Selected option 0–4, or null. */
  value: number | null
  valueLabel?: string
  onChange: (index: number) => void
  ends: string[]
  optionLabels: string[]
}) {
  return (
    <fieldset className="bm-scale">
      <legend className="bm-scale-legend">
        {legend}
        {valueLabel ? <span className="bm-scale-value"> {valueLabel}</span> : null}
      </legend>
      <div className="bm-scale-opts">
        {[0, 1, 2, 3, 4].map((i) => {
          const on = value === i
          const dot = on ? 16 : 6 + Math.abs(i - 2) * 3
          return (
            <button
              key={i}
              type="button"
              className={cx('bm-opt', kind === 'rating' && 'bm-opt-rating')}
              aria-pressed={on ? 'true' : 'false'}
              aria-label={optionLabels[i]}
              onClick={() => onChange(i)}
            >
              {kind === 'rating' ? String(i + 1) : <span className="bm-opt-dot" style={{ width: dot, height: dot }} />}
            </button>
          )
        })}
      </div>
      <div className="bm-scale-ends" aria-hidden="true">
        {ends.map((e) => (
          <span key={e}>{e}</span>
        ))}
      </div>
    </fieldset>
  )
}

/* ---------- BagThumb and photos ---------- */
export type BagTone = 'sage' | 'rose' | 'slate'
const BAG_SIZES = { sm: [32, 40], md: [44, 56], lg: [52, 66] } as const

/** One tone per bag, kept for its life (identity, not data). */
export function bagTone(id: string): BagTone {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return (['sage', 'rose', 'slate'] as const)[h % 3]
}

export function BagThumb({ tone = 'sage', size = 'md', initial }: { tone?: BagTone; size?: keyof typeof BAG_SIZES; initial?: string }) {
  const [w, h] = BAG_SIZES[size]
  return (
    <svg className={cx('bm-bag', `bm-bag-${tone}`)} width={w} height={h} viewBox="0 0 44 56" aria-hidden="true">
      <path className="bm-bag-body" d="M4 7h36v47a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path className="bm-bag-crimp" d="M3 2h38v6H3z" />
      <rect className="bm-bag-label" x="9" y="22" width="26" height="18" rx="2" />
      {initial ? (
        <text className="bm-bag-initial" x="22" y="35" textAnchor="middle">
          {initial}
        </text>
      ) : null}
      <circle className="bm-bag-crimp" cx="34" cy="14" r="2.5" />
    </svg>
  )
}

/** The user's photo of the bag where there is one, else the bag drawing. */
export function BagImage({
  photoUrl,
  tone,
  size = 'md',
  initial,
  alt,
}: {
  photoUrl: string | null
  tone: BagTone
  size?: keyof typeof BAG_SIZES
  initial?: string
  alt?: string
}) {
  const [w, h] = BAG_SIZES[size]
  if (photoUrl) return <img className="bm-photo" src={photoUrl} width={w} height={h} alt={alt ?? ''} style={{ width: w, height: h }} />
  return <BagThumb tone={tone} size={size} initial={initial} />
}

/* ---------- BeanRow ---------- */
export function BeanRow({
  name,
  meta,
  status,
  amount,
  amountNote,
  tone,
  href,
}: {
  name: string
  meta?: string
  status?: { tone: 'positive' | 'notice' | 'neutral'; text: string } | null
  amount: ReactNode
  amountNote?: string
  tone: BagTone
  href: string
}) {
  return (
    <a className="bm-row" href={href}>
      <BagThumb tone={tone} size="sm" />
      <span className="bm-row-main">
        <span className="bm-row-name">{name}</span>
        {meta ? <span className="bm-row-meta">{meta}</span> : null}
        {status ? <StatusDot tone={status.tone}>{status.text}</StatusDot> : null}
      </span>
      <span className="bm-row-end">
        <span className="bm-row-amount">{amount}</span>
        {amountNote ? <span className="bm-row-note">{amountNote}</span> : null}
      </span>
    </a>
  )
}

/* ---------- AdviceCard (DIAL-01) ---------- */
export function AdviceCard({
  heading = 'Next time',
  title,
  detail,
  why,
  then,
  children,
}: {
  heading?: string
  title: string
  detail?: string
  why?: string
  then?: string
  children?: ReactNode
}) {
  return (
    <section className="bm-card bm-advice" aria-live="polite">
      <h2 className="bm-advice-heading">{heading}</h2>
      <p className="bm-advice-title">{title}</p>
      {detail ? <p className="bm-advice-detail">{detail}</p> : null}
      {why ? <p className="bm-advice-why">{why}</p> : null}
      {then ? <p className="bm-advice-then">{then}</p> : null}
      {children}
    </section>
  )
}

/* ---------- PourChart: the pour plan from the engine's steps ---------- */
function curvePoints(recipe: Recipe): Array<[number, number]> {
  const pts: Array<[number, number]> = [[0, 0]]
  let water = 0
  for (const s of recipe.steps) {
    if (s.amountG <= 0) continue
    pts.push([s.startS, water], [s.pourEndS, s.targetG])
    water = s.targetG
  }
  pts.push([recipe.totalTimeS, recipe.waterG])
  return pts
}

export function PourChart({ recipe, now, width = 318, mode = 'plan' }: { recipe: Recipe; now?: number; width?: number; mode?: 'plan' | 'brew' }) {
  const brew = mode === 'brew'
  const H = brew ? 112 : 156
  const X0 = brew ? 8 : 32
  const X1 = width - 8
  const YT = brew ? 10 : 18
  const YB = brew ? 96 : 128
  const total = recipe.totalTimeS
  const yMax = Math.ceil((recipe.waterG + 1) / 150) * 150
  const sx = (t: number) => +(X0 + (t / total) * (X1 - X0)).toFixed(1)
  const sy = (g: number) => +(YB - (g / yMax) * (YB - YT)).toFixed(1)
  const pts = curvePoints(recipe)
  const path = (list: Array<[number, number]>) => list.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0])} ${sy(p[1])}`).join(' ')
  const pours = recipe.steps.filter((s) => s.amountG > 0)
  const label = `Water poured over time: ${pours.map((s) => s.targetG).join(', ')} grams, finishing at ${formatTime(total)}`

  if (brew && now !== undefined) {
    const t = Math.max(0, Math.min(total, now))
    let g = recipe.waterG
    for (let j = 1; j < pts.length; j++)
      if (t <= pts[j][0]) {
        const [a, b] = [pts[j - 1], pts[j]]
        g = b[0] === a[0] ? b[1] : a[1] + ((t - a[0]) / (b[0] - a[0])) * (b[1] - a[1])
        break
      }
    const before: Array<[number, number]> = [...pts.filter((p) => p[0] < t), [t, g]]
    const after: Array<[number, number]> = [[t, g], ...pts.filter((p) => p[0] > t)]
    return (
      <svg className="bm-curve" width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Pour plan with your progress marked">
        <line className="bm-curve-base" x1={X0} x2={X1} y1={YB} y2={YB} />
        <path className="bm-curve-line" d={path(before)} style={{ strokeWidth: 2.5 }} />
        {after.length > 1 ? <path className="bm-curve-todo" d={path(after)} /> : null}
        <line className="bm-curve-now" x1={sx(t)} x2={sx(t)} y1={8} y2={YB} />
        <circle className="bm-curve-dot" cx={sx(t)} cy={sy(g)} r={4} />
        <text className="bm-curve-tick" x={X0} y={H - 2}>
          0:00
        </text>
        <text className="bm-curve-tick" x={X1} y={H - 2} textAnchor="end">
          {formatTime(total)}
        </text>
      </svg>
    )
  }

  const step = yMax / 3
  const minutes = Array.from({ length: Math.floor(total / 60) }, (_, i) => (i + 1) * 60).filter((m) => sx(m) < X1 - 14)
  return (
    <svg className="bm-curve" width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={label}>
      {[0, 1, 2, 3].map((i) => (
        <line key={i} className={i === 0 ? 'bm-curve-base' : 'bm-curve-grid'} x1={X0} x2={X1} y1={sy(step * i)} y2={sy(step * i)} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <text key={i} className="bm-curve-tick" x={X0 - 6} y={sy(step * i) + 4} textAnchor="end">
          {Math.round(step * i)}
        </text>
      ))}
      <path className="bm-curve-line" d={path(pts)} />
      {pours.map((s, i) => {
        const end = recipe.steps[recipe.steps.indexOf(s) + 1]?.startS ?? total
        return (
          <text key={i} className="bm-curve-value" x={sx((s.pourEndS + end) / 2)} y={sy(s.targetG) - 6} textAnchor="middle">
            {s.targetG}
          </text>
        )
      })}
      <text className="bm-curve-tick" x={X0 + 2} y={H - 6}>
        0:00
      </text>
      {minutes.map((m) => (
        <text key={m} className="bm-curve-tick" x={sx(m)} y={H - 6} textAnchor="middle">
          {formatTime(m)}
        </text>
      ))}
    </svg>
  )
}

/* ---------- FreshnessTrack (BEAN-04) ---------- */
export function FreshnessTrack({
  day,
  roasted,
  restDays,
  bestDays,
  width = 350,
}: {
  day: number
  roasted: string
  restDays: number
  bestDays: number
  width?: number
}) {
  const span = Math.max(bestDays + 15, day + 5)
  const W = width
  const px = (d: number) => +((d / span) * W).toFixed(1)
  const d = Math.max(0, Math.min(span, day))
  const todayX = Math.max(18, Math.min(W - 18, px(d)))
  return (
    <svg
      className="bm-fresh"
      width={W}
      height={58}
      viewBox={`0 0 ${W} 58`}
      role="img"
      aria-label={`Roasted ${roasted}. Resting until day ${restDays}, best until day ${bestDays}, past its best after. Today is day ${day}.`}
    >
      <rect className="bm-fresh-rest" x={0} y={22} width={Math.max(0, px(restDays) - 2)} height={10} rx={5} />
      <rect className="bm-fresh-best" x={px(restDays)} y={22} width={Math.max(0, px(bestDays) - px(restDays) - 2)} height={10} rx={5} />
      <rect className="bm-fresh-fade" x={px(bestDays)} y={22} width={Math.max(0, W - px(bestDays))} height={10} rx={5} />
      <line className="bm-fresh-today" x1={px(d)} x2={px(d)} y1={14} y2={38} />
      <text className="bm-fresh-today-label" x={todayX} y={10} textAnchor="middle">
        Today
      </text>
      <text className="bm-fresh-label" x={0} y={52}>
        Roasted {roasted}
      </text>
      <text className="bm-fresh-best-label" x={(px(restDays) + px(bestDays)) / 2} y={52} textAnchor="middle">
        Best
      </text>
      <text className="bm-fresh-label" x={W} y={52} textAnchor="end">
        Fading
      </text>
    </svg>
  )
}

/* ---------- BottomNav ---------- */
export const NAV_ITEMS = [
  { id: 'today', label: 'Today', icon: 'today', href: '#/' },
  { id: 'beans', label: 'Beans', icon: 'beans', href: '#/beans' },
  { id: 'journal', label: 'Journal', icon: 'journal', href: '#/journal' },
  { id: 'map', label: 'Map', icon: 'map', href: '#/map' },
] as const

export function BottomNav({ active }: { active: string }) {
  return (
    <nav className="bm-nav" aria-label="Main" style={{ gridTemplateColumns: `repeat(${NAV_ITEMS.length}, minmax(0, 1fr))` }}>
      {NAV_ITEMS.map((it) => (
        <a key={it.id} className="bm-nav-item" href={it.href} aria-current={it.id === active ? 'page' : undefined}>
          <Icon name={it.icon} />
          {it.label}
        </a>
      ))}
    </nav>
  )
}

/* ---------- Toast with Undo (LOG-05: undo for at least 10 s) ---------- */
export const UNDO_MS = 10_000
const NOTE_MS = 4_000
export function Toast({ message, actionLabel, onAction, onDone }: { message: string; actionLabel?: string; onAction?: () => void; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, actionLabel ? UNDO_MS : NOTE_MS)
    return () => clearTimeout(t)
  }, [onDone, actionLabel])
  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {actionLabel ? (
        <button type="button" className="bm-btn bm-btn-text bm-btn-md" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p className="heading">{label}</p>
    </div>
  )
}

/** A grey em dash for a missing value; a real zero prints as 0. */
export function Value({ v }: { v: ReactNode }) {
  return v === null || v === undefined || v === '' ? <span className="dash">—</span> : <>{v}</>
}
