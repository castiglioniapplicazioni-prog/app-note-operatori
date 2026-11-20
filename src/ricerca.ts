import type { Liste, Nota } from './types'

export function nomeOperatore(liste: Liste, id: string | null): string {
  if (!id) return ''
  return liste.operatori.find((o) => o.id === id)?.nome ?? '?'
}

export function nomeAzione(liste: Liste, id: string | null): string {
  if (!id) return ''
  return liste.azioni.find((a) => a.id === id)?.nome ?? ''
}

function semplifica(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Ricerca in: codice nota, commessa, bancale, testo, nome operatore (autore o destinatario), nome azione.
// Più parole: devono esserci tutte.
export function corrisponde(nota: Nota, liste: Liste, testo: string): boolean {
  const parole = semplifica(testo).split(/\s+/).filter(Boolean)
  if (!parole.length) return true
  const campo = semplifica(
    [
      nota.codice,
      nota.rif_commessa,
      nota.rif_bancale,
      nota.testo,
      nomeOperatore(liste, nota.autore_id),
      nomeOperatore(liste, nota.destinatario_id),
      nomeAzione(liste, nota.azione_id),
    ]
      .filter(Boolean)
      .join(' '),
  )
  return parole.every((p) => campo.includes(p))
}

export function contaFoto(nota: Nota): number {
  return nota.allegati.filter((a) => a.tipo === 'foto').length
}

export function contaCommenti(nota: Nota): number {
  return nota.commenti[0]?.count ?? 0
}
