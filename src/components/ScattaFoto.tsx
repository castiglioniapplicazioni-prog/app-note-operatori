import { useEffect, useRef, useState } from 'react'
import { FOTO_LATO_MASSIMO } from '../config'
import { apriFotocamera, messaggioFotocamera } from '../fotocamera'

// Fotocamera dentro l'app per le foto delle note.
// Non si usa la fotocamera di sistema: su Android, mentre è aperta, il telefono può chiudere
// il browser per liberare memoria ("Memoria insufficiente…") e la foto va persa.
// Si possono scattare più foto di fila; "Fine" chiude.

interface Props {
  onScattata: (foto: Blob) => void
  onChiudi: () => void
}

export default function ScattaFoto({ onScattata, onChiudi }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const traccia = useRef<MediaStreamTrack | null>(null)
  const [pronta, setPronta] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [scattate, setScattate] = useState(0)
  const [lampo, setLampo] = useState(false)
  const [torcia, setTorcia] = useState<boolean | null>(null) // null = non supportata

  useEffect(() => {
    let flusso: MediaStream | undefined
    let chiuso = false
    const ferma = () => flusso?.getTracks().forEach((t) => t.stop())

    async function avvia() {
      try {
        flusso = await apriFotocamera(FOTO_LATO_MASSIMO, (FOTO_LATO_MASSIMO * 3) / 4)
      } catch (err) {
        if (!chiuso) setErrore(messaggioFotocamera(err, ', oppure usa "Galleria"'))
        return
      }
      if (chiuso) return ferma()
      const v = video.current!
      v.srcObject = flusso
      await v.play().catch(() => {})
      const t = flusso.getVideoTracks()[0]
      traccia.current = t
      const capacita = (t.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean }
      if (capacita.focusMode?.includes('continuous')) {
        await t.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {})
      }
      if (capacita.torch) setTorcia(false)
      if (!chiuso) setPronta(true)
    }

    // piccolo ritardo: in sviluppo React monta due volte il componente
    const timer = setTimeout(avvia, 50)
    return () => {
      chiuso = true
      clearTimeout(timer)
      ferma()
      traccia.current = null
    }
  }, [])

  function scatta() {
    const v = video.current
    if (!v || !v.videoWidth) return
    const scala = Math.min(1, FOTO_LATO_MASSIMO / Math.max(v.videoWidth, v.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(v.videoWidth * scala)
    canvas.height = Math.round(v.videoHeight * scala)
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (b) => {
        canvas.width = canvas.height = 0 // libera subito la memoria
        if (!b) return
        navigator.vibrate?.(40)
        setLampo(true)
        setTimeout(() => setLampo(false), 150)
        setScattate((n) => n + 1)
        onScattata(b)
      },
      'image/jpeg',
      0.92, // la compressione definitiva (0.8) la fa preparaFoto
    )
  }

  function cambiaTorcia() {
    const accesa = !torcia
    traccia.current
      ?.applyConstraints({ advanced: [{ torch: accesa } as MediaTrackConstraintSet] })
      .then(() => setTorcia(accesa))
      .catch(() => {})
  }

  return (
    <div className="scanner">
      <div className="scanner-video">
        <video ref={video} muted autoPlay playsInline />
      </div>
      {lampo && <div className="lampo" />}
      <p className="scanner-testo">
        {errore ?? (!pronta ? 'Avvio fotocamera…' : scattate ? `Foto scattate: ${scattate}` : 'Inquadra e scatta')}
      </p>
      {torcia !== null && (
        <div className="scanner-comandi">
          <button className={`pulsante ${torcia ? 'scelto' : ''}`} onClick={cambiaTorcia}>
            Torcia
          </button>
        </div>
      )}
      {pronta && <button className="otturatore" onClick={scatta} aria-label="Scatta foto" />}
      <button className="pulsante grande scanner-annulla" onClick={onChiudi}>
        {scattate ? 'Fine' : 'Annulla'}
      </button>
    </div>
  )
}
