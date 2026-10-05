import type { Lang } from '../contracts';

/**
 * Suggested-prompt chips, sent verbatim as the user's message. Shared by the UI (components) and by the
 * evals/recordings, so the replay keys of the demo chips always match what the UI sends.
 * Order = demo order: search, visit, documents, contract, deposit, first rent.
 * Changing a string here means re-recording the search chip (its listings recording is keyed by the text).
 */
export const CHIP_TEXT: Record<Lang, readonly [string, string, string, string, string, string]> = {
  en: [
    'I want apartments in Centro, 2 bedrooms, max 450',
    'I need something in the West with pets',
    'Show me apartments in Macrocentro',
    'Look for rentals in the North under 500',
    'Are there apartments in the South with 1 bedroom?',
    'Find an apartment in the East under 400',
  ],
  es: [
    'Quiero departamentos en Centro, 2 dormitorios, máximo 450',
    'Necesito algo en Oeste con mascotas',
    'Muéstrame departamentos en Macrocentro',
    'Busca alquileres en Norte, bajo 500',
    '¿Hay departamentos en el Sur con 1 dormitorio?',
    'Busco departamentos en Este, máximo 400',
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
