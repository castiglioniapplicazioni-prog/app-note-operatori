import { BrowserMultiFormatReader } from '@zxing/browser'
import { FORMATI_NATIVI, suggerimentiZxing } from './codici'

// Legge un codice a barre / QR / Data Matrix da una foto scattata con la fotocamera
// del telefono (che ha autofocus vero e messa a fuoco da vicino).
// Caricato solo quando serve (zxing è una libreria grande).

// lati massimi provati: le foto del telefono sono enormi e zxing va meglio su immagini medie
const DIMENSIONI = [1600, 1000, 2400, 700]
// codici storti o verticali: si prova anche ruotando l'immagine
const ROTAZIONI = [0, 90, 180, 270, 45, 315]

function disegna(foto: ImageBitmap, latoMassimo: number, rotazione: number): HTMLCanvasElement {
  const scala = Math.min(1, latoMassimo / Math.max(foto.width, foto.height))
  const w = Math.round(foto.width * scala)
  const h = Math.round(foto.height * scala)
  const rad = (rotazione * Math.PI) / 180
  const cw = Math.round(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)))
  const ch = Math.round(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, cw, ch)
  ctx.translate(cw / 2, ch / 2)
  ctx.rotate(rad)
  ctx.drawImage(foto, -w / 2, -h / 2, w, h)
  return canvas
}

type Rilevatore = { detect(s: ImageBitmap | HTMLCanvasElement): Promise<{ rawValue: string }[]> }

async function creaNativo(): Promise<Rilevatore | null> {
  const R = (window as unknown as {
    BarcodeDetector?: { new (o: { formats: string[] }): Rilevatore; getSupportedFormats(): Promise<string[]> }
  }).BarcodeDetector
  if (!R) return null
  try {
    const supportati = await R.getSupportedFormats()
    const formati = FORMATI_NATIVI.filter((f) => supportati.includes(f))
    return formati.length ? new R({ formats: formati }) : null
  } catch {
    return null
  }
}

// Lascia respirare l'interfaccia tra un tentativo e l'altro
const pausa = () => new Promise((r) => setTimeout(r, 0))

// Restituisce il testo del codice, oppure null se nella foto non se ne trova nessuno
export async function leggiCodiceDaFoto(file: Blob): Promise<string | null> {
  const foto = await createImageBitmap(file)
  try {
    const nativo = await creaNativo()
    if (nativo) {
      try {
        const codici = await nativo.detect(foto)
        if (codici[0]?.rawValue) return codici[0].rawValue
      } catch {
        // si passa a zxing
      }
    }
    const lettore = new BrowserMultiFormatReader(suggerimentiZxing())
    for (const rotazione of ROTAZIONI) {
      for (const lato of DIMENSIONI) {
        await pausa()
        try {
          return lettore.decodeFromCanvas(disegna(foto, lato, rotazione)).getText()
        } catch {
          // nessun codice a questa dimensione/rotazione: si prova la successiva
        }
      }
    }
    return null
  } finally {
    foto.close()
  }
}
