import type { Lang } from '../contracts';

export type { Lang };

const SPANISH_MARKERS =
  /[ñ¿¡áéíóú]|\b(hola|quiero|quisiera|busco|buscando|departamento|depto|casa|dormitorios?|ambientes?|alquiler|alquilar|mascotas?|perro|gato|cerca|hasta|menos|documentos|gracias|por favor|necesito|tengo|subo|subiendo|adjunto|mis|los|las|una|para|con|sí|dale|listo|contrato|pagar|cuánto|cuanto|visita|mañana)\b/i;

/** Cheap heuristic: Spanish if the message has Spanish markers, English otherwise. Fallback only: the route `lang` wins. */
export function detectLanguage(text: string): Lang {
  return SPANISH_MARKERS.test(text) ? 'es' : 'en';
}

/** The route language when given, otherwise detected from the message. */
export function resolveLanguage(lang: Lang | undefined, text: string): Lang {
  return lang ?? detectLanguage(text);
}

/** Formats a 6-decimal base-unit amount as a human USDC amount, e.g. "480" or "465.60". */
export function formatUsdc(baseUnits: string | bigint): string {
  const v = typeof baseUnits === 'bigint' ? baseUnits : BigInt(baseUnits);
  const million = BigInt(1_000_000);
  const whole = v / million;
  const cents = (v % million) / BigInt(10_000);
  return cents === BigInt(0) ? whole.toString() : `${whole}.${cents.toString().padStart(2, '0')}`;
}
