import { expect, test, type Page } from '@playwright/test'

// NFR mobile layout (BRD §4: the primary user is on a phone). On every screen, at
// the narrowest to the widest common phone, the page itself must not move under
// a finger: nothing wider than the screen, and only the screen's own scroller scrolls.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
// Real labels print long names; one long unbroken word is the hardest case for a phone.
const LONG_NAME = 'Finca-La-Esperanza-Gesha-Anaerobic-Natural-Lot-42'
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

const SCAN = {
  fields: {
    name: LONG_NAME,
    roaster: 'Northpoint Coffee Roasters of Sheung Wan',
    originCountry: 'CO',
    originName: 'Colombia',
    originRaw: 'Colombia, Huila',
    region: 'Huila',
    producer: null,
    varieties: ['Pink Bourbon', 'Gesha'],
    process: 'natural',
    roastLevel: 'light',
    altitude: { minM: 1800, maxM: 2100 },
    labelNotes: ['lychee', 'black tea', 'honey', 'jasmine', 'bergamot'],
    roastDate: daysAgo(9),
    netWeightG: 250,
  },
  confidence: { name: 'high', roastDate: 'medium' },
  flags: { roastDate: 'Printed 14.11.26. Read day-first as 14 November 2026.' },
  roastDateReading: { iso: daysAgo(9), reading: 'day-first', ambiguous: true },
  labelLanguage: 'en',
  originalName: null,
  meta: { model: 'test-model', promptVersion: 'scan.v1' },
}

const PHONES = [
  { name: 'small Android', width: 360, height: 740 },
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 15', width: 393, height: 852 },
  { name: 'iPhone Pro Max', width: 430, height: 932 },
]

interface Layout {
  width: number
  height: number
  scrollWidth: number
  scrollHeight: number
  movedX: number
  movedY: number
  wide: string[]
  cutOff: string[]
  pageOverscroll: string
}

/** Measures what a finger could move: the page's own scroll, and anything wider than the screen. */
async function measure(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const doc = document.scrollingElement as HTMLElement
    const width = window.innerWidth
    const describe = (el: Element) => {
      const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''
      return `${el.tagName.toLowerCase()}${cls}`
    }
    const height = window.innerHeight
    // Inside a scroller (or a clipping box) that itself fits the screen, overflow is reachable or intended.
    const clippedByAncestor = (el: Element, axis: 'x' | 'y') => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p)
        if ((axis === 'x' ? s.overflowX : s.overflowY) !== 'visible') {
          const r = p.getBoundingClientRect()
          if (axis === 'x' ? r.left >= -1 && r.right <= width + 1 : r.top >= -1 && r.bottom <= height + 1) return true
        }
      }
      return false
    }
    const wide: string[] = []
    const cutOff: string[] = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if ((r.right > width + 1 || r.left < -1) && !clippedByAncestor(el, 'x')) wide.push(`${describe(el)} [${Math.round(r.left)}–${Math.round(r.right)}]`)
      if (r.bottom > height + 1 && !clippedByAncestor(el, 'y')) cutOff.push(`${describe(el)} [bottom ${Math.round(r.bottom)}]`)
    }
    // Try to move the page the way a drag would; it must stay put.
    window.scrollTo(500, 500)
    const movedX = window.scrollX
    const movedY = window.scrollY
    window.scrollTo(0, 0)
    return {
      width,
      height: window.innerHeight,
      scrollWidth: doc.scrollWidth,
      scrollHeight: doc.scrollHeight,
      movedX,
      movedY,
      wide: wide.slice(0, 8),
      cutOff: cutOff.slice(0, 8),
      pageOverscroll: `${getComputedStyle(document.documentElement).overscrollBehaviorY}/${getComputedStyle(document.body).overscrollBehaviorY}`,
    }
  })
}

async function expectStill(page: Page, screen: string) {
  // Let late layout (fonts, charts, the map) settle.
  await page.waitForTimeout(150)
  const m = await measure(page)
  expect.soft(m.wide, `${screen}: elements wider than the ${m.width}px screen`).toEqual([])
  expect.soft(m.cutOff, `${screen}: content below the ${m.height}px screen that no scroller can reach`).toEqual([])
  expect.soft(m.scrollWidth, `${screen}: page is wider than the screen`).toBeLessThanOrEqual(m.width)
  expect.soft(m.movedX, `${screen}: page moves sideways`).toBe(0)
  expect.soft(m.movedY, `${screen}: page moves up and down (only the screen's scroller should)`).toBe(0)
  expect.soft(m.pageOverscroll, `${screen}: page can bounce when a scroller hits its end`).toBe('none/none')
}

const nav = (page: Page, name: 'Today' | 'Beans' | 'Journal' | 'Map') => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click()

for (const phone of PHONES) {
  test.describe(`${phone.name} (${phone.width}px)`, () => {
    test.use({ viewport: { width: phone.width, height: phone.height }, isMobile: true, hasTouch: true })

    test('no screen moves under a finger', async ({ page }) => {
      await page.route('**/tile.openstreetmap.org/**', (r) => r.abort())
      await page.route('**/fonts.googleapis.com/**', (r) => r.abort())
      await page.route('**/api/scan', (r) => r.fulfill({ json: SCAN }))
      await page.route('**/api/recipe', (r) => r.abort('internetdisconnected'))

      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Scan your first bag' })).toBeVisible()
      await expectStill(page, 'Today, empty')

      await page.getByRole('link', { name: 'Scan bag' }).first().click()
      await expectStill(page, 'Scan')
      await page.getByLabel('Choose a photo of the label').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: PNG })
      await expect(page.getByRole('heading', { name: 'Check the label' })).toBeVisible()
      await expectStill(page, 'Check the label')

      await page.getByRole('button', { name: 'Save bag and make recipe' }).click()
      await expect(page.getByRole('heading', { name: 'V60 recipe' })).toBeVisible()
      await expectStill(page, 'Recipe')

      await page.getByRole('button', { name: 'Start timer' }).click()
      await expectStill(page, 'Guided brew, ready')
      await page.getByRole('button', { name: 'Start' }).click()
      await expectStill(page, 'Guided brew, running')
      for (let i = 0; i < 20 && (await page.getByRole('button', { name: 'Skip step' }).count()); i++)
        await page.getByRole('button', { name: 'Skip step' }).click()
      await expect(page.getByText('Brew finished')).toBeVisible()
      await expectStill(page, 'Guided brew, finished')

      await page.getByRole('button', { name: 'Taste it' }).click()
      await expect(page.getByRole('heading', { name: 'How did it taste?' })).toBeVisible()
      await page.getByRole('button', { name: 'Rate 3 of 5' }).click()
      await page.getByRole('button', { name: 'A bit sour' }).click()
      await page.getByLabel('Grind setting you used').fill('22')
      await expectStill(page, 'Taste')
      await page.getByRole('button', { name: 'Save brew' }).click()

      await expect(page.getByRole('heading', { level: 1, name: LONG_NAME })).toBeVisible()
      await expectStill(page, 'Bag page')
      await page.getByRole('link', { name: 'Brew again' }).click()
      await expect(page.getByRole('heading', { name: 'V60 recipe' })).toBeVisible()
      await expectStill(page, 'Recipe with one change')
      await page.getByRole('button', { name: 'Back' }).click()

      await nav(page, 'Today')
      await expectStill(page, 'Today, with a bag')
      await nav(page, 'Beans')
      await expectStill(page, 'Beans')
      await nav(page, 'Journal')
      await expectStill(page, 'Journal, list')
      await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Calendar' }).click()
      await expectStill(page, 'Journal, calendar')
      await nav(page, 'Map')
      await expect(page.getByText('1 country')).toBeVisible()
      await expectStill(page, 'Map')

      await page.goto('/#/review?manual')
      await expect(page.getByRole('heading', { name: 'Add a bag' })).toBeVisible()
      await expectStill(page, 'Add a bag')
    })
  })
}
