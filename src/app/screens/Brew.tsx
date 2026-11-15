// Guided brew: "What do I pour now, to what weight, by when?" (UX design §2,
// screen 5; BRW-01 to BRW-07). Always in brew mode (dark), read at arm's length.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { getBean } from '../../data/repositories.js'
import { brewState, elapsed, jumpClock, nextMark, pauseClock, startClock, stoppedClock, type Clock } from '../../domain/brew/timeline.js'
import { formatTime } from '../../domain/recipe/format.js'
import { Icon, IconButton, PourChart } from '../../ui/components.js'
import { getDraft, setDraft } from '../flow.js'
import { go, href } from '../router.js'
import { useLoad } from '../store.js'

const CUES_KEY = 'brewmap_cues'
const now = () => performance.now()

function readCues(): boolean {
  try {
    return localStorage.getItem(CUES_KEY) !== 'off'
  } catch {
    return true
  }
}

/** BRW-02: keep the screen on while the timer runs; re-acquired when the page is shown again. */
function useWakeLock(active: boolean): boolean {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  useEffect(() => {
    if (!supported || !active) return
    let lock: { release: () => Promise<void> } | null = null
    let live = true
    const acquire = async () => {
      try {
        const l = await (navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock.request(
          'screen',
        )
        if (live) lock = l
        else void l.release()
      } catch {
        /* denied, or the page is hidden */
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      live = false
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
    }
  }, [active, supported])
  return supported
}

export function BrewScreen() {
  const draft = getDraft()
  const bean = useLoad(async () => (draft ? ((await getBean(draft.beanId)) ?? null) : null), [draft?.beanId])
  const [clock, setClock] = useState<Clock>(stoppedClock())
  const [, tick] = useReducer((n: number) => n + 1, 0)
  const [cues, setCues] = useState(readCues)
  const audio = useRef<AudioContext | null>(null)
  const lastKey = useRef<string | null>(null)
  const wakeSupported = useWakeLock(clock.running)

  const recipe = draft?.recipe ?? null
  const t = recipe ? Math.min(recipe.totalTimeS, elapsed(clock, now())) : 0
  const state = recipe ? brewState(recipe, t) : null

  useEffect(() => {
    if (!clock.running) return
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [clock.running])

  // Stop at the end; the screen then offers Taste it (BRW-07).
  useEffect(() => {
    if (recipe && clock.running && t >= recipe.totalTimeS) setClock(stoppedClock(recipe.totalTimeS))
  }, [clock.running, recipe, t])

  // BRW-03: a chime and a buzz at each step change, when cues are on.
  const cue = useCallback(() => {
    if (!cues) return
    try {
      navigator.vibrate?.(120)
    } catch {
      /* not supported (iOS) */
    }
    const ctx = audio.current
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  }, [cues])

  useEffect(() => {
    if (!state) return
    if (lastKey.current !== null && lastKey.current !== state.key && (clock.running || state.phase === 'done')) cue()
    lastKey.current = state.key
  }, [state, clock.running, cue])

  if (!draft || !recipe || !state)
    return (
      <main className="screen" data-theme="dark">
        <div className="empty">
          <h1 className="heading" tabIndex={-1}>
            No brew in progress
          </h1>
          <a className="bm-btn bm-btn-secondary bm-btn-md" href={href.today()}>
            Back to Today
          </a>
        </div>
      </main>
    )

  const done = state.phase === 'done'
  const finish = () => {
    setDraft({ ...draft, actualTimeS: Math.round(t), guided: true })
    go(href.taste(), { replace: true })
  }
  const toggle = () => {
    if (!audio.current && typeof AudioContext !== 'undefined') {
      try {
        audio.current = new AudioContext()
      } catch {
        audio.current = null
      }
    }
    void audio.current?.resume().catch(() => {})
    setClock((c) => (c.running ? pauseClock(c, now()) : startClock(c, now())))
  }
  const toggleCues = () => {
    setCues((on) => {
      try {
        localStorage.setItem(CUES_KEY, on ? 'off' : 'on')
      } catch {
        /* private mode */
      }
      return !on
    })
  }

  return (
    <main className="screen" data-theme="dark">
      <div className="brew-head">
        <IconButton
          icon="close"
          label="End brew"
          onClick={() => {
            if (t === 0 || window.confirm('End this brew? The timer stops and nothing is saved.')) go(href.recipe(draft.beanId), { replace: true })
          }}
        />
        <div className="stack" style={{ flex: 1, minWidth: 0, gap: 0 }}>
          <h1 className="heading" tabIndex={-1} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {bean.data?.name ?? 'Your brew'}
          </h1>
          <span className="meta num">
            V60 · {recipe.doseG} g · {recipe.waterG} g · {recipe.tempC} °C
          </span>
        </div>
        <div className="brew-clock">
          <span className="brew-clock-time" aria-label={`Elapsed ${formatTime(t)}`}>
            {formatTime(Math.floor(t))}
          </span>
          <span className="label">{done ? 'finished' : clock.running ? 'elapsed' : t > 0 ? 'paused' : 'ready'}</span>
        </div>
      </div>

      <section className="brew-main" aria-live="polite" aria-atomic="true">
        <div className="bm-brew">
          <span className="bm-brew-phase">{state.phaseLabel}</span>
          <div className="bm-brew-main">
            <span className="bm-brew-lead">{state.lead}</span>
            <span className="bm-brew-value">{state.big}</span>
          </div>
          <p className="bm-brew-how">{state.how}</p>
          <div className="bm-brew-track" aria-hidden="true">
            <div className="bm-brew-fill" style={{ width: `${Math.round(Math.max(0, Math.min(1, state.progress)) * 100)}%` }} />
          </div>
          <p className="bm-brew-count">{state.countdown}</p>
        </div>
      </section>

      <div className="brew-panel">
        <PourChart recipe={recipe} now={t} mode="brew" />
        <p style={{ fontSize: 15, lineHeight: '22px' }}>
          {done ? <span className="muted">Up next: </span> : null}
          {state.next}
        </p>
      </div>

      <div className="brew-controls">
        {done ? (
          <>
            <button type="button" className="brew-btn brew-btn-primary" onClick={finish}>
              Taste it
            </button>
            <button type="button" className="bm-btn bm-btn-text bm-btn-md" onClick={() => setClock(stoppedClock())}>
              Brew again from 0:00
            </button>
          </>
        ) : (
          <>
            <div className="grid-2" style={{ gap: 'var(--space-3)' }}>
              <button type="button" className={`brew-btn ${clock.running ? '' : 'brew-btn-primary'}`} onClick={toggle}>
                {clock.running ? 'Pause' : t > 0 ? 'Resume' : 'Start'}
              </button>
              <button type="button" className="brew-btn" onClick={() => setClock((c) => jumpClock(c, nextMark(recipe, t), now()))}>
                Skip step
              </button>
            </div>
            <button type="button" className="bm-btn bm-btn-text bm-btn-md" onClick={finish} disabled={t === 0}>
              End now and rate
            </button>
          </>
        )}
        <p className="brew-foot">
          <Icon name="awake" size={14} />
          {wakeSupported ? 'Screen stays on while you brew' : 'Keep your screen on: this phone cannot do it for you'}
          <span aria-hidden="true">·</span>
          <button
            type="button"
            className="bm-btn bm-btn-text"
            style={{ height: 'auto', padding: 0, fontSize: 12, color: 'inherit', textDecoration: 'underline' }}
            aria-pressed={cues}
            onClick={toggleCues}
          >
            Sound {cues ? 'on' : 'off'}
          </button>
        </p>
      </div>
    </main>
  )
}
