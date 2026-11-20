import { useEffect, useState } from 'react'
import { linkFirmati, percorsoMiniatura } from '../supabase'
import type { Allegato } from '../types'

// Link firmati per foto (grande + miniatura) e vocali di un elenco di allegati
export function useLink(allegati: Allegato[], conMiniature = true): Record<string, string> {
  const [link, setLink] = useState<Record<string, string>>({})
  const chiave = allegati.map((a) => a.storage_path).join('|')

  useEffect(() => {
    if (!allegati.length) return
    let annullato = false
    const percorsi = allegati.flatMap((a) =>
      a.tipo === 'foto' && conMiniature ? [a.storage_path, percorsoMiniatura(a.storage_path)] : [a.storage_path],
    )
    linkFirmati(percorsi)
      .then((l) => !annullato && setLink((prima) => ({ ...prima, ...l })))
      .catch(() => {})
    return () => {
      annullato = true
    }
  }, [chiave, conMiniature]) // eslint-disable-line react-hooks/exhaustive-deps

  return link
}
