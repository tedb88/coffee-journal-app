// Recipe: "What do I do, and why?" (UX design §2, screens 4 and 8). The dose
// stepper re-runs the engine, so pours always add up (RCP-07, RCP-04).

import { useEffect, useState } from 'react'
import { getBean, listBrewsForBean } from '../../data/repositories.js'
import { freshness } from '../../domain/beans/freshness.js'
import { label } from '../../domain/enums.js'
import { nextBrew, type NextBrew } from '../../domain/dialin/next.js'
import { defaultDose } from '../../domain/recipe/baseline.js'
import { rescale } from '../../domain/recipe/engine.js'
import { formatTime } from '../../domain/recipe/format.js'
import { V60 } from '../../domain/rules/index.js'
import type { Bean, BeanAttributes, Recipe } from '../../domain/schemas.js'
import { getRecipe } from '../../lib/api.js'
import { Button, FigureStrip, IconButton, PourChart, Spinner } from '../../ui/components.js'
import { getDraft, setDraft } from '../flow.js'
import { go, href } from '../router.js'
import { useLoad } from '../store.js'

export function attributesOf(bean: Bean): BeanAttributes {
  const { name, originCountry, region, process, roastLevel, roastDate, varieties, altitude, labelNotes } = bean
  return { name, originCountry, region, process, roastLevel, roastDate, varieties, altitude, labelNotes }
}

const FALLBACK_TEXT: Record<string, string> = {
  offline: 'You are offline, so this is BrewMap’s standard recipe for this coffee.',
}

export function RecipeScreen({ beanId }: { beanId: string }) {
  const loaded = useLoad(async () => {
    const [bean, brews] = await Promise.all([getBean(beanId), listBrewsForBean(beanId)])
    return { bean: bean ?? null, brews }
  }, [beanId])
  if (loaded.loading && !loaded.data) return <Spinner label="Opening the bag" />
  if (!loaded.data?.bean)
    return (
      <main className="screen">
        <div className="empty">
          <p className="heading">This bag is no longer on this device.</p>
          <a className="bm-btn bm-btn-secondary bm-btn-md" href={href.today()}>
            Back to Today
          </a>
        </div>
      </main>
    )
  return <RecipeView bean={loaded.data.bean} plan={nextBrew(loaded.data.brews)} brewNumber={loaded.data.brews.length + 1} />
}

function RecipeView({ bean, plan, brewNumber }: { bean: Bean; plan: NextBrew; brewNumber: number }) {
  const [base, setBase] = useState<Recipe | null>(() => {
    const d = getDraft()
    if (d && d.beanId === bean.id && d.brewNumber === brewNumber) return d.recipe
    return plan.recipe
  })
  const [fallbackReason, setFallbackReason] = useState<string | null>(() => getDraft()?.fallbackReason ?? null)
  const [dose, setDose] = useState<number | null>(null)

  // First brew of a bag (or after legacy entries): ask for a personalised recipe; the device builds one if that fails (RCP-06).
  useEffect(() => {
    if (base) return
    let live = true
    getRecipe({ bean: attributesOf(bean), doseG: defaultDose(bean), preferences: null }).then((res) => {
      if (!live) return
      setBase(res.recipe)
      setFallbackReason(res.fallback ? (res.reason ?? 'unavailable') : null)
    })
    return () => {
      live = false
    }
  }, [base, bean])

  if (!base) return <Spinner label="Making your recipe" />
  const recipe = dose !== null && dose !== base.doseG ? rescale(base, dose) : base
  const before = plan.kind === 'dialin' || plan.kind === 'keep' || plan.kind === 'repeat' ? (plan.from?.recipe ?? null) : null
  const changed = (k: 'tempC' | 'ratio' | 'grind') => plan.kind === 'dialin' && plan.changed.includes(k)
  const was = (k: 'tempC' | 'ratio' | 'grind') =>
    before && changed(k) ? (k === 'grind' ? label(before.grind) : k === 'ratio' ? `1:${before.ratio}` : `${before.tempC} °C`) : null
  const oldClicks = plan.advice?.clicks ?? null
  const grindNote =
    plan.clicks !== null
      ? changed('grind') && oldClicks !== null
        ? `${plan.clicks} clicks (was ${oldClicks})`
        : `About ${plan.clicks} clicks, as last time`
      : was('grind')
        ? `was ${was('grind')}`
        : undefined
  const pours = recipe.steps.filter((s) => s.amountG > 0)
  const f = freshness(bean, new Date())

  const subline =
    plan.kind === 'dialin'
      ? `One change from brew ${brewNumber - 1}: ${plan.title.charAt(0).toLowerCase()}${plan.title.slice(1)}`
      : plan.kind === 'keep'
        ? `The same as brew ${brewNumber - 1}, which you liked`
        : plan.kind === 'repeat'
          ? plan.title
          : `Made for this bag: ${[label(bean.process).toLowerCase(), bean.roastLevel ? `${label(bean.roastLevel).toLowerCase()} roast` : null, f ? `day ${f.day}` : null].filter(Boolean).join(', ') || 'a standard V60 recipe'}`

  const why =
    plan.kind === 'dialin'
      ? { title: 'What changed', text: [plan.advice?.why, plan.why].filter(Boolean).join(' ') }
      : plan.kind === 'keep' || plan.kind === 'repeat'
        ? { title: 'Why this recipe', text: plan.why }
        : {
            title: fallbackReason ? 'Standard recipe' : 'Why this recipe',
            text: [
              fallbackReason
                ? (FALLBACK_TEXT[fallbackReason] ?? 'AI personalisation is not available right now, so this is BrewMap’s standard recipe for this coffee.')
                : null,
              recipe.rationale,
              recipe.expectedCup,
            ]
              .filter(Boolean)
              .join(' '),
          }

  function start(guided: boolean) {
    setDraft({
      beanId: bean.id,
      recipe,
      brewNumber,
      appliedFrom: plan.kind === 'dialin' ? (plan.from?.id ?? null) : null,
      clicks: plan.clicks,
      actualTimeS: null,
      guided,
      fallbackReason,
    })
    go(guided ? href.brew() : href.log(bean.id))
  }

  const step = (by: number) => setDose(Math.max(V60.bounds.doseG.min, Math.min(V60.bounds.doseG.max, recipe.doseG + by)))

  return (
    <main className="screen">
      <div className="topbar">
        <IconButton icon="back" label="Back" onClick={() => go(brewNumber > 1 ? href.bean(bean.id) : href.today())} />
        <span className="topbar-title">
          {bean.name} · brew {brewNumber}
        </span>
      </div>
      <div className="screen-scroll tight">
        <div className="heading-block">
          <h1 className="title" tabIndex={-1}>
            V60 recipe
          </h1>
          <p className="muted">{subline}</p>
        </div>

        <section className="bm-card settings-card" aria-label="Recipe settings">
          <div className="dose-row">
            <div className="stack" style={{ gap: 0 }}>
              <span className="label">Coffee</span>
              <span className="figure-lg" aria-live="polite">
                {recipe.doseG}
                <span className="unit"> g</span>
              </span>
            </div>
            <div className="stepper">
              <IconButton icon="minus" label="Less coffee" variant="outline" onClick={() => step(-1)} disabled={recipe.doseG <= V60.bounds.doseG.min} />
              <IconButton icon="plus" label="More coffee" variant="outline" onClick={() => step(1)} disabled={recipe.doseG >= V60.bounds.doseG.max} />
            </div>
          </div>
          <div style={{ paddingTop: 'var(--space-3)' }}>
            <FigureStrip
              bare
              columns={3}
              items={[
                { label: 'Water', value: recipe.waterG, unit: 'g' },
                { label: 'Ratio', value: `1:${recipe.ratio}`, changed: changed('ratio'), note: was('ratio') ? `was ${was('ratio')}` : undefined },
                { label: 'Water temp', value: recipe.tempC, unit: '°C', changed: changed('tempC'), note: was('tempC') ? `was ${was('tempC')}` : undefined },
              ]}
            />
          </div>
          <div style={{ paddingTop: 'var(--space-3)' }}>
            <FigureStrip
              bare
              columns={3}
              items={[
                { label: 'Grind', value: label(recipe.grind), span: 2, changed: changed('grind'), note: grindNote },
                { label: 'Total time', value: formatTime(recipe.totalTimeS) },
              ]}
            />
          </div>
        </section>

        <section className="bm-card bm-card-pad stack" aria-labelledby="pours" style={{ gap: 'var(--space-2)' }}>
          <div className="section-head">
            <h2 id="pours" className="heading">
              Pours
            </h2>
            <span className="muted num">
              {pours.length} pours to {recipe.waterG} g
            </span>
          </div>
          <PourChart recipe={recipe} />
          <ol className="steps">
            {recipe.steps.map((s, i) => (
              <li key={i} className="step">
                <span className="step-at">{formatTime(s.startS)}</span>
                <span>
                  <span style={{ fontWeight: 500 }}>{s.label}.</span> <span className="muted">{s.note}</span>
                </span>
                <span className="step-target">{s.kind === 'drawdown' ? formatTime(recipe.totalTimeS) : `${s.targetG} g`}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="stack" aria-labelledby="why" style={{ gap: 6, padding: '0 var(--space-1)' }}>
          <h2 id="why" className="heading">
            {why.title}
          </h2>
          {why.text ? <p>{why.text}</p> : null}
          <p className="meta">
            Before you start: heat water to {recipe.tempC} °C, rinse the paper filter, grind {recipe.doseG} g.
          </p>
        </section>
      </div>
      <div className="pinned">
        <Button full onClick={() => start(true)}>
          Start timer
        </Button>
        <Button variant="text" full onClick={() => start(false)}>
          Brewed it already? Log it
        </Button>
      </div>
    </main>
  )
}
