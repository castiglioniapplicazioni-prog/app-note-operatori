import type { Nota, Operatore } from './types'

// Stesse regole del database (trigger note_before_update e policy RLS):
// autore = account che ha creato la nota oppure operatore indicato come autore
export function isAutore(nota: Nota, io: Operatore): boolean {
  return nota.created_by === io.auth_user_id || nota.autore_id === io.id
}

// Modificare commessa, bancale, destinatario, testo; eliminare nota, foto, vocali
export function puoModificare(nota: Nota, io: Operatore): boolean {
  return io.is_admin || isAutore(nota, io)
}
