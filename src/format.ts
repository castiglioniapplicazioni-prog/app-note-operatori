// Date in formato gg/mm/aaaa, ore 24h, fuso Europe/Rome

const FUSO = 'Europe/Rome'

const formatoData = new Intl.DateTimeFormat('it-IT', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' })
const formatoOra = new Intl.DateTimeFormat('it-IT', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false })

// "2026-11-20" → "20/11/2026" (senza passare dai fusi orari)
export function dataBreve(giorno: string): string {
  const [a, m, g] = giorno.slice(0, 10).split('-')
  return `${g}/${m}/${a}`
}

// istante (timestamptz) → "20/11/2026 14:05"
export function dataOra(istante: string): string {
  const d = new Date(istante)
  return `${formatoData.format(d)} ${formatoOra.format(d)}`
}

export function ora(istante: string): string {
  return formatoOra.format(new Date(istante))
}

// Oggi a Roma come "AAAA-MM-GG"
export function oggi(): string {
  const parti = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })
  return parti.format(new Date())
}

export function plurale(n: number, uno: string, tanti: string): string {
  return `${n} ${n === 1 ? uno : tanti}`
}
