// Icone semplici disegnate in SVG (nessuna libreria esterna)
const percorsi = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  chiudi: 'M6 6l12 12M18 6L6 18',
  chiave: 'M15 7a4 4 0 11-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0115 7z',
  esci: 'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H4',
  persona: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a7 7 0 0114 0v1',
  persone: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M17 11a3 3 0 100-6M22 21v-1a5 5 0 00-4-4.9',
  indietro: 'M15 18l-6-6 6-6',
  cestino: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  matita: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  aggiorna: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  piu: 'M12 5v14M5 12h14',
  cerca: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  codice: 'M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8',
  fotocamera: 'M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1zM12 17a4 4 0 100-8 4 4 0 000 8z',
  galleria: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  microfono: 'M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zM5 11a7 7 0 0014 0M12 18v3',
  allega: 'M21 11l-8.5 8.5a5 5 0 01-7-7L14 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 7',
  commento: 'M4 5h16v11H8l-4 4V5z',
  freccia: 'M5 12h14M13 6l6 6-6 6',
  aperte: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  chiuse: 'M4 4h16v16H4zM8 12l3 3 5-6',
  liste: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  archivio: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  stampa: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M6 14h12v7H6z',
  scarica: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  stop: 'M6 6h12v12H6z',
}

export type NomeIcona = keyof typeof percorsi

export default function Icona({ nome, dimensione = 24 }: { nome: NomeIcona; dimensione?: number }) {
  return (
    <svg
      width={dimensione}
      height={dimensione}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={percorsi[nome]} />
    </svg>
  )
}
