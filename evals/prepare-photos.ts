// Prepares label photos for the bake-off (Solution Plan §6.3): writes JPEG
// copies at 768, 1024 and 1280 px beside the originals, using the same
// browser canvas resize the app uses, and prints each original's SHA-256
// for the ground-truth file. Photos stay outside the repository.
//
//   npx tsx evals/prepare-photos.ts <photos-dir>

import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { chromium } from '@playwright/test'

const SIZES = [768, 1024, 1280]
const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

async function main() {
  const dir = process.argv[2]
  if (!dir) throw new Error('Usage: npx tsx evals/prepare-photos.ts <photos-dir>')
  const files = readdirSync(dir).filter((f) => TYPES[extname(f).toLowerCase()])
  for (const size of SIZES) mkdirSync(join(dir, String(size)), { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage()
  for (const file of files) {
    const bytes = readFileSync(join(dir, file))
    const dataUrl = `data:${TYPES[extname(file).toLowerCase()]};base64,${bytes.toString('base64')}`
    for (const size of SIZES) {
      const out: string = await page.evaluate(
        async ({ src, max }) => {
          const img = new Image()
          img.src = src
          await img.decode()
          const scale = Math.min(1, max / Math.max(img.width, img.height))
          const c = document.createElement('canvas')
          c.width = Math.round(img.width * scale)
          c.height = Math.round(img.height * scale)
          c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
          return c.toDataURL('image/jpeg', 0.8).split(',')[1]
        },
        { src: dataUrl, max: size },
      )
      writeFileSync(join(dir, String(size), file.replace(/\.\w+$/, '.jpg')), Buffer.from(out, 'base64'))
    }
    console.log(`${file}\t${createHash('sha256').update(bytes).digest('hex')}`)
  }
  await browser.close()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
