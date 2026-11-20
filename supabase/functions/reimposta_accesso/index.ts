// Reimposta accesso (password dimenticata): elimina l'utente Supabase Auth
// dell'operatore e azzera il collegamento; al prossimo accesso l'operatore
// crea una nuova password. I suoi record restano (sono legati a operatori.id).
// Solo admin, per chiunque tranne sé stesso.
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
      return errore('Non hai i permessi per questa operazione.', 403)
    }

    const { data: operatore } = await admin
      .from('operatori')
      .select('id, auth_user_id')
      .eq('id', operatore_id)
      .maybeSingle()
    if (!operatore) return errore('Operatore non trovato.', 404)
    if (operatore.id === io.id) {
      return errore('Non puoi reimpostare il tuo accesso: usa "Cambia password".')
    }
    if (!operatore.auth_user_id) return Response.json({ ok: true })

    const { error } = await admin.auth.admin.deleteUser(operatore.auth_user_id)
    if (error) return errore('Impossibile reimpostare: ' + error.message, 500)
    // di norma già azzerato dalla chiave esterna (on delete set null); qui per sicurezza
    await admin.from('operatori').update({ auth_user_id: null }).eq('id', operatore.id)

    return Response.json({ ok: true })
  }),
}
