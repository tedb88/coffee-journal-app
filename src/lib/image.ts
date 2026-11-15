// Photo handling for the Scanner (CAP-01). One decode gives two JPEGs: the
// copy sent to the API and the copy kept on the device (Solution Plan §4.1).

export const MAX_FILE_MB = 20
/** Interim. The bake-off picks 768, 1024 or 1280 px (Solution Plan §6.3); 512 px was too small for roast dates. */
export const API_MAX_DIM = 1024
export const PHOTO_MAX_DIM = 1280

export interface PreparedImage {
  api: { base64: string; mimeType: 'image/jpeg' }
  photo: { bytes: ArrayBuffer; type: 'image/jpeg' }
  previewUrl: string
}

export function isImageFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|avif|tiff?|bmp)$/i.test(file.name)
}

export function isHeicFile(file: { type: string; name: string }): boolean {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
}

/** A user-facing reason the file cannot be used, or null. */
export function rejectReason(file: { type: string; name: string; size: number }): string | null {
  if (!isImageFile(file)) return 'Choose a photo (JPEG, PNG, WebP or HEIC).'
  const mb = file.size / (1024 * 1024)
  if (mb > MAX_FILE_MB) return `This photo is ${mb.toFixed(1)} MB. Choose one under ${MAX_FILE_MB} MB.`
  return null
}

function loadImage(src: string, timeoutMs = 15000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const timer = setTimeout(() => {
      img.src = ''
      reject(new Error('The photo took too long to open. Try a smaller one.'))
    }, timeoutMs)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error('decode'))
    }
    img.src = src
  })
}

function toJpeg(img: HTMLImageElement, maxDim: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('This photo could not be processed. Try a JPEG or PNG.'))), 'image/jpeg', quality)
  })
}

async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const url = URL.createObjectURL(file)
  let img: HTMLImageElement
  try {
    img = await loadImage(url)
  } catch (e) {
    if ((e as Error).message !== 'decode') throw e
    throw new Error(
      isHeicFile(file)
        ? 'This browser cannot open HEIC photos. On iPhone, set Settings → Camera → Formats → Most Compatible, or type the details in.'
        : 'This photo could not be opened. Try a JPEG or PNG, or type the details in.',
    )
  } finally {
    URL.revokeObjectURL(url)
  }
  const [apiBlob, photoBlob] = await Promise.all([toJpeg(img, API_MAX_DIM, 0.8), toJpeg(img, PHOTO_MAX_DIM, 0.8)])
  return {
    api: { base64: await base64Of(apiBlob), mimeType: 'image/jpeg' },
    photo: { bytes: await photoBlob.arrayBuffer(), type: 'image/jpeg' },
    previewUrl: URL.createObjectURL(photoBlob),
  }
}
