import { useEffect, useState } from 'react'
import { getPhoto } from '../data/repositories.js'

/** An object URL for a stored photo, released when the component unmounts. */
export function usePhotoUrl(photoId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!photoId) return
    let objectUrl: string | null = null
    let live = true
    getPhoto(photoId)
      .then((p) => {
        if (!live || !p) return
        objectUrl = URL.createObjectURL(new Blob([p.bytes], { type: p.type }))
        setUrl(objectUrl)
      })
      .catch(() => setUrl(null))
    return () => {
      live = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [photoId])
  return url
}
