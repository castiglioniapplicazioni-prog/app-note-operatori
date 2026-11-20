import { DURATA_LINK_CSV } from './config'
import { dataBreve, dataOra, oggi } from './format'
import { contaCommenti, nomeAzione, nomeOperatore } from './ricerca'
import { caricaCommentiDi, linkFirmati, percorsoMiniatura } from './supabase'
import type { Commento, Liste, Nota } from './types'

// ---------- CSV per Excel italiano: separatore ";" e BOM UTF-8 ----------

function cella(v: string | number | null | undefined): string {
  const t = String(v ?? '')
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

function raggruppa(commenti: Commento[]): Map<string, Commento[]> {
  const m = new Map<string, Commento[]>()
  for (const c of commenti) m.set(c.nota_id, [...(m.get(c.nota_id) ?? []), c])
  return m
}

export async function scaricaCsv(note: Nota[], liste: Liste) {
  const [commenti, link] = await Promise.all([
    caricaCommentiDi(note.map((n) => n.id)),
    linkFirmati(note.flatMap((n) => n.allegati.map((a) => a.storage_path)), DURATA_LINK_CSV),
  ])
  const perNota = raggruppa(commenti)
  const intestazione = [
    'Data', 'N° nota', 'Commessa', 'Bancale', 'Operatore', 'Destinatario', 'Azione', 'Stato',
    'Chiusa il', 'Chiusa da', 'Testo', 'N° commenti', 'Commenti', 'Foto', 'Vocali',
  ]
  const righe = note.map((n) => {
    const c = perNota.get(n.id) ?? []
    return [
      dataBreve(n.data),
      n.codice,
      n.rif_commessa,
      n.rif_bancale,
      nomeOperatore(liste, n.autore_id),
      nomeOperatore(liste, n.destinatario_id),
      nomeAzione(liste, n.azione_id),
      n.chiusa ? 'Chiusa' : 'Aperta',
      n.chiusa_at ? dataOra(n.chiusa_at) : '',
      nomeOperatore(liste, n.chiusa_da),
      n.testo,
      c.length,
      c.map((x) => `${dataOra(x.created_at)} ${nomeOperatore(liste, x.operatore_id)}: ${x.testo}`).join(' | '),
      n.allegati.filter((a) => a.tipo === 'foto').map((a) => link[a.storage_path]).filter(Boolean).join(' '),
      n.allegati.filter((a) => a.tipo === 'vocale').map((a) => link[a.storage_path]).filter(Boolean).join(' '),
    ]
  })
  const testo = '﻿' + [intestazione, ...righe].map((r) => r.map(cella).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([testo], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `note-${oggi()}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ---------- Stampa / PDF (finestra nuova, poi "Stampa" → "Salva come PDF") ----------

function esc(t: string | null | undefined): string {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const STILE = `
  @page { size: A4; margin: 14mm; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1c1f24; font-size: 12px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 4px; color: #2e7d32; }
  .testata { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2e7d32; padding-bottom: 6px; margin-bottom: 10px; }
  .testata img { height: 40px; }
  table.dati { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
  table.dati th { text-align: left; color: #6b7280; font-weight: 600; width: 28%; padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
  table.dati td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
  .testo { white-space: pre-wrap; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px; margin-bottom: 10px; }
  h2 { font-size: 14px; margin: 12px 0 6px; }
  .commento { border-bottom: 1px solid #e5e7eb; padding: 4px 0; }
  .commento b { margin-right: 6px; }
  .commento span { color: #6b7280; }
  .foto { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .foto img { width: 100%; max-height: 120mm; object-fit: contain; border: 1px solid #e5e7eb; break-inside: avoid; }
  table.elenco { border-collapse: collapse; width: 100%; font-size: 10.5px; }
  table.elenco th, table.elenco td { border: 1px solid #d1d5db; padding: 3px 4px; vertical-align: top; text-align: left; }
  table.elenco th { background: #e8f5e9; }
  table.elenco tr { break-inside: avoid; }
  .mini img { width: 34px; height: 34px; object-fit: cover; margin: 1px; }
  .piede { color: #6b7280; font-size: 10px; margin-top: 10px; }
`

// Scrive la pagina nella finestra e stampa quando tutte le foto sono caricate
function stampaIn(finestra: Window, titolo: string, corpo: string) {
  const logo = new URL('./logo.png', location.href).href
  finestra.document.open()
  finestra.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(titolo)}</title>
    <style>${STILE}</style></head><body>
    <div class="testata"><h1>${esc(titolo)}</h1><img src="${logo}" alt=""></div>${corpo}
    <p class="piede">Stampato il ${esc(dataOra(new Date().toISOString()))}</p></body></html>`)
  finestra.document.close()
  const immagini = Array.from(finestra.document.images)
  Promise.all(
    immagini.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r }))),
  ).then(() => {
    finestra.focus()
    finestra.print()
  })
}

// Va chiamata subito al click (altrimenti il browser blocca la finestra)
export function apriFinestraStampa(): Window | null {
  const f = window.open('', '_blank')
  if (f) f.document.write('<p style="font-family:sans-serif">Preparazione della stampa…</p>')
  return f
}

export async function stampaNota(finestra: Window, nota: Nota, liste: Liste, commenti: Commento[]) {
  const foto = nota.allegati.filter((a) => a.tipo === 'foto')
  const link = await linkFirmati(foto.map((a) => a.storage_path))
  const riga = (t: string, v: string | null | undefined) => `<tr><th>${t}</th><td>${esc(v) || '—'}</td></tr>`
  const corpo = `
    <table class="dati">
      ${riga('Numero', nota.codice)}
      ${riga('Data', dataBreve(nota.data))}
      ${riga('Stato', nota.chiusa ? `Chiusa${nota.chiusa_at ? ' il ' + dataOra(nota.chiusa_at) : ''}${nota.chiusa_da ? ' da ' + nomeOperatore(liste, nota.chiusa_da) : ''}` : 'Aperta')}
      ${riga('Commessa', nota.rif_commessa)}
      ${riga('Bancale', nota.rif_bancale)}
      ${riga('Operatore', nomeOperatore(liste, nota.autore_id))}
      ${riga('Destinatario', nomeOperatore(liste, nota.destinatario_id))}
      ${riga('Azione', nomeAzione(liste, nota.azione_id))}
    </table>
    ${nota.testo ? `<div class="testo">${esc(nota.testo)}</div>` : ''}
    <h2>Commenti (${commenti.length})</h2>
    ${commenti.map((c) => `<div class="commento"><b>${esc(nomeOperatore(liste, c.operatore_id))}</b><span>${esc(dataOra(c.created_at))}</span><div>${esc(c.testo)}</div></div>`).join('') || '<p>Nessun commento.</p>'}
    ${foto.length ? `<h2>Foto (${foto.length})</h2><div class="foto">${foto.map((a) => link[a.storage_path] ? `<img src="${link[a.storage_path]}">` : '').join('')}</div>` : ''}
  `
  stampaIn(finestra, `Nota ${nota.codice}`, corpo)
}

export async function stampaElenco(finestra: Window, note: Nota[], liste: Liste, descrizioneFiltri: string) {
  const mini = note.flatMap((n) => n.allegati.filter((a) => a.tipo === 'foto').slice(0, 4).map((a) => percorsoMiniatura(a.storage_path)))
  const link = await linkFirmati(mini)
  const righe = note
    .map((n) => {
      const foto = n.allegati.filter((a) => a.tipo === 'foto')
      return `<tr>
        <td>${esc(dataBreve(n.data))}</td><td>${esc(n.codice)}</td><td>${esc(n.rif_commessa)}</td><td>${esc(n.rif_bancale)}</td>
        <td>${esc(nomeOperatore(liste, n.autore_id))}</td><td>${esc(nomeOperatore(liste, n.destinatario_id))}</td>
        <td>${esc(nomeAzione(liste, n.azione_id))}</td><td>${n.chiusa ? 'Chiusa' : 'Aperta'}</td>
        <td>${esc(n.testo)}</td><td>${contaCommenti(n)}</td>
        <td class="mini">${foto.slice(0, 4).map((a) => { const u = link[percorsoMiniatura(a.storage_path)]; return u ? `<img src="${u}">` : '' }).join('')}${foto.length > 4 ? ` +${foto.length - 4}` : ''}</td>
      </tr>`
    })
    .join('')
  const corpo = `<p>${esc(descrizioneFiltri)} — ${note.length} note</p>
    <table class="elenco"><thead><tr><th>Data</th><th>N° nota</th><th>Commessa</th><th>Bancale</th><th>Operatore</th>
    <th>Destinatario</th><th>Azione</th><th>Stato</th><th>Testo</th><th>Comm.</th><th>Foto</th></tr></thead><tbody>${righe}</tbody></table>`
  stampaIn(finestra, 'Archivio note', corpo)
}
