// Today: "What should I brew this morning?" The next-brew card is the answer (UX design §2, screen 1).

import { listBeans } from '../../data/repositories.js'
import { getDb } from '../../data/db.js'
import { defaultDose } from '../../domain/recipe/baseline.js'
import { baselineRecipe } from '../../domain/recipe/engine.js'
import { formatTime } from '../../domain/recipe/format.js'
import { nextBrew } from '../../domain/dialin/next.js'
import { freshness } from '../../domain/beans/freshness.js'
import { dayMonth } from '../../domain/beans/freshness.js'
import type { Bean, Brew } from '../../domain/schemas.js'
import { beanByline, beanMeta, freshnessStatus, longDate, remaining } from '../../lib/display.js'
import { onShelf, pickNextBean } from '../../lib/today.js'
import { usePhotoUrl } from '../../lib/usePhotoUrl.js'
import { BagImage, BeanRow, FigureStrip, Icon, Spinner, bagTone } from '../../ui/components.js'
import { href } from '../router.js'
import { useLoad } from '../store.js'

export function TodayScreen() {
  const today = new Date()
  const { data, loading } = useLoad(async () => {
    const [beans, brews] = await Promise.all([listBeans(), getDb().brews.toArray()])
    return { beans, brews }
  }, [])

  return (
    <main className="screen">
      <div className="home-bar">
        <span className="brand">
          <Icon name="mark" size={26} />
          BrewNext
        </span>
        <a className="bm-btn bm-btn-secondary bm-btn-md" href={href.scan()}>
          <Icon name="camera" size={18} />
          Scan bag
        </a>
      </div>
      {loading && !data ? <Spinner label="Opening your shelf" /> : <TodayBody beans={data?.beans ?? []} brews={data?.brews ?? []} today={today} />}
    </main>
  )
}

function TodayBody({ beans, brews, today }: { beans: Bean[]; brews: Brew[]; today: Date }) {
  const lead = pickNextBean(beans, brews, today)
  const shelf = onShelf(beans)
  const anyPeak = shelf.some((b) => freshness(b, today)?.state === 'peak')
  const sub =
    shelf.length === 0 ? 'Nothing on your shelf yet' : anyPeak ? 'a bag is at its best' : `${shelf.length} ${shelf.length === 1 ? 'bag' : 'bags'} on your shelf`

  return (
    <div className="screen-scroll">
      <div className="heading-block">
        <h1 className="title" tabIndex={-1}>
          Today
        </h1>
        <p className="muted">
          {longDate(today)} · {sub}
        </p>
      </div>

      {lead ? <NextBrewCard bean={lead} brews={brews.filter((b) => b.beanId === lead.id)} today={today} /> : <FirstBag />}

      {shelf.length > 0 ? (
        <section className="section" aria-labelledby="shelf">
          <div className="section-head">
            <h2 id="shelf" className="heading">
              On your shelf
            </h2>
            <span className="muted">
              {shelf.length} {shelf.length === 1 ? 'bag' : 'bags'}
            </span>
          </div>
          <div className="bm-card bm-list">
            {shelf.map((b) => {
              const own = brews.filter((x) => x.beanId === b.id)
              const left = remaining(b, defaultDose(b), own.length)
              return (
                <BeanRow
                  key={b.id}
                  href={href.bean(b.id)}
                  name={b.name}
                  meta={beanMeta(b)}
                  status={freshnessStatus(b, today)}
                  amount={left.amount}
                  amountNote={left.note}
                  tone={bagTone(b.id)}
                />
              )
            })}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function NextBrewCard({ bean, brews, today }: { bean: Bean; brews: Brew[]; today: Date }) {
  const photo = usePhotoUrl(bean.photoIds[0])
  const plan = nextBrew(brews)
  const recipe = plan.recipe ?? baselineRecipe({ bean, doseG: defaultDose(bean), today })
  const f = freshness(bean, today)
  const heading =
    plan.kind === 'first' || plan.kind === 'standard'
      ? 'First brew of a new bag'
      : plan.kind === 'dialin'
        ? `Brew ${brews.length + 1}: one change`
        : `Brew ${brews.length + 1}`
  const freshLine = f
    ? f.state === 'resting'
      ? `Roasted ${dayMonth(bean.roastDate!)}. Still resting until ${dayMonth(f.readyOn)}, so expect it to taste a little sharp.`
      : f.state === 'peak'
        ? `Roasted ${dayMonth(bean.roastDate!)}. Day ${f.day} is inside its best window.`
        : `Roasted ${dayMonth(bean.roastDate!)}. Day ${f.day} is past its best window, so brew it soon.`
    : null
  const planLine = plan.kind === 'dialin' ? `${plan.title}. ${plan.why}` : plan.kind === 'first' ? (recipe.rationale ?? '') : plan.why

  return (
    <section className="bm-card lead-card" aria-labelledby="next-brew">
      <h2 id="next-brew" className="card-heading">
        {heading}
      </h2>
      <div className="bean-head">
        <BagImage photoUrl={photo} tone={bagTone(bean.id)} initial={bean.roaster?.charAt(0)} />
        <div className="bean-head-text">
          <span className="lead">{bean.name}</span>
          <span className="muted">{beanByline(bean) || beanMeta(bean)}</span>
        </div>
      </div>
      <FigureStrip
        items={[
          { label: 'Coffee', value: recipe.doseG, unit: 'g', changed: plan.changed.includes('doseG') },
          { label: 'Water', value: recipe.waterG, unit: 'g', changed: plan.changed.includes('waterG') },
          { label: 'Temp', value: recipe.tempC, unit: '°C', changed: plan.changed.includes('tempC') },
          { label: 'Time', value: formatTime(recipe.totalTimeS) },
        ]}
      />
      {[freshLine, planLine].filter(Boolean).length ? <p>{[freshLine, planLine].filter(Boolean).join(' ')}</p> : null}
      <a className="bm-btn bm-btn-primary bm-btn-lg bm-btn-full" href={href.recipe(bean.id)}>
        Start brew
      </a>
    </section>
  )
}

function FirstBag() {
  return (
    <section className="bm-card lead-card" aria-labelledby="first-bag">
      <h2 id="first-bag" className="lead">
        Scan your first bag
      </h2>
      <p>Take a photo of the label. BrewNext reads it and makes a V60 recipe for that coffee.</p>
      <a className="bm-btn bm-btn-primary bm-btn-lg bm-btn-full" href={href.scan()}>
        <Icon name="camera" size={18} />
        Scan bag
      </a>
      <a className="bm-btn bm-btn-text bm-btn-md bm-btn-full" href={`${href.review()}?manual`}>
        <Icon name="keyboard" size={18} />
        Type it in
      </a>
    </section>
  )
}
