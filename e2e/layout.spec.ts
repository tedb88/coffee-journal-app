import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

// NFR-04, UX design 0.2 (Layout): the primary user is on a phone (BRD §4). On every
// screen, from the narrowest to the widest common phone, nothing may spill out of its
// card or slide sideways, nothing may be cut off, and the page itself must not move.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
// Real labels print long names; one long unbroken word is the hardest case for a phone.
const LONG_NAME = 'Finca-La-Esperanza-Gesha-Anaerobic-Natural-Lot-42'
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

// Text must be measured in the app's own font: a narrower fallback hides overflow.
const FONT_DIR = join(process.cwd(), 'node_modules/@fontsource/manrope/files')
const WEIGHTS = [400, 500, 600, 700]
const FONT_CSS = WEIGHTS.map(
  (w) =>
    `@font-face{font-family:'Manrope';font-style:normal;font-weight:${w};font-display:block;src:url(https://fonts.gstatic.com/test/manrope-${w}.woff2) format('woff2')}`,
).join('\n')

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
  { name: 'small Android', width: 360, height: 740, colorScheme: 'light' as const },
  { name: 'iPhone SE', width: 375, height: 667, colorScheme: 'light' as const },
  { name: 'iPhone 15', width: 393, height: 852, colorScheme: 'dark' as const },
  { name: 'iPhone Pro Max', width: 430, height: 932, colorScheme: 'dark' as const },
]

interface Layout {
  width: number
  height: number
  movedX: number
  movedY: number
  spills: string[]
  slides: string[]
  cutOff: string[]
  pageOverscroll: string
}

/** Everything a finger could move, and everything that does not fit where it is drawn. */
async function measure(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const width = window.innerWidth
    const height = window.innerHeight
    const describe = (el: Element) => {
      const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''
      const text = (el.textContent ?? '').trim().slice(0, 24)
      return `${el.tagName.toLowerCase()}${cls}${text ? ` "${text}"` : ''}`
    }
    // Boxes that content must stay inside: cards, figure cells, pinned bars and each scroller's visible width.
    const BOX = '.bm-card, .bm-fig, .pinned, .bm-nav, .topbar, .home-bar'
    const spills: string[] = []
    const slides: string[] = []
    const cutOff: string[] = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      let clippedX = false
      let clippedY = false
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p)
        const pr = p.getBoundingClientRect()
        if (!clippedX && p.matches(BOX) && (r.right > pr.right + 1 || r.left < pr.left - 1)) {
          spills.push(
            `${describe(el)} spills out of ${describe(p).split(' ')[0]} [${Math.round(r.left)}–${Math.round(r.right)} in ${Math.round(pr.left)}–${Math.round(pr.right)}]`,
          )
          clippedX = true
        }
        if (s.overflowX === 'hidden' || s.overflowX === 'clip') clippedX = true
        if (s.overflowX === 'auto' || s.overflowX === 'scroll') {
          if (!clippedX && (r.right > pr.left + p.clientLeft + p.clientWidth + 1 || r.left < pr.left - 1)) {
            slides.push(`${describe(el)} is wider than its scroller ${describe(p).split(' ')[0]}`)
          }
          clippedX = true
        }
        if (s.overflowY !== 'visible') clippedY = true
        if (clippedX && clippedY) break
      }
      if (!clippedX && (r.right > width + 1 || r.left < -1))
        spills.push(`${describe(el)} is wider than the screen [${Math.round(r.left)}–${Math.round(r.right)}]`)
      // Text wider than its own box draws outside it even when the box fits (an unbreakable word, a nowrap value).
      const own = getComputedStyle(el)
      if (own.overflowX === 'visible' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && !(el instanceof SVGElement))
        spills.push(`${describe(el)} has content ${el.scrollWidth - el.clientWidth}px wider than its box`)
      if (!clippedY && r.bottom > height + 1) cutOff.push(`${describe(el)} [bottom ${Math.round(r.bottom)}]`)
      // A scroller that is wider inside than out can be dragged sideways (no screen has one on purpose).
      const s = getComputedStyle(el)
      if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1)
        slides.push(`${describe(el).split(' ')[0]} slides sideways by ${el.scrollWidth - el.clientWidth}px`)
    }
    // Try to move the page the way a drag would; it must stay put.
    window.scrollTo(500, 500)
    const movedX = window.scrollX
    const movedY = window.scrollY
    window.scrollTo(0, 0)
    return {
      width,
      height,
      movedX,
      movedY,
      spills: [...new Set(spills)].slice(0, 8),
      slides: [...new Set(slides)].slice(0, 8),
      cutOff: [...new Set(cutOff)].slice(0, 8),
      pageOverscroll: `${getComputedStyle(document.documentElement).overscrollBehaviorY}/${getComputedStyle(document.body).overscrollBehaviorY}`,
    }
  })
}

async function expectStill(page: Page, screen: string) {
  await page.evaluate(() => document.fonts.ready)
  // Let late layout (charts, the map) settle.
  await page.waitForTimeout(150)
  const m = await measure(page)
  expect.soft(m.spills, `${screen}: content spills out of its card or the ${m.width}px screen`).toEqual([])
  expect.soft(m.slides, `${screen}: content can be dragged sideways`).toEqual([])
  expect.soft(m.cutOff, `${screen}: content below the ${m.height}px screen that no scroller can reach`).toEqual([])
  expect.soft([m.movedX, m.movedY], `${screen}: the page itself moves (only the screen's scroller should)`).toEqual([0, 0])
  expect.soft(m.pageOverscroll, `${screen}: page can bounce when a scroller hits its end`).toBe('none/none')
}

const nav = (page: Page, name: 'Today' | 'Beans' | 'Journal' | 'Map') => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click()

async function setUp(page: Page) {
  await page.route('**/tile.openstreetmap.org/**', (r) => r.abort())
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: FONT_CSS }))
  await page.route('**/fonts.gstatic.com/test/**', (r) => {
    const weight =
      r
        .request()
        .url()
        .match(/manrope-(\d+)\.woff2$/)?.[1] ?? '400'
    return r.fulfill({ contentType: 'font/woff2', body: readFileSync(join(FONT_DIR, `manrope-latin-${weight}-normal.woff2`)) })
  })
  await page.route('**/api/scan', (r) => r.fulfill({ json: SCAN }))
  await page.route('**/api/recipe', (r) => r.abort('internetdisconnected'))
}

for (const phone of PHONES) {
  test.describe(`${phone.name} (${phone.width}px, ${phone.colorScheme})`, () => {
    test.use({ viewport: { width: phone.width, height: phone.height }, isMobile: true, hasTouch: true, colorScheme: phone.colorScheme })

    test('no screen spills, slides or moves under a finger', async ({ page }) => {
      await setUp(page)
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Scan your first bag' })).toBeVisible()
      expect(await page.evaluate(() => document.fonts.check('600 20px Manrope')), 'the test measures text in Manrope').toBe(true)
      await expectStill(page, 'Today, empty')

      // The key journey with a scanned label full of long values.
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
      await expectStill(page, 'Bag page, one change in clicks')
      await page.getByRole('link', { name: 'Brew again' }).click()
      await expect(page.getByRole('heading', { name: 'V60 recipe' })).toBeVisible()
      await expectStill(page, 'Recipe with one change')
      await page.getByRole('button', { name: 'Back' }).click()

      // A bag brewed once with no grind clicks: the next brew shows the grind as a word.
      // "Medium-coarse" (Brazil) is the longest grind there is.
      await page.goto('/#/review?manual')
      await expect(page.getByRole('heading', { name: 'Add a bag' })).toBeVisible()
      await expectStill(page, 'Add a bag')
      await page.getByLabel('Coffee name').fill('Fazenda Santa Ines')
      await page.getByLabel('Origin').selectOption('BR')
      await page.getByLabel('Roast', { exact: true }).selectOption('medium-light')
      await page.getByRole('button', { name: 'Save bag and make recipe' }).click()
      await expect(page.getByRole('heading', { name: 'V60 recipe' })).toBeVisible()
      await expectStill(page, 'Standard recipe')
      await page.getByRole('button', { name: 'Brewed it already? Log it' }).click()
      await page.getByRole('button', { name: 'Rate 3 of 5' }).click()
      await expectStill(page, 'Log a brew')
      await page.getByRole('button', { name: 'Save brew' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Fazenda Santa Ines' })).toBeVisible()
      await expect(page.locator('.bm-fig-value').filter({ hasText: /^Medium-coarse$/ })).toBeVisible()
      await expectStill(page, 'Bag page, grind as a word')

      await nav(page, 'Today')
      await expectStill(page, 'Today, with bags')
      await nav(page, 'Beans')
      await expectStill(page, 'Beans')
      await nav(page, 'Journal')
      await expectStill(page, 'Journal, list')
      await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Calendar' }).click()
      await expectStill(page, 'Journal, calendar')
      await nav(page, 'Map')
      await expect(page.getByText('2 countries')).toBeVisible()
      await expectStill(page, 'Map')
    })
  })
}
