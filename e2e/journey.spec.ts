import { expect, test, type Page } from '@playwright/test'

// A valid 1×1 PNG: enough for the browser to decode, resize and store.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

const HOSTILE_NAME = 'Guji <img src=x onerror="window.__xss=1">'

const SCAN = {
  fields: {
    name: HOSTILE_NAME,
    roaster: 'Fineprint',
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
    roastDate: '2026-10-14',
    netWeightG: 200,
  },
  confidence: { name: 'high', roastDate: 'medium' },
  flags: { roastDate: 'Printed 14.10.26. Read day-first as 14 October 2026.' },
  roastDateReading: { iso: '2026-10-14', reading: 'day-first', ambiguous: true },
  labelLanguage: 'ja',
  originalName: null,
  meta: { model: 'test-model', promptVersion: 'scan.v1' },
}

async function quietMap(page: Page) {
  await page.route('**/tile.openstreetmap.org/**', (r) => r.abort())
}

async function openTab(page: Page, name: 'Scanner' | 'Journal' | 'Map') {
  await page.getByRole('tab', { name }).click()
}

test.beforeEach(async ({ page }) => {
  await quietMap(page)
})

test('scan, check, customise and save a brew; it appears in the journal and on the map', async ({ page }) => {
  await page.route('**/api/scan', (r) => r.fulfill({ json: SCAN }))
  // The recipe service is unreachable: the device builds the rules recipe (RCP-06).
  await page.route('**/api/recipe', (r) => r.abort('internetdisconnected'))
  await page.goto('/')

  await page.getByLabel('Choose a photo of the label').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: 'Analyse label' }).click()

  // Confirm: values are editable and the uncertain roast date is flagged (CAP-03, CAP-04).
  await expect(page.getByLabel('Coffee name')).toHaveValue(HOSTILE_NAME)
  await expect(page.getByText('Read day-first as 14 October 2026')).toBeVisible()
  await expect(page.getByText('translated to English (detected: Japanese)')).toBeVisible()
  await page.getByLabel('Roaster').fill('Fineprint Coffee')
  await expect(page.getByText(/g water \(1:\d+ ratio\)/)).toBeVisible()
  await page.getByRole('button', { name: 'Customize' }).click()

  await page.getByRole('button', { name: /Fruity/ }).click()
  await page.getByRole('button', { name: 'Generate recipe' }).click()

  await expect(page.getByText('Saved to Journal')).toBeVisible()
  await expect(page.getByText('You are offline, so this recipe comes from BrewMap’s brewing rules.')).toBeVisible()
  await expect(page.locator('.step-item')).toHaveCount(6) // bloom, four pours for "fruity", draw down
  await expect(page.locator('.brew-param-value').first()).toHaveText('15 g')

  await openTab(page, 'Journal')
  await page.getByRole('button', { name: 'Log' }).click()
  await expect(page.locator('.journal-entry-name')).toHaveText(HOSTILE_NAME)
  await expect(page.locator('.journal-thumb')).toBeVisible()

  await openTab(page, 'Map')
  await expect(page.getByText('1 country')).toBeVisible()
  await page.locator('.leaflet-marker-icon[title="Ethiopia"]').click()
  await expect(page.locator('.map-popup strong')).toHaveText(HOSTILE_NAME)

  // Label text is shown as text everywhere, never run as markup (MAP-02).
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()

  // Switching back keeps the result on screen.
  await openTab(page, 'Scanner')
  await expect(page.getByText('Saved to Journal')).toBeVisible()
})

test('a failed scan keeps the photo and offers manual entry (CAP-08)', async ({ page }) => {
  await page.route('**/api/scan', (r) =>
    r.fulfill({ status: 503, json: { error: 'Label reading is not available right now. Type the details in instead.', manual: true } }),
  )
  await page.route('**/api/recipe', (r) => r.fulfill({ status: 503, json: { error: 'unavailable' } }))
  await page.goto('/')

  await page.getByLabel('Choose a photo of the label').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: 'Analyse label' }).click()
  await expect(page.getByRole('alert')).toContainText('Label reading is not available right now')
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.getByRole('button', { name: 'Type the details in' }).click()

  await page.getByLabel('Coffee name').fill('Kiambu AA')
  await page.getByLabel('Origin country').selectOption('KE')
  await page.getByLabel('Roast level').selectOption('light')
  await page.getByRole('button', { name: 'Customize' }).click()
  await page.getByRole('button', { name: 'Generate recipe' }).click()

  await expect(page.getByText('Saved to Journal')).toBeVisible()
  await expect(page.getByText('AI personalisation is not available right now')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kiambu AA' })).toBeVisible()
})

test('manual entry works with no photo at all (CAP-06)', async ({ page }) => {
  await page.route('**/api/recipe', (r) => r.abort('internetdisconnected'))
  await page.goto('/')
  await page.getByRole('button', { name: 'No photo? Type the details in' }).click()
  await page.getByLabel('Coffee name').fill('House Blend')
  await page.getByRole('button', { name: 'Customize' }).click()
  await page.getByRole('button', { name: 'Generate recipe' }).click()
  await expect(page.getByText('Saved to Journal')).toBeVisible()
})

test('an existing journal moves to the new storage on first launch (JRN-05)', async ({ page }) => {
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
  await openTab(page, 'Journal')
  await page.getByRole('button', { name: 'Log' }).click()
  await expect(page.locator('.journal-entry-name')).toHaveText('Old Colombia')
  await page.getByRole('button', { name: 'Expand brew guide' }).click()
  await expect(page.getByText('Rinse the filter.')).toBeVisible()

  // The old key is left in place as a safety copy, and a reload does not duplicate the entry.
  expect(await page.evaluate(() => localStorage.getItem('brewmap_journal'))).toContain('Old Colombia')
  await page.reload()
  await openTab(page, 'Journal')
  await page.getByRole('button', { name: 'Log' }).click()
  await expect(page.locator('.journal-entry-name')).toHaveCount(1)

  await openTab(page, 'Map')
  await expect(page.getByText('1 country')).toBeVisible()
})

test('deleting asks first, then removes the brew', async ({ page }) => {
  await page.route('**/api/recipe', (r) => r.abort('internetdisconnected'))
  await page.goto('/')
  await page.getByRole('button', { name: 'No photo? Type the details in' }).click()
  await page.getByLabel('Coffee name').fill('To Delete')
  await page.getByRole('button', { name: 'Customize' }).click()
  await page.getByRole('button', { name: 'Generate recipe' }).click()
  await expect(page.getByText('Saved to Journal')).toBeVisible()

  await openTab(page, 'Journal')
  await page.getByRole('button', { name: 'Log' }).click()
  page.once('dialog', (d) => d.dismiss())
  await page.getByRole('button', { name: 'Delete entry' }).click()
  await expect(page.locator('.journal-entry-name')).toHaveText('To Delete')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete entry' }).click()
  await expect(page.getByText('No brews saved yet.').first()).toBeVisible()
})
