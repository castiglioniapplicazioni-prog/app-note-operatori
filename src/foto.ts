import { FOTO_LATO_MASSIMO, FOTO_QUALITA, MINIATURA_LATO } from './config'

// Ridimensiona e comprime una foto (lato lungo 1920px, JPEG 0.8) e ne crea la miniatura.
// createImageBitmap applica l'orientamento della foto (EXIF).
async function ridimensiona(foto: ImageBitmap, lato: number, qualita: number): Promise<Blob> {
  const scala = Math.min(1, lato / Math.max(foto.width, foto.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(foto.width * scala)
  canvas.height = Math.round(foto.height * scala)
  canvas.getContext('2d')!.drawImage(foto, 0, 0, canvas.width, canvas.height)
  return new Promise((ok, ko) =>
    canvas.toBlob((b) => (b ? ok(b) : ko(new Error('Foto non leggibile'))), 'image/jpeg', qualita),
  )
}

export async function preparaFoto(file: Blob): Promise<{ foto: Blob; miniatura: Blob }> {
  let immagine: ImageBitmap
  try {
    immagine = await createImageBitmap(file)
  } catch {
    throw new Error('Formato della foto non supportato da questo browser.')
  }
  try {
    return {
      foto: await ridimensiona(immagine, FOTO_LATO_MASSIMO, FOTO_QUALITA),
      miniatura: await ridimensiona(immagine, MINIATURA_LATO, 0.75),
    }
  } finally {
    immagine.close()
  }
}
