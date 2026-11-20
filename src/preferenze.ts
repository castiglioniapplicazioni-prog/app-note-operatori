// Piccole preferenze ricordate sul dispositivo (localStorage)

const CHIAVE_OPERATORE = 'ultimo-operatore'

export function ultimoOperatore(): string | null {
  try {
    return localStorage.getItem(CHIAVE_OPERATORE)
  } catch {
    return null
  }
}

export function ricordaOperatore(id: string) {
  try {
    localStorage.setItem(CHIAVE_OPERATORE, id)
  } catch {
    // non indispensabile
  }
}
