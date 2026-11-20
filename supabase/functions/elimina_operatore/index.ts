// Elimina un operatore che ha già fatto l'accesso (solo admin): cancella
// l'utente Supabase Auth e poi la riga in operatori.
// Non elimina chi compare in note o commenti (va disattivato) né l'ultimo admin attivo.
// Gli operatori mai entrati si eliminano direttamente dall'app (policy RLS).
import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import { errore } from '../_shared/comune.ts'

export default {
  fetch: withSupabase({ auth: 'user', errors: { detailed: false } }, async (req, ctx) => {
    const { operatore_id } = await req.json().catch(() => ({}))
    const admin = ctx.supabaseAdmin

    const { data: io } = await admin
      .from('operatori')
      .select('id, is_admin, attivo')
      .eq('auth_user_id', ctx.userClaims!.id)
      .maybeSingle()
    if (!io?.attivo || !io.is_admin) {
      return errore("Solo l'admin può eliminare operatori che hanno già fatto l'accesso.", 403)
    }

    const { data: operatore } = await admin
      .from('operatori')
      .select('id, is_admin, attivo, auth_user_id')
      .eq('id', operatore_id)
      .maybeSingle()
    if (!operatore) return errore('Operatore non trovato.', 404)
    if (operatore.id === io.id) return errore('Non puoi eliminare te stesso.')

    // controlli PRIMA di cancellare l'accesso, per non lasciarlo a metà
    for (const [tabella, colonna] of [['note', 'autore_id'], ['note', 'destinatario_id'], ['commenti', 'operatore_id']]) {
      const { count, error } = await admin
        .from(tabella)
        .select('id', { count: 'exact', head: true })
        .eq(colonna, operatore.id)
      if (error) return errore('Errore del database, riprova.', 500)
      if (count) {
        return errore('Questo operatore compare in note o commenti: non si può eliminare, disattivalo.', 409)
      }
    }
    if (operatore.is_admin && operatore.attivo) {
      const { count } = await admin
        .from('operatori')
        .select('id', { count: 'exact', head: true })
        .eq('is_admin', true)
        .eq('attivo', true)
        .neq('id', operatore.id)
      if (!count) return errore('Deve restare almeno un amministratore attivo.', 409)
    }

    if (operatore.auth_user_id) {
      const { error } = await admin.auth.admin.deleteUser(operatore.auth_user_id)
      if (error) return errore('Impossibile eliminare l\'accesso: ' + error.message, 500)
      // di norma già azzerato dalla chiave esterna (on delete set null); qui per sicurezza
      await admin.from('operatori').update({ auth_user_id: null }).eq('id', operatore.id)
    }

    const { error } = await admin.from('operatori').delete().eq('id', operatore.id)
    if (error) return errore('Accesso eliminato, ma operatore non eliminato: ' + error.message, 500)

    return Response.json({ ok: true })
  }),
}
