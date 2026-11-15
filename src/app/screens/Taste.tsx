// Taste: "How was it, and what do I change?" (UX design §2, screen 6). One
// screen in about 15 seconds (LOG-02); the Next time card follows the controls
// live (DIAL-01). Also the manual log (LOG-04) and brew editing (LOG-05).

import { useState } from 'react'
import { addBrew, getBean, getBrew, listBrewsForBean, updateBrew } from '../../data/repositories.js'
import { advise } from '../../domain/dialin/advise.js'
import { adviceHistory, nextBrew, parseClicks, toAdviceRecord } from '../../domain/dialin/next.js'
import { flavourChips } from '../../domain/lexicon.js'
import { defaultDose } from '../../domain/recipe/baseline.js'
import { baselineRecipe } from '../../domain/recipe/engine.js'
import { formatTime } from '../../domain/recipe/format.js'
import type { Bean, Brew, Recipe } from '../../domain/schemas.js'
import { parseMinutes } from '../../lib/display.js'
import { AdviceCard, Button, Chip, Field, IconButton, Scale, Spinner } from '../../ui/components.js'
import { useToast } from '../App.js'
import { getDraft, setDraft } from '../flow.js'
import { go, href } from '../router.js'
import { bump, useLoad } from '../store.js'

type Mode = 'guided' | 'manual' | 'edit'

const RATING_LABELS = ['Rate 1 of 5', 'Rate 2 of 5', 'Rate 3 of 5', 'Rate 4 of 5', 'Rate 5 of 5']
const SB_LABELS = ['Very sour', 'A bit sour', 'Balanced', 'A bit bitter', 'Very bitter']
const WS_LABELS = ['Very weak', 'A bit weak', 'Just right', 'A bit strong', 'Very strong']

interface Ctx {
  bean: Bean
  brews: Brew[]
  recipe: Recipe
  brewNumber: number
  appliedFrom: string | null
  guided: boolean
  timeS: number | null
  clicks: number | null
  editing: Brew | null
}

export function TasteScreen({ mode, beanId, brewId }: { mode: Mode; beanId?: string; brewId?: string }) {
  const loaded = useLoad(async (): Promise<Ctx | null> => {
    if (mode === 'edit') {
      const brew = await getBrew(brewId!)
      const bean = brew ? await getBean(brew.beanId) : undefined
      if (!brew || !bean) return null
      const brews = (await listBrewsForBean(bean.id)).filter((b) => b.id !== brew.id)
      const n = (await listBrewsForBean(bean.id)).findIndex((b) => b.id === brew.id) + 1
      return {
        bean,
        brews,
        recipe: brew.recipe,
        brewNumber: n,
        appliedFrom: brew.appliedFrom,
        guided: brew.guided,
        timeS: brew.actualTimeS,
        clicks: parseClicks(brew.grindSetting),
        editing: brew,
      }
    }
    const draft = getDraft()
    const id = mode === 'guided' ? draft?.beanId : beanId
    const bean = id ? await getBean(id) : undefined
    if (!bean) return null
    const brews = await listBrewsForBean(bean.id)
    if (draft && draft.beanId === bean.id && (mode === 'guided' || !draft.guided))
      return {
        bean,
        brews,
        recipe: draft.recipe,
        brewNumber: brews.length + 1,
        appliedFrom: draft.appliedFrom,
        guided: mode === 'guided',
        timeS: draft.actualTimeS,
        clicks: draft.clicks,
        editing: null,
      }
    const plan = nextBrew(brews)
    const recipe = plan.recipe ?? baselineRecipe({ bean, doseG: defaultDose(bean) })
    return {
      bean,
      brews,
      recipe,
      brewNumber: brews.length + 1,
      appliedFrom: plan.kind === 'dialin' ? (plan.from?.id ?? null) : null,
      guided: false,
      timeS: null,
      clicks: plan.clicks,
      editing: null,
    }
  }, [mode, beanId, brewId])

  if (loaded.loading && !loaded.data) return <Spinner label="Opening the brew" />
  if (!loaded.data)
    return (
      <main className="screen">
        <div className="empty">
          <h1 className="heading" tabIndex={-1}>
            Nothing to rate
          </h1>
          <a className="bm-btn bm-btn-secondary bm-btn-md" href={href.today()}>
            Back to Today
          </a>
        </div>
      </main>
    )
  return <TasteForm ctx={loaded.data} mode={mode} />
}

function TasteForm({ ctx, mode }: { ctx: Ctx; mode: Mode }) {
  const toast = useToast()
  const e = ctx.editing
  const [rating, setRating] = useState<number | null>(e?.rating ? e.rating - 1 : null)
  const [sb, setSb] = useState<number>(e?.balance ? e.balance.sourBitter + 2 : 2)
  const [ws, setWs] = useState<number>(e?.balance ? e.balance.strength + 2 : 2)
  const [touched, setTouched] = useState(!!e?.balance)
  const [descriptors, setDescriptors] = useState<string[]>(e?.descriptors ?? [])
  const [grind, setGrind] = useState(e?.grindSetting ?? (ctx.clicks !== null ? String(ctx.clicks) : ''))
  const [notes, setNotes] = useState(e?.notes ?? '')
  const [time, setTime] = useState(formatTime(ctx.timeS ?? ctx.recipe.totalTimeS))
  const [saving, setSaving] = useState(false)

  const balance = { sourBitter: sb - 2, strength: ws - 2 }
  const clicks = parseClicks(grind)
  const rated = rating !== null || touched
  const advice = advise({ rating: rating === null ? null : rating + 1, balance, recipe: ctx.recipe, clicks, history: adviceHistory(ctx.brews) })
  const chips = flavourChips(ctx.bean.labelNotes, 12)
  const timeS = mode === 'guided' ? ctx.timeS : parseMinutes(time)

  async function save(skip = false) {
    setSaving(true)
    const fields = {
      rating: skip || rating === null ? null : rating + 1,
      balance: skip || !rated ? null : balance,
      descriptors: skip ? [] : descriptors,
      notes: skip ? '' : notes.trim().slice(0, 2000),
      grindSetting: grind.trim() ? grind.trim().slice(0, 40) : null,
      actualTimeS: timeS,
      advice: skip || !rated ? null : toAdviceRecord(advice, clicks),
    }
    try {
      if (e) {
        await updateBrew(e.id, fields)
        toast('Brew updated')
      } else {
        await addBrew({ beanId: ctx.bean.id, recipe: ctx.recipe, guided: ctx.guided, appliedFrom: ctx.appliedFrom, ...fields })
        setDraft(null)
        toast(skip ? 'Brew saved without a rating' : 'Brew saved')
      }
      bump()
      go(href.bean(ctx.bean.id), { replace: true })
    } catch (err) {
      setSaving(false)
      toast((err as Error).name === 'StorageFullError' ? (err as Error).message : 'This brew could not be saved. Try again.')
    }
  }

  return (
    <main className="screen">
      <div className="topbar" style={{ paddingLeft: 'var(--space-5)' }}>
        <span className="topbar-title num">
          {ctx.bean.name} · brew {ctx.brewNumber}
          {timeS !== null ? ` · ${formatTime(timeS)}` : ''}
        </span>
        {e ? (
          <IconButton icon="close" label="Cancel editing" onClick={() => go(href.bean(ctx.bean.id))} />
        ) : mode === 'guided' ? (
          <IconButton icon="close" label="Skip rating" onClick={() => save(true)} disabled={saving} />
        ) : (
          <IconButton icon="close" label="Cancel" onClick={() => go(href.bean(ctx.bean.id))} />
        )}
      </div>
      <div className="screen-scroll" style={{ gap: 22 }}>
        <h1 className="title" tabIndex={-1}>
          {e ? 'Edit this brew' : 'How did it taste?'}
        </h1>
        <Scale legend="Overall" value={rating} onChange={setRating} ends={['Not for me', 'Excellent']} optionLabels={RATING_LABELS} />
        <Scale
          kind="balance"
          legend="Sour or bitter?"
          valueLabel={SB_LABELS[sb]}
          value={sb}
          onChange={(i) => {
            setSb(i)
            setTouched(true)
          }}
          ends={['Sour', 'Balanced', 'Bitter']}
          optionLabels={SB_LABELS}
        />
        <Scale
          kind="balance"
          legend="Weak or strong?"
          valueLabel={WS_LABELS[ws]}
          value={ws}
          onChange={(i) => {
            setWs(i)
            setTouched(true)
          }}
          ends={['Weak', 'Just right', 'Strong']}
          optionLabels={WS_LABELS}
        />

        {rated ? (
          <AdviceCard title={advice.title} detail={advice.detail} why={advice.why} then={advice.then} />
        ) : (
          <AdviceCard
            title="Rate it to get one change"
            why="Pick a score, or say whether it was sour, bitter, weak or strong. You will see what to change for the next brew."
          />
        )}

        <fieldset className="bm-scale" style={{ gap: 10 }}>
          <legend className="bm-scale-legend">
            What did you taste? <span className="bm-scale-value">Optional</span>
          </legend>
          <div className="bm-chips">
            {chips.map((c) => (
              <Chip key={c} selected={descriptors.includes(c)} onClick={() => setDescriptors((d) => (d.includes(c) ? d.filter((x) => x !== c) : [...d, c]))}>
                {c}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div className="grid-2">
          <Field
            label="Grind setting you used"
            value={grind}
            onChange={(ev) => setGrind(ev.target.value)}
            inputMode="numeric"
            help="Clicks, if you count them. Optional."
            maxLength={40}
          />
          {mode === 'guided' && !e ? null : (
            <Field
              label="Brew time (m:ss)"
              value={time}
              onChange={(ev) => setTime(ev.target.value)}
              inputMode="numeric"
              maxLength={5}
              help={timeS === null ? 'Use minutes and seconds, like 3:10.' : undefined}
            />
          )}
        </div>
        <Field
          label="Notes"
          value={notes}
          onChange={(ev) => setNotes(ev.target.value)}
          multiline
          maxLength={2000}
          placeholder="Anything to remember about this cup"
        />
      </div>
      <div className="pinned">
        <Button full onClick={() => save()} disabled={saving}>
          {e ? 'Save changes' : 'Save brew'}
        </Button>
      </div>
    </main>
  )
}
