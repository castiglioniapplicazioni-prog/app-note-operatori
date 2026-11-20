import { BarcodeFormat, DecodeHintType } from '@zxing/library'

// Formati letti (SPEC 5.5): EAN-13/8, Code128, Code39, ITF, Codabar, QR, Data Matrix (+ Code93, UPC).
// Questo file usa zxing (libreria grande): va importato solo da moduli caricati su richiesta.
export const FORMATI_NATIVI = [
  'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'itf', 'codabar', 'qr_code', 'data_matrix',
]

const FORMATI_ZXING = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
]

export function suggerimentiZxing() {
  return new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, FORMATI_ZXING],
    [DecodeHintType.TRY_HARDER, true],
  ])
}

// Pulizia del testo letto: niente spazi ai lati né asterischi del Code 39
export function pulisciCodice(testo: string): string {
  return testo.trim().replace(/^\*+|\*+$/g, '').trim()
}
