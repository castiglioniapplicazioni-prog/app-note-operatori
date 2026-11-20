// Funzioni comuni per usare la fotocamera dentro l'app (scanner dal vivo e scatto foto).

export function fotocameraDisponibile(): boolean {
  return window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia)
}

export function messaggioFotocamera(err: unknown, alternativa = ''): string {
  const nome = (err as { name?: string }).name
  if (nome === 'NotAllowedError') {
    return `Permesso per la fotocamera negato. Consentilo nelle impostazioni del browser${alternativa}.`
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'Fotocamera non trovata.'
  return 'Impossibile avviare la fotocamera.'
}

// Fotocamera posteriore principale: si scartano ultra-grandangolo, grandangolo, tele, macro.
// I nomi sono disponibili solo dopo il permesso.
export async function fotocameraPrincipale(): Promise<string | null> {
  const video = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
  if (!video.length || video.some((d) => !d.label)) return null
  const posteriori = video.filter((d) => /back|rear|environment|posterior|trasera|arrière/i.test(d.label))
  const candidate = posteriori.length ? posteriori : video
  const principali = candidate.filter((d) => !/ultra|wide|grandangol|tele|macro|depth|dual|triple/i.test(d.label))
  const elenco = principali.length ? principali : candidate
  // Android: la principale è di norma la prima ("camera2 0, facing back")
  return [...elenco].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))[0].deviceId
}

// Apre la fotocamera posteriore principale con la risoluzione indicata
export async function apriFotocamera(larghezza: number, altezza: number): Promise<MediaStream> {
  const apri = (deviceId: string | null) =>
    navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: larghezza },
        height: { ideal: altezza },
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
      },
    })
  // se il permesso c'è già si conosce subito la principale; altrimenti si apre
  // la posteriore e, avuto il permesso, si passa alla principale se è un'altra
  let scelta = await fotocameraPrincipale().catch(() => null)
  let flusso = await apri(scelta)
  if (!scelta) {
    scelta = await fotocameraPrincipale().catch(() => null)
    const attuale = flusso.getVideoTracks()[0].getSettings().deviceId
    if (scelta && scelta !== attuale) {
      flusso.getTracks().forEach((t) => t.stop())
      flusso = await apri(scelta)
    }
  }
  return flusso
}
