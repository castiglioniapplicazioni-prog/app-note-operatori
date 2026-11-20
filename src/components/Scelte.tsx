import type { Operatore } from '../types'

interface Props {
  operatori: Operatore[]
  valore: string
  onCambia: (id: string) => void
  vuota: string // testo della prima voce (es. "Nessun destinatario")
  vuotaSelezionabile?: boolean // la prima voce si può scegliere (tornare a "nessuno")
}

// Menu a tendina degli operatori (attivi; un operatore disattivato già scelto resta visibile)
export function SceltaOperatore({ operatori, valore, onCambia, vuota, vuotaSelezionabile }: Props) {
  return (
    <select value={valore} onChange={(e) => onCambia(e.target.value)}>
      <option value="" disabled={!vuotaSelezionabile}>
        {vuota}
      </option>
      {operatori.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nome}
          {o.attivo ? '' : ' (disattivato)'}
        </option>
      ))}
    </select>
  )
}
