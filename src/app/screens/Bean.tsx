// Bean: "How is this bag going, and what is my next brew?" (UX design §2,
// screen 7; BEAN-02 to BEAN-04, DIAL-03 to DIAL-05, LOG-05).

import { useState } from 'react'
import { deleteBean, deleteBrew, getBean, listBrewsForBean, updateBean } from '../../data/repositories.js'
import { beanStats } from '../../domain/beans/stats.js'
import { dayMonth } from '../../domain/beans/freshness.js'
import { label } from '../../domain/enums.js'
import { balanceWords, changeLine, dialinOutcomes, nextBrew, parseClicks } from '../../domain/dialin/next.js'
import { defaultDose } from '../../domain/recipe/baseline.js'
import { baselineRecipe } from '../../domain/recipe/engine.js'
import type { Bean, Brew } from '../../domain/schemas.js'
import { beanByline, freshnessStatus, fullDate, recipeLine, whenText } from '../../lib/display.js'
import { usePhotoUrl } from '../../lib/usePhotoUrl.js'
import { BagImage, Button, FigureStrip, FreshnessTrack, Icon, IconButton, Spinner, StatusDot, Tag, Value, bagTone } from '../../ui/components.js'
import { useToast } from '../App.js'
import { go, href } from '../router.js'
import { bump, useLoad } from '../store.js'

/** Join parts into sentences, each ending with exactly one full stop. */
function sentences(...parts: Array<string | null | undefined>): string {
  return parts
    .filter((p): p is string => !!p && p.trim().length > 0)
    .map((p) => p.trim().replace(/\.*$/, '.'))
    .join(' ')
}

export function BeanScreen({ id }: { id: string }) {
  const loaded = useLoad(async () => {
    const [bean, brews] = await Promise.all([getBean(id), listBrewsForBean(id)])
    return { bean: bean ?? null, brews }
  }, [id])
  if (loaded.loading && !loaded.data) return <Spinner label="Opening the bag" />
  if (!loaded.data?.bean)
    return (
      <main className="screen">
        <div className="empty">
          <h1 className="heading" tabIndex={-1}>
            This bag is no longer on this device
          </h1>
          <a className="bm-btn bm-btn-secondary bm-btn-md" href={href.beans()}>
            Back to Beans
          </a>
        </div>
      </main>
    )
  return <BeanView bean={loaded.data.bean} brews={loaded.data.brews} />
}

function BeanView({ bean, brews }: { bean: Bean; brews: Brew[] }) {
  const toast = useToast()
  const photo = usePhotoUrl(bean.photoIds[0])
  const today = new Date()
  const plan = nextBrew(brews)
  const next = plan.recipe ?? baselineRecipe({ bean, doseG: defaultDose(bean), today })
  const stats = beanStats(bean, brews, next.doseG)
  const fresh = freshnessStatus(bean, today)
  const outcomes = dialinOutcomes(brews)
  const [adjusting, setAdjusting] = useState(false)
  const [left, setLeft] = useState(bean.remainingG === null ? '' : String(Math.round(bean.remainingG)))

  const isNew = plan.kind === 'first'
  const freshRecipe = isNew || plan.kind === 'standard'
  const changed = (k: 'doseG' | 'waterG' | 'tempC' | 'grind') => plan.kind === 'dialin' && plan.changed.includes(k)
  const grindFigure = plan.clicks !== null ? { value: plan.clicks, unit: 'clicks' } : { value: label(next.grind) }

  async function remove() {
    if (!window.confirm(`Delete ${bean.name} and its ${brews.length} ${brews.length === 1 ? 'brew' : 'brews'}?`)) return
    const snap = await deleteBean(bean.id)
    bump()
    toast(`${bean.name} deleted`, snap)
    go(href.beans(), { replace: true })
  }

  async function removeBrew(b: Brew, n: number) {
    if (!window.confirm(`Delete brew ${n} of ${bean.name}?`)) return
    const snap = await deleteBrew(b.id)
    bump()
    toast(`Brew ${n} deleted`, snap)
  }

  async function setStatus(status: Bean['status']) {
    await updateBean(bean.id, { status })
    bump()
    toast(status === 'finished' ? 'Marked as finished' : 'Back on your shelf')
  }

  async function saveLeft() {
    const g = Number(left)
    if (!Number.isFinite(g) || g < 0 || g > 5000) return
    await updateBean(bean.id, { remainingG: Math.round(g), netWeightG: bean.netWeightG ?? Math.round(g) })
    setAdjusting(false)
    bump()
  }

  return (
    <main className="screen">
      <div className="topbar">
        <IconButton icon="back" label="Back to Beans" onClick={() => go(href.beans())} />
        <span className="topbar-title">Beans</span>
        <a className="bm-btn bm-btn-text bm-btn-md" href={href.beanEdit(bean.id)}>
          Edit
        </a>
      </div>
      <div className="screen-scroll">
        <div className="bean-head">
          <BagImage photoUrl={photo} tone={bagTone(bean.id)} size="lg" initial={bean.roaster?.charAt(0)} alt={`Your photo of ${bean.name}`} />
          <div className="bean-head-text">
            <h1 className="title" tabIndex={-1}>
              {bean.name}
            </h1>
            {beanByline(bean) ? <span className="muted">{beanByline(bean)}</span> : null}
            <span className="meta">{[label(bean.process), label(bean.roastLevel), ...bean.varieties].filter(Boolean).join(' · ') || '—'}</span>
          </div>
        </div>

        {bean.status !== 'active' ? (
          <div className="banner" role="status">
            <span>This bag is marked as {bean.status}.</span>
            <div className="banner-actions">
              <Button variant="secondary" onClick={() => setStatus('active')}>
                Put it back on the shelf
              </Button>
            </div>
          </div>
        ) : null}

        <section className="bm-card lead-card" aria-labelledby="next" style={{ padding: 18, gap: 'var(--space-3)' }}>
          <div className="stack" style={{ gap: 'var(--space-1)' }}>
            <h2 id="next" className="card-heading">
              Next brew
            </h2>
            <p className="lead">{isNew ? 'First brew of this bag' : plan.title}</p>
            <p>{plan.kind === 'dialin' ? sentences(plan.advice?.detail, plan.why) : isNew ? 'BrewMap makes a recipe from what the label says.' : plan.why}</p>
          </div>
          <div>
            <FigureStrip
              items={[
                { label: 'Coffee', value: next.doseG, unit: 'g', changed: changed('doseG') },
                { label: 'Water', value: next.waterG, unit: 'g', changed: changed('waterG') },
                { label: 'Temp', value: next.tempC, unit: '°C', changed: changed('tempC') },
              ]}
            />
            {/* Grind can be a word ("Medium-coarse"), too wide for a quarter of a phone: its own row, as on the recipe. */}
            <div style={{ paddingTop: 'var(--space-3)' }}>
              <FigureStrip bare columns={1} items={[{ label: 'Grind', ...grindFigure, changed: changed('grind') }]} />
            </div>
          </div>
          <a className="bm-btn bm-btn-primary bm-btn-lg bm-btn-full" href={href.recipe(bean.id)}>
            {freshRecipe ? 'Make a recipe' : 'Brew again'}
          </a>
          <a className="bm-btn bm-btn-text bm-btn-md bm-btn-full" href={href.log(bean.id)}>
            Log a brew without the timer
          </a>
        </section>

        {brews.length > 0 ? (
          <section className="section" aria-labelledby="dialin">
            <div className="section-head">
              <h2 id="dialin" className="heading">
                Dialling in
              </h2>
              <span className="muted">
                {brews.length} {brews.length === 1 ? 'brew' : 'brews'}
                {stats.averageRating !== null ? ` · average ${stats.averageRating} of 5` : ''}
              </span>
            </div>
            <div className="stack" style={{ gap: 0 }}>
              {brews.map((b, i) => {
                const outcome = outcomes.find((o) => o.fromId === b.id)
                const nextBrewOfIt = brews.find((x) => x.appliedFrom === b.id)
                const isBest = stats.best?.id === b.id && brews.length > 1
                return (
                  <div key={b.id}>
                    <article className="bm-card history-card" aria-label={`Brew ${i + 1}`}>
                      <div className="row-between">
                        <span style={{ fontWeight: 600 }}>
                          Brew {i + 1}
                          {isBest ? (
                            <span className="muted" style={{ fontWeight: 400 }}>
                              {' '}
                              · your best so far
                            </span>
                          ) : null}
                        </span>
                        <span className="meta">{whenText(b.createdAt)}</span>
                      </div>
                      <div className="tags">
                        {b.rating !== null ? <Tag tone="ink">{`Rated ${b.rating} of 5`}</Tag> : <Tag>Not rated</Tag>}
                        {balanceWords(b.balance).map((w) => (
                          <Tag key={w}>{w}</Tag>
                        ))}
                        {b.descriptors.map((d) => (
                          <Tag key={d}>{d}</Tag>
                        ))}
                      </div>
                      <span className="meta num">{recipeLine(b.recipe, parseClicks(b.grindSetting), b.actualTimeS)}</span>
                      {b.notes ? (
                        <p className="meta" style={{ color: 'var(--ink)' }}>
                          {b.notes}
                        </p>
                      ) : null}
                      <div className="toolbar">
                        <a className="bm-btn bm-btn-text bm-btn-md" href={href.brewEdit(b.id)} style={{ paddingLeft: 0 }}>
                          Edit
                        </a>
                        <Button variant="text" onClick={() => removeBrew(b, i + 1)}>
                          Delete
                        </Button>
                      </div>
                    </article>
                    {b.advice && b.advice.primary.kind !== 'none' && (nextBrewOfIt || i === brews.length - 1) ? (
                      <div className="history-change">
                        <Icon name="arrow-down" size={16} />
                        <span>
                          {changeLine(b.advice)}
                          {outcome && outcome.ratingDelta !== null
                            ? ` · rating ${outcome.ratingDelta > 0 ? 'went up' : outcome.ratingDelta < 0 ? 'went down' : 'stayed the same'} (${b.rating} → ${(b.rating ?? 0) + outcome.ratingDelta})`
                            : ''}
                        </span>
                      </div>
                    ) : (
                      <div style={{ height: 'var(--space-3)' }} />
                    )}
                  </div>
                )
              })}
              <div className="history-card history-next">
                <div className="row-between">
                  <span style={{ fontWeight: 600 }}>Brew {brews.length + 1}</span>
                  <span className="meta">Up next</span>
                </div>
                <span className="meta num">{recipeLine(next, plan.clicks)}</span>
              </div>
            </div>
          </section>
        ) : null}

        {fresh ? (
          <section className="section" aria-labelledby="fresh">
            <div className="section-head">
              <h2 id="fresh" className="heading">
                Freshness
              </h2>
              <StatusDot tone={fresh.tone}>{`Day ${fresh.f.day} · best until ${dayMonth(fresh.f.bestUntil)}`}</StatusDot>
            </div>
            <FreshnessTrack day={fresh.f.day} roasted={dayMonth(bean.roastDate!)} restDays={fresh.f.restDays} bestDays={fresh.f.bestDays} />
          </section>
        ) : null}

        <section className="section" aria-labelledby="bag" style={{ gap: 'var(--space-2)' }}>
          <div className="section-head">
            <h2 id="bag" className="heading">
              In the bag
            </h2>
            {bean.remainingG !== null ? (
              <span className="num">
                <span style={{ fontWeight: 600 }}>{Math.round(bean.remainingG)} g</span>{' '}
                <span className="muted">
                  {bean.netWeightG ? `of ${bean.netWeightG} g · ` : ''}about {stats.dosesLeft} {stats.dosesLeft === 1 ? 'brew' : 'brews'}
                </span>
              </span>
            ) : (
              <span className="muted">Weight not known</span>
            )}
          </div>
          {stats.usedFraction !== null ? (
            <div className="track" aria-hidden="true">
              <div className="track-fill" style={{ width: `${stats.usedFraction * 100}%` }} />
            </div>
          ) : null}
          {stats.nearlyEmpty ? (
            <div className="banner" role="status">
              <span>About one brew left. Mark this bag as finished when it is empty.</span>
              <div className="banner-actions">
                <Button variant="secondary" onClick={() => setStatus('finished')}>
                  Mark as finished
                </Button>
              </div>
            </div>
          ) : null}
          {adjusting ? (
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label className="bm-field-label" htmlFor="left-g">
                  Grams left in the bag
                </label>
                <input id="left-g" className="bm-input" inputMode="numeric" value={left} onChange={(e) => setLeft(e.target.value.replace(/[^\d]/g, ''))} />
              </div>
              <Button variant="secondary" onClick={saveLeft}>
                Save
              </Button>
            </div>
          ) : (
            <div className="toolbar">
              <Button variant="text" onClick={() => setAdjusting(true)} style={{ paddingLeft: 0 }}>
                Adjust what is left
              </Button>
              {bean.status === 'active' && !stats.nearlyEmpty ? (
                <Button variant="text" onClick={() => setStatus('finished')}>
                  Mark as finished
                </Button>
              ) : null}
            </div>
          )}
        </section>

        <section className="bm-card" aria-labelledby="label" style={{ padding: '6px var(--space-4)' }}>
          <h2 id="label" className="heading" style={{ margin: '10px 0 4px' }}>
            From the label
          </h2>
          <dl className="facts">
            {[
              ['Tasting notes', bean.labelNotes.join(', ')],
              ['Region', bean.region],
              [
                'Altitude',
                bean.altitude
                  ? bean.altitude.minM === bean.altitude.maxM
                    ? `${bean.altitude.minM.toLocaleString('en-GB')} m`
                    : `${bean.altitude.minM.toLocaleString('en-GB')}–${bean.altitude.maxM.toLocaleString('en-GB')} m`
                  : null,
              ],
              ['Roast date', bean.roastDate ? fullDate(bean.roastDate) : null],
              ['Net weight', bean.netWeightG ? `${bean.netWeightG} g` : null],
              ['Producer', bean.producer],
            ].map(([k, v]) => (
              <div key={k} className="fact">
                <dt>{k}</dt>
                <dd>
                  <Value v={v} />
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <Button variant="text" onClick={remove} style={{ alignSelf: 'flex-start', paddingLeft: 0, color: 'var(--negative)' }}>
          Delete this bag
        </Button>
      </div>
    </main>
  )
}
