import type { Property } from '../contracts';
import properties from '../../seed/properties.json';

const CATALOG: Property[] = properties as Property[];

export function loadCatalog(): Property[] {
  return CATALOG;
}

export function findProperty(id: string): Property | undefined {
  return CATALOG.find((p) => p.id === id);
}
