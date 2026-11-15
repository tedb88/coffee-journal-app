// Beans: the library of bags (BEAN-05), filtered by status, sorted, and searchable
// by name, roaster, origin, process or roast.

import { useState } from 'react'
import { getDb } from '../../data/db.js'
import { listBeans } from '../../data/repositories.js'
import { freshness } from '../../domain/beans/freshness.js'
import { defaultDose } from '../../domain/recipe/baseline.js'
import type { Bean, Brew } from '../../domain/schemas.js'
import { beanMeta, freshnessStatus, remaining } from '../../lib/display.js'
import { BeanRow, Chip, Field, Icon, Spinner, bagTone } from '../../ui/components.js'
import { href } from '../router.js'
import { useLoad } from '../store.js'

type Status = 'active' | 'finished' | 'all'
type Sort = 'recent' | 'rating' | 'freshness'

const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'rating', label: 'Best rated' },
  { value: 'freshness', label: 'Freshest' },
]

function avg(brews: Brew[]): number {
  const r = brews.filter((b) => b.rating !== null)
  return r.length ? r.reduce((n, b) => n + (b.rating ?? 0), 0) / r.length : -1
}

export function BeansScreen() {
  const [status, setStatus] = useState<Status>('active')
  const [sort, setSort] = useState<Sort>('recent')
  const [q, setQ] = useState('')
  const today = new Date()
  const { data, loading } = useLoad(async () => {
    const [beans, brews] = await Promise.all([listBeans(), getDb().brews.toArray()])
    return { beans, brews }
  }, [])

  const brewsOf = (b: Bean) => (data?.brews ?? []).filter((x) => x.beanId === b.id)
  const lastAt = (b: Bean) => brewsOf(b).reduce((m, x) => (x.createdAt > m ? x.createdAt : m), b.createdAt)
  const term = q.trim().toLowerCase()
  const list = (data?.beans ?? [])
    .filter((b) => (status === 'all' ? true : status === 'active' ? b.status === 'active' : b.status !== 'active'))
    .filter((b) => !term || [b.name, b.roaster ?? '', beanMeta(b), b.region ?? '', ...b.labelNotes].some((s) => s.toLowerCase().includes(term)))
    .sort((a, b) => {
      if (sort === 'rating') return avg(brewsOf(b)) - avg(brewsOf(a))
      if (sort === 'freshness') return (freshness(a, today)?.day ?? 9999) - (freshness(b, today)?.day ?? 9999)
      return lastAt(b).localeCompare(lastAt(a))
    })

  return (
    <main className="screen">
      <div className="home-bar">
        <h1 className="title" tabIndex={-1}>
          Beans
        </h1>
        <a className="bm-btn bm-btn-secondary bm-btn-md" href={href.scan()}>
          <Icon name="camera" size={18} />
          Scan bag
        </a>
      </div>
      <div className="screen-scroll" style={{ paddingTop: 'var(--space-4)' }}>
        <div className="stack">
          <div className="bm-chips" role="group" aria-label="Show">
            {(['active', 'finished', 'all'] as const).map((s) => (
              <Chip key={s} selected={status === s} onClick={() => setStatus(s)}>
                {s === 'active' ? 'On the shelf' : s === 'finished' ? 'Finished' : 'All'}
              </Chip>
            ))}
          </div>
          <div className="grid-2">
            <Field label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, origin, roaster" />
            <Field label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} options={SORTS} />
          </div>
        </div>
        {loading && !data ? (
          <Spinner label="Opening your beans" />
        ) : list.length === 0 ? (
          <div className="bm-card empty">
            <p className="heading">{data?.beans.length ? 'No bags match' : 'No bags yet'}</p>
            <p className="muted">{data?.beans.length ? 'Try another search or show all bags.' : 'Scan a bag, or type one in, to start.'}</p>
            <a className="bm-btn bm-btn-secondary bm-btn-md" href={`${href.review()}?manual`}>
              <Icon name="keyboard" size={18} />
              Type it in
            </a>
          </div>
        ) : (
          <div className="bm-card bm-list">
            {list.map((b) => {
              const left = remaining(b, defaultDose(b), brewsOf(b).length)
              const st =
                b.status === 'active' ? freshnessStatus(b, today) : { tone: 'neutral' as const, text: b.status === 'finished' ? 'Finished' : 'Archived' }
              return (
                <BeanRow
                  key={b.id}
                  href={href.bean(b.id)}
                  name={b.name}
                  meta={beanMeta(b)}
                  status={st}
                  amount={left.amount}
                  amountNote={left.note}
                  tone={bagTone(b.id)}
                />
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
