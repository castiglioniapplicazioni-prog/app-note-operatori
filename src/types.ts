export type StatoAccesso = 'nuovo' | 'attivo' | 'disattivato' | 'sconosciuto'

export interface Operatore {
  id: string
  codice: string | null
  nome: string
  email: string | null
  telefono: string | null
  auth_user_id: string | null
  is_admin: boolean
  attivo: boolean
  created_at: string
}

export interface Azione {
  id: string
  nome: string
  attiva: boolean
  ordine: number
}

export interface Allegato {
  id: string
  nota_id: string
  tipo: 'foto' | 'vocale'
  storage_path: string
  filename: string | null
  mime_type: string | null
  created_at: string
}

export interface Commento {
  id: string
  nota_id: string
  operatore_id: string
  testo: string
  created_at: string
}

export interface Nota {
  id: string
  codice: string
  data: string // AAAA-MM-GG
  autore_id: string
  destinatario_id: string | null
  rif_commessa: string | null
  rif_bancale: string | null
  azione_id: string | null
  testo: string | null
  chiusa: boolean
  chiusa_at: string | null
  chiusa_da: string | null
  presa_in_carico: boolean
  presa_in_carico_at: string | null
  presa_in_carico_da: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  allegati: Allegato[]
  commenti: { count: number }[]
}

// Campi modificabili dall'autore o dall'admin
export interface DatiNota {
  autore_id: string
  destinatario_id: string | null
  rif_commessa: string
  rif_bancale: string
  azione_id: string | null
  testo: string
}

// Elenchi usati da tutte le schermate (nomi di operatori e azioni)
export interface Liste {
  operatori: Operatore[]
  azioni: Azione[]
}
