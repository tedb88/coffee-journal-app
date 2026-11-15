import { expect, test, type Page } from '@playwright/test'

// A valid 1×1 PNG: enough for the browser to decode, resize and store.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const HOSTILE_NAME = 'Hambela <img src=x onerror="window.__xss=1">'
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

const SCAN = {
  fields: {
    name: HOSTILE_NAME,
    roaster: 'Fernleaf',
    originCountry: 'ET',
    originName: 'Ethiopia',
    originRaw: 'Ethiopia, Guji',
    region: 'Guji',
    producer: null,
    varieties: ['74110'],
    process: 'washed',
    roastLevel: 'light',
    altitude: { minM: 1900, maxM: 2100 },
    labelNotes: ['jasmine', 'peach'],
    roastDate: daysAgo(9),
    netWeightG: 200,
  },
  confidence: { name: 'high', roastDate: 'medium' },
  flags: { roastDate: 'Printed 14.10.26. Read day-first as 14 October 2026.' },
  roastDateReading: { iso: daysAgo(9), reading: 'day-first', ambiguous: true },
  labelLanguage: 'ja',
  originalName: null,
  meta: { model: 'test-model', promptVersion: 'scan.v1' },
}

async function setUp(page: Page, opts: { scan?: 'ok' | 'fail'; recipe?: 'offline' | 'unavailable' | 'ai' } = {}) {
  await page.route('**/tile.openstreetmap.org/**', (r) => r.abort())
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort())
  if (opts.scan === 'ok') await page.route('**/api/scan', (r) => r.fulfill({ json: SCAN }))
  if (opts.scan === 'fail')
    await page.route('**/api/scan', (r) =>
      r.fulfill({ status: 503, json: { error: 'Label reading is not available right now. Type the details in instead.', manual: true } }),
    )
  if (opts.recipe === 'offline') await page.route('**/api/recipe', (r) => r.abort('internetdisconnected'))
  if (opts.recipe === 'unavailable') await page.route('**/api/recipe', (r) => r.fulfill({ status: 503, json: { error: 'unavailable' } }))
}

const nav = (page: Page, name: 'Today' | 'Beans' | 'Journal' | 'Map') => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click()

test('the key journey: scan, check, recipe, guided brew, taste, and the next brew changes one thing', async ({ page }) => {
  await setUp(page, { scan: 'ok', recipe: 'offline' })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Scan your first bag' })).toBeVisible()
  await page.getByRole('link', { name: 'Scan bag' }).first().click()

  // Scan (CAP-01) → Check the label: everything editable, the unsure date flagged with its reason (CAP-03, CAP-04).
  await page.getByLabel('Choose a photo of the label').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('heading', { name: 'Check the label' })).toBeVisible()
  await expect(page.getByLabel('Coffee name')).toHaveValue(HOSTILE_NAME)
  await expect(page.getByText('Read from a label in Japanese and put into English.')).toBeVisible()
  await expect(page.getByText('Printed 14.10.26. Read day-first as 14 October 2026.')).toBeVisible()
  await page.getByRole('button', { name: "That's right" }).click()
  await expect(page.getByText('Printed 14.10.26.')).toHaveCount(0)
  await page.getByLabel('Roaster').fill('Fernleaf Roasters')
  await page.getByRole('button', { name: 'Save bag and make recipe' }).click()

  // Recipe, offline: the standard recipe from the device (RCP-06); the dose stepper rescales it (RCP-07).
  await expect(page.getByRole('heading', { name: 'V60 recipe' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Standard recipe' })).toBeVisible()
  await expect(page.getByText(/^Made for this bag: washed, light roast, day 9$/)).toBeVisible()
  await page.getByRole('button', { name: 'More coffee' }).click()
  await expect(page.getByText(/^Before you start: .* grind 16 g\.$/)).toBeVisible()
  await page.getByRole('button', { name: 'Less coffee' }).click()
  await page.getByRole('button', { name: 'Start timer' }).click()

  // Guided brew (BRW-01, BRW-04): start, see the target, skip to the end, then Taste it (BRW-07).
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByText('Pour to', { exact: true })).toBeVisible()
  await expect(page.getByText(/^\d+ g$/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  for (let i = 0; i < 20 && (await page.getByRole('button', { name: 'Skip step' }).count()); i++) await page.getByRole('button', { name: 'Skip step' }).click()
  await expect(page.getByText('Brew finished')).toBeVisible()
  await page.getByRole('button', { name: 'Taste it' }).click()

  // Taste (LOG-02) and one change for next time (DIAL-01), live.
  await expect(page.getByRole('heading', { name: 'How did it taste?' })).toBeVisible()
  await page.getByRole('button', { name: 'Rate 3 of 5' }).click()
  await page.getByRole('button', { name: 'A bit sour' }).click()
  await page.getByRole('button', { name: 'A bit weak' }).click()
  await page.getByLabel('Grind setting you used').fill('22')
  await expect(page.getByText('Grind 2 clicks finer')).toBeVisible()
  await expect(page.getByText('22 → 20 clicks')).toBeVisible()
  await page.getByRole('button', { name: 'jasmine' }).click()
  await page.getByRole('button', { name: 'Save brew' }).click()

  // Bean page: the next brew is the change (DIAL-03), with the history and the bag going down (BEAN-02, BEAN-03).
  await expect(page.getByRole('heading', { level: 1, name: HOSTILE_NAME })).toBeVisible()
  await expect(page.getByRole('paragraph').filter({ hasText: /^Grind 2 clicks finer$/ })).toBeVisible()
  await expect(page.getByText('Rated 3 of 5')).toBeVisible()
  await expect(page.getByText('a bit sour')).toBeVisible()
  await expect(page.getByText('Change: 22 → 20 clicks')).toBeVisible()
  await expect(page.getByText(/^185 g$/)).toBeVisible()
  await expect(page.getByText('Day 9 · best until')).toBeVisible()
  await page.getByRole('link', { name: 'Brew again' }).click()
  await expect(page.getByText('One change from brew 1: grind 2 clicks finer')).toBeVisible()
  await expect(page.getByText('20 clicks (was 22)')).toBeVisible()

  // Today answers what to brew next; Journal and Map list it; label text is never run as markup (MAP-02).
  await page.getByRole('button', { name: 'Back' }).click()
  await nav(page, 'Today')
  await expect(page.getByText('Brew 2: one change')).toBeVisible()
  await nav(page, 'Journal')
  await expect(page.locator('.bm-row-name')).toHaveText(HOSTILE_NAME)
  await nav(page, 'Map')
  await expect(page.getByText('1 country')).toBeVisible()
  await page.locator('.leaflet-marker-icon[title="Ethiopia"]').click()
  await expect(page.locator('.map-popup strong')).toHaveText(HOSTILE_NAME)
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
})

test('an AI recipe explains itself (AI-02)', async ({ page }) => {
  await setUp(page, { scan: 'ok' })
  await page.route('**/api/recipe', async (r) => {
    // Return the server's own rules recipe, marked as AI, to check the screen shows its reasoning.
    const res = await r.fetch()
    const body = await res.json()
    await r.fulfill({
      json: {
        recipe: { ...body.recipe, source: 'ai', rationale: 'A light washed Ethiopian likes hot water.', expectedCup: 'Floral and bright.' },
        fallback: false,
      },
    })
  })
  await page.goto('/#/scan')
  await page.getByLabel('Choose a photo of the label').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: 'Save bag and make recipe' }).click()
  await expect(page.getByRole('heading', { name: 'Why this recipe' })).toBeVisible()
  await expect(page.getByText('A light washed Ethiopian likes hot water. Floral and bright.')).toBeVisible()
})

test('a failed scan keeps the photo and lands on the form (CAP-08); Save for later puts the bag on the shelf', async ({ page }) => {
  await setUp(page, { scan: 'fail' })
  await page.goto('/#/scan')
  await page.getByLabel('Choose a photo of the label').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('alert')).toContainText('Label reading is not available right now')
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.getByAltText('Your photo of the bag')).toBeVisible()
  await page.getByRole('button', { name: 'Save for later' }).click()
  await expect(page.getByText('Give the coffee a name')).toBeVisible()
  await page.getByLabel('Coffee name').fill('Kiambu AA')
  await page.getByLabel('Origin').selectOption('KE')
  await page.getByRole('button', { name: '250 g' }).click()
  await page.getByRole('button', { name: 'Save for later' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.locator('.bm-row-name')).toHaveText('Kiambu AA')
  await expect(page.getByText('250 g')).toBeVisible()
})

test('manual entry with no photo, then a brew logged without the timer (CAP-06, LOG-04)', async ({ page }) => {
  await setUp(page, { recipe: 'unavailable' })
  await page.goto('/')
  await page.getByRole('link', { name: 'Type it in' }).click()
  await expect(page.getByRole('heading', { name: 'Add a bag' })).toBeVisible()
  await page.getByLabel('Coffee name').fill('House Blend')
  await page.getByLabel('Roast', { exact: true }).selectOption('medium')
  await page.getByRole('button', { name: 'Save bag and make recipe' }).click()
  await expect(page.getByText('AI personalisation is not available right now')).toBeVisible()
  await page.getByRole('button', { name: 'Brewed it already? Log it' }).click()
  await page.getByLabel('Brew time (m:ss)').fill('3:30')
  await page.getByRole('button', { name: 'Rate 4 of 5' }).click()
  await page.getByRole('button', { name: 'Save brew' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'House Blend' })).toBeVisible()
  await expect(page.getByText('Rated 4 of 5')).toBeVisible()
  await expect(page.getByText(/· 3:30$/)).toBeVisible()
  await expect(page.getByText('Brew it the same way')).toBeVisible()
})

test('an existing journal moves to the new storage once (JRN-05)', async ({ page }) => {
  await setUp(page)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem(
      'brewmap_journal',
      JSON.stringify([
        {
          id: '1700000000000-abcde',
          savedAt: '2026-09-01T08:00:00.000Z',
          name: 'Old Colombia',
          origin: 'Colombia',
          roastLevel: 'Medium',
          process: 'Washed',
          tastingNotes: ['caramel'],
          brewGuide: {
            coffeeAmount: '15g',
            waterAmount: '240ml',
            ratio: '1:16',
            waterTemp: '93°C',
            grindSize: 'Medium',
            totalTime: '3:10',
            steps: [{ name: 'Bloom', water: '30ml', waitUntil: '0:30', notes: 'Saturate.' }],
            tips: 'Rinse the filter.',
          },
        },
      ]),
    )
  })
  await page.goto('/')
  await nav(page, 'Journal')
  await expect(page.locator('.bm-row-name')).toHaveText('Old Colombia')
  await expect(page.getByText('15g · 240ml · 93°C · 3:10')).toBeVisible()
  await page.reload()
  await expect(page.locator('.bm-row-name')).toHaveCount(1)
  expect(await page.evaluate(() => localStorage.getItem('brewmap_journal'))).toContain('Old Colombia')
  await page.locator('.bm-row').click()
  await expect(page.getByText('Brew it with a new recipe')).toBeVisible()
  await nav(page, 'Map')
  await expect(page.getByText('1 country')).toBeVisible()
})

test('deleting asks first and can be undone (LOG-05)', async ({ page }) => {
  await setUp(page, { recipe: 'offline' })
  await page.goto('/#/review?manual')
  await page.getByLabel('Coffee name').fill('To Delete')
  await page.getByRole('button', { name: 'Save bag and make recipe' }).click()
  await page.getByRole('button', { name: 'Brewed it already? Log it' }).click()
  await page.getByRole('button', { name: 'Save brew' }).click()
  await expect(page.getByText('Not rated')).toBeVisible()

  page.once('dialog', (d) => d.dismiss())
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('Not rated')).toBeVisible()

  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('Brew 1 deleted')).toBeVisible()
  await expect(page.getByText('Not rated')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Not rated')).toBeVisible()

  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete this bag' }).click()
  await expect(page.getByRole('heading', { name: 'Beans' })).toBeVisible()
  await expect(page.getByText('No bags yet')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.bm-row-name')).toHaveText('To Delete')
})

test('every screen has one title and the brew screen uses brew mode', async ({ page }) => {
  await setUp(page, { recipe: 'offline' })
  await page.goto('/#/review?manual')
  await page.getByLabel('Coffee name').fill('Check')
  await page.getByRole('button', { name: 'Save bag and make recipe' }).click()
  for (const path of ['#/', '#/beans', '#/journal', '#/map', '#/scan']) {
    await page.goto(`/${path}`)
    await expect(page.locator('h1')).toHaveCount(1)
  }
  await page.goto('/#/beans')
  await page.locator('.bm-row').click()
  await page.getByRole('link', { name: 'Make a recipe' }).click()
  await page.getByRole('button', { name: 'Start timer' }).click()
  await expect(page.locator('main[data-theme="dark"]')).toBeVisible()
  const bg = await page.locator('main').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(bg).toBe('rgb(12, 13, 14)')
})
