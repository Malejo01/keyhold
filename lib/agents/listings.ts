import { z } from 'zod';
import type { ChatTurn, Property } from '../contracts';
import { chatStep, toJsonSchema, type AiBlock, type AiMessage, type ToolDefinition } from '../ai';
import { loadCatalog, localizedProperty, propertyDescription, propertyTitle } from './catalog';
import { resolveLanguage, type Lang } from './language';
import { PROMPT_VERSION, listingsSystem } from './prompts';

// ---------- Tools (pure, catalog-only) ----------

export const SearchPropertiesInput = z.strictObject({
  zone: z.string().optional().describe('Zone or neighborhood in Salta, e.g. "Tres Cerritos".'),
  max_price: z.number().optional().describe('Maximum monthly rent in USDC.'),
  bedrooms: z.number().optional().describe('Minimum number of bedrooms (whole number).'),
  pets: z.boolean().optional().describe('true if the tenant needs a pet-friendly property.'),
});
export type SearchPropertiesInput = z.infer<typeof SearchPropertiesInput>;

export const GetPropertyInput = z.strictObject({ id: z.string().describe('Property id, e.g. "prop-01".') });

export const LISTINGS_TOOLS: ToolDefinition[] = [
  {
    name: 'search_properties',
    description:
      'Search the rental catalog. All filters are optional. Returns at most 3 matching properties, cheapest first. ' +
      'An empty result means the catalog has no such property.',
    inputSchema: toJsonSchema(SearchPropertiesInput),
  },
  {
    name: 'get_property',
    description: 'Get every catalog field of one property by id. Returns an error if the id does not exist.',
    inputSchema: toJsonSchema(GetPropertyInput),
  },
];

const MAX_RESULTS = 3;

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function searchProperties(catalog: Property[], input: SearchPropertiesInput): Property[] {
  const zone = input.zone ? fold(input.zone) : null;
  return catalog
    .filter((p) => {
      if (zone && !fold(p.zone).includes(zone) && !zone.includes(fold(p.zone))) return false;
      if (input.max_price !== undefined && p.priceUsdc > input.max_price) return false;
      if (input.bedrooms !== undefined && p.bedrooms < input.bedrooms) return false;
      if (input.pets === true && !p.petsAllowed) return false;
      return true;
    })
    .sort((a, b) => a.priceUsdc - b.priceUsdc)
    .slice(0, MAX_RESULTS);
}

export function getProperty(catalog: Property[], id: string): Property | undefined {
  return catalog.find((p) => p.id === id.trim());
}

interface ToolOutcome {
  content: string;
  isError: boolean;
  properties: Property[];
}

/** `lang` only affects the text the model sees in the tool result; the returned `properties` are catalog objects. */
export function executeListingsTool(catalog: Property[], name: string, rawInput: unknown, lang: Lang = 'en'): ToolOutcome {
  if (name === 'search_properties') {
    const parsed = SearchPropertiesInput.safeParse(rawInput);
    if (!parsed.success) return { content: 'Invalid search filters.', isError: true, properties: [] };
    const results = searchProperties(catalog, parsed.data);
    const content =
      results.length === 0
        ? JSON.stringify({ results: [], note: 'No property in the catalog matches these filters.' })
        : JSON.stringify({ results: results.map((p) => localizedProperty(p, lang)) });
    return { content, isError: false, properties: results };
  }
  if (name === 'get_property') {
    const parsed = GetPropertyInput.safeParse(rawInput);
    const property = parsed.success ? getProperty(catalog, parsed.data.id) : undefined;
    if (!property) return { content: 'No property with that id exists in the catalog.', isError: true, properties: [] };
    return { content: JSON.stringify(localizedProperty(property, lang)), isError: false, properties: [property] };
  }
  return { content: `Unknown tool "${name}".`, isError: true, properties: [] };
}

// ---------- Deterministic fallback (replay miss, no API key, API error) ----------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
};

export function parseSearchCriteria(message: string, catalog: Property[]): SearchPropertiesInput {
  const text = fold(message);
  const criteria: SearchPropertiesInput = {};
  const zones = [...new Set(catalog.map((p) => p.zone))].sort((a, b) => b.length - a.length);
  const zone = zones.find((z) => text.includes(fold(z)));
  if (zone) criteria.zone = zone;

  const price = text.match(
    /(?:under|below|less than|max(?:imum)?|up to|at most|hasta|menos de|maximo|por debajo de)\s*(?:usdc|usd|u\$s|\$)?\s*(\d{2,5})/,
  );
  if (price) criteria.max_price = Number(price[1]);

  const beds = text.match(/\b(\d+|one|two|three|four|five|six|un|uno|dos|tres|cuatro|cinco|seis)\s*-?\s*(?:bed(?:room)?s?|br|dormitorios?|habitaciones?|cuartos?)\b/);
  if (beds) criteria.bedrooms = /^\d+$/.test(beds[1]) ? Number(beds[1]) : NUMBER_WORDS[beds[1]];

  // Argentine "N ambientes" counts the living room: N ambientes is about N - 1 bedrooms.
  const rooms = text.match(/\b(\d+)\s*ambientes?\b/);
  if (rooms && criteria.bedrooms === undefined && Number(rooms[1]) > 1) criteria.bedrooms = Number(rooms[1]) - 1;

  if (/\b(pets?|dogs?|cats?|perros?|gatos?|mascotas?)\b/.test(text) && !/\b(no pets|sin mascotas)\b/.test(text)) {
    criteria.pets = true;
  }
  return criteria;
}

function describe(p: Property, lang: Lang): string {
  const month = lang === 'es' ? 'USDC/mes' : 'USDC/month';
  return `${p.id} · ${propertyTitle(p, lang)} (${p.zone}, ${p.priceUsdc} ${month})`;
}

export function fallbackListings(message: string, catalog: Property[], lang: Lang): ListingsTurn {
  const idMatch = message.match(/\bprop-\d+\b/i);
  if (idMatch) {
    const property = getProperty(catalog, idMatch[0].toLowerCase());
    if (!property) {
      return {
        reply: lang === 'es'
          ? 'No encuentro esa propiedad en el catálogo, así que no puedo darte datos sobre ella.'
          : "I can't find that property in our catalog, so I don't know anything about it.",
        properties: [],
        source: 'fallback',
      };
    }
    return {
      reply: lang === 'es'
        ? `Esto es lo que dice el catálogo de ${describe(property, lang)}: ${propertyDescription(property, lang)} Si buscás un dato que no figura acá, no lo sé.`
        : `Here is what the catalog says about ${describe(property, lang)}: ${propertyDescription(property, lang)} If you need a detail that isn't listed, I don't know it.`,
      properties: [property],
      source: 'fallback',
    };
  }

  const criteria = parseSearchCriteria(message, catalog);
  if (Object.keys(criteria).length === 0) {
    return {
      reply: lang === 'es'
        ? 'Solo puedo responder con datos de nuestro catálogo (demo, datos simulados). Decime una zona de Salta, un presupuesto en USDC, cuántos dormitorios necesitás o si tenés mascotas, y lo busco.'
        : 'I can only answer from our property catalog (demo, simulated listings). Tell me a zone in Salta, a budget in USDC, how many bedrooms you need or whether you have pets, and I will search it.',
      properties: [],
      source: 'fallback',
    };
  }
  const results = searchProperties(catalog, criteria);
  if (results.length === 0) {
    return {
      reply: lang === 'es'
        ? 'No tengo ninguna propiedad en el catálogo que cumpla eso, y no voy a inventar una. Probá con otra zona, presupuesto o cantidad de dormitorios.'
        : "I don't know of any property in our catalog that matches that, and I won't guess. Try another zone, budget or number of bedrooms.",
      properties: [],
      source: 'fallback',
    };
  }
  const list = results.map((p) => `- ${describe(p, lang)}`).join('\n');
  return {
    reply: lang === 'es'
      ? `Encontré ${results.length} opciones en el catálogo:\n${list}\nElegí una y te agendo una visita.`
      : `I found ${results.length} options in the catalog:\n${list}\nPick one and I'll schedule a visit.`,
    properties: results,
    source: 'fallback',
  };
}

// ---------- Agent ----------

export interface ListingsTurn {
  reply: string;
  /** Only catalog objects returned by tools, never model text. */
  properties: Property[];
  source: 'live' | 'replay' | 'fallback';
}

export const LISTINGS_AGENT = `listings@${PROMPT_VERSION}`;
const MAX_STEPS = 4;
const HISTORY_TURNS = 6;

function historyMessages(history: ChatTurn[]): AiMessage[] {
  const recent = history.slice(-HISTORY_TURNS);
  while (recent.length > 0 && recent[0].role !== 'user') recent.shift();
  return recent.map((t) => ({ role: t.role, content: [{ type: 'text', text: t.text }] }));
}

function textOf(blocks: AiBlock[]): string {
  return blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
}

export async function runListingsAgent(opts: {
  message: string;
  history?: ChatTurn[];
  catalog?: Property[];
  lang?: Lang;
  /** Recording label (humans only; not part of the replay key). */
  label?: string;
}): Promise<ListingsTurn> {
  const catalog = opts.catalog ?? loadCatalog();
  const lang = resolveLanguage(opts.lang, opts.message);
  const messages: AiMessage[] = [
    ...historyMessages(opts.history ?? []),
    { role: 'user', content: [{ type: 'text', text: opts.message }] },
  ];
  let shown: Property[] = [];
  let source: ListingsTurn['source'] = 'live';

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await chatStep({
        agent: LISTINGS_AGENT,
        role: 'orchestration',
        system: listingsSystem(lang),
        messages,
        tools: LISTINGS_TOOLS,
        label: opts.label,
        maxTokens: 1500,
      });
      source = res.source;
      messages.push({ role: 'assistant', content: res.content });
      const toolUses = res.content.filter((b): b is Extract<AiBlock, { type: 'tool_use' }> => b.type === 'tool_use');
      if (res.stopReason !== 'tool_use' || toolUses.length === 0) {
        const reply = textOf(res.content);
        if (!reply) break;
        return { reply, properties: shown, source };
      }
      const results: AiBlock[] = toolUses.map((call) => {
        const outcome = executeListingsTool(catalog, call.name, call.input, lang);
        if (!outcome.isError) shown = outcome.properties;
        return { type: 'tool_result', toolUseId: call.id, content: outcome.content, isError: outcome.isError || undefined };
      });
      messages.push({ role: 'user', content: results });
    }
  } catch (err) {
    if (!(err instanceof Error && err.name === 'ReplayMissError')) {
      console.warn('[listings] model call failed, using deterministic fallback:', err instanceof Error ? err.message : err);
    }
  }
  return fallbackListings(opts.message, catalog, lang);
}
