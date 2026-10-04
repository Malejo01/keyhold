import type { Lang, Property } from '../contracts';
import properties from '../../seed/properties.json';

const CATALOG: Property[] = properties as Property[];

export function loadCatalog(): Property[] {
  return CATALOG;
}

/** Title in the given language (English fallback). */
export function propertyTitle(p: Property, lang: Lang): string {
  return (lang === 'es' ? p.titleEs : undefined) ?? p.title;
}

/** Description in the given language (English fallback). */
export function propertyDescription(p: Property, lang: Lang): string {
  return (lang === 'es' ? p.descriptionEs : undefined) ?? p.description;
}

/**
 * Property as the model sees it in tool results: title and description in the conversation language, no *Es
 * fields, so the model answers from text already in the right language.
 */
export function localizedProperty(p: Property, lang: Lang): Property {
  return {
    id: p.id,
    title: propertyTitle(p, lang),
    zone: p.zone,
    priceUsdc: p.priceUsdc,
    bedrooms: p.bedrooms,
    petsAllowed: p.petsAllowed,
    description: propertyDescription(p, lang),
  };
}

export function findProperty(id: string): Property | undefined {
  return CATALOG.find((p) => p.id === id);
}
