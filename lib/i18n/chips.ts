import type { Lang } from '../contracts';

/**
 * Suggested-prompt chips, sent verbatim as the user's message. Shared by the UI (components) and by the
 * evals/recordings, so the replay keys of the demo chips always match what the UI sends.
 * Order = demo order: search, visit, documents, contract, deposit, first rent.
 * Changing a string here means re-recording the search chip (its listings recording is keyed by the text).
 */
export const CHIP_TEXT: Record<Lang, readonly [string, string, string, string, string, string]> = {
  en: [
    '2-bedroom near Tres Cerritos, under 500 USDC, pets ok',
    'Book a visit',
    'Upload my documents',
    'Generate the contract',
    'Pay the deposit',
    'Pay my first rent',
  ],
  es: [
    '2 ambientes cerca de Tres Cerritos, menos de 500 USDC, acepta mascotas',
    'Reservar visita',
    'Subir mis documentos',
    'Generar el contrato',
    'Pagar el depósito',
    'Pagar mi primer alquiler',
  ],
};

/** Message sent by the "Confirm visit" button on the picked property card (the server reads it as a confirmation). */
export const CONFIRM_VISIT: Record<Lang, string> = {
  en: 'Confirm visit',
  es: 'Confirmar visita',
};

/** Card-button messages ("Book a visit" on a property card). Followed by the property title in the same language. */
export const BOOK_VISIT_FOR: Record<Lang, string> = {
  en: 'Book a visit for',
  es: 'Reservar visita para',
};
