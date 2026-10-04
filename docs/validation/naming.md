# Naming: conflicts of "AlquilIA" and alternatives

Date of checks: **2026-10-04**. Status: **research draft for the team to decide.** This file changes nothing else: the name in `lib/config/brand.ts` and the docs stays as is until the team decides. This is a quick web check, not legal advice and not a trademark clearance.

How to read the checks: "web search" means the first results of a public search engine, no more. Domain signals come from public RDAP registry servers (Verisign for .com, CentralNic for .xyz, the Google registry for .app) queried on the date above. An RDAP 404 means "no registration record", a good signal but not a guarantee (reserved or premium names exist, and registries can lag). Confirm any domain at a registrar before relying on it. **.com.ar** could not be checked (NIC Argentina's search needs an interactive form), so it is "unverified" for every name.

---

## 1. Conflicts of "AlquilIA"

Summary: **the conflict is serious.** Two live products with the same name and nearly the same function already exist, plus a rental app in Salta with the same name.

| Item | What I found | Source (accessed 2026-10-04) | Severity |
|---|---|---|---|
| alquilia.io | "Alquilia": "CRM con IA para Agencias de Alquiler", with a feature to qualify tenants by WhatsApp. Target customer: rental agencies. Pricing and legal entity not visible in what I could read. | https://alquilia.io (fetched) | **Very high.** Same name, same buyer (rental agencies), same job (AI tenant qualification). |
| alquilia.eu | "AlquilIA": "AI copilot" for real-estate agencies that centralizes rental applications and scores them, so the agency only talks to the 10 best candidates per property. Three subscription tiers listed (29, 59 and 149 euros per month). Spanish market (references to Idealista and Fotocasa). Support email on the site. | https://alquilia.eu (fetched) | **Very high.** Same spelling "AlquilIA" (capital I and A), same buyer, same function. |
| alquilia.com.ar | "Alquilia": a login page for "Gestión de alquileres e inmuebles" (rental and property management software), Argentina. Owner and customers unknown. | https://alquilia.com.ar (fetched) | High (Argentina, same domain space as ours, adjacent product). |
| alquilia.com | Registered since 2003-06-30 (Verisign RDAP). Site content could not be read (TLS error). | https://rdap.verisign.com/com/v1/domain/alquilia.com | Medium (unknown use). |
| "Alquilia - Alquila en Salta" app, Google Play | Package id `com.mycompany.alquilia`. Described as "the first mobile platform focused exclusively on the search and management of rentals and homes in Northern Argentina": identity verification of owners and advertisers, search filters, direct contact with the advertiser, and a panel for owners and real-estate companies to manage listings. Publisher: a search snippet names an individual developer in Argentina (name not recorded here). The Play page itself was truncated for my fetch tool, so the **publisher, download count, rating and release date are unverified**. | https://play.google.com/store/apps/details?id=com.mycompany.alquilia&hl=es_MX (appears in search results; page content not readable by the tool) | **Very high for us.** Same market (Salta and NOA), same sector, same name. Our buyer (Salta agencies) may already have seen it. |
| Spanish company and Facebook | A Spanish company "Alquilia Gestion y Desarrollo, Sociedad Limitada" is listed in a company directory, and a Facebook page "Alquilia" appears in search results (offers rent non-payment insurance and energy certificates, 269 followers per the snippet). Whether they are the same business as the .io or .eu sites is unknown. | https://empresite.eleconomista.es/ALQUILIA-GESTION-DESARROLLO.html ; https://www.facebook.com/Alquilia/ | Medium. |
| X (Twitter) | An account `@alquilia` exists in search results (the page returned HTTP 402 to my fetch, so content unknown). | https://x.com/alquilia | Handle probably taken. |
| Instagram, TikTok, LinkedIn handles | **Not checked** (these pages need a logged-in browser). | n/a | Unverified. |

### Trademark quick check

- **INPI Argentina:** **not reachable / not performed.** The INPI trademark search is an interactive portal that my tools could not query, and the INPI marcas page failed to load. A web search for "ALQUILIA marca INPI" returned only generic guides. So the answer is **unverified**: someone should run the official INPI search (classes 9, 36 and 42 at least, plus 35 and 45) or ask an industrial-property agent.
- **EUIPO / OEPM (Spain):** web search found no specific record, but the databases themselves were not queried. **Unverified.**
- Practical reading: with live businesses called Alquilia in Argentina and Spain (and a common-law claim from an app in Salta), registration of "AlquilIA" is risky and confusion in the market is likely regardless of registration.

### What it means for us

- Keeping "AlquilIA" for the hackathon demo is low legal risk in the short term (no revenue, no trademark filing). It is a **credibility and findability risk**: a judge or an agency who searches the name finds a competing AI-for-rental-agencies product at alquilia.io and alquilia.eu, and a Salta rental app, and may think we copied or are the same company. Repo and README should not claim the name is original.
- Recommendation (assumption to confirm): decide on a new name before any public launch, and avoid filing for "AlquilIA". The repo already uses "Keyhold" as the name of the repository and the previous working name, so the code is ready for a swap (`lib/config/brand.ts`).

---

## 2. Eight alternative names

Scores are 1 to 5 (5 is best), my judgement, combining: conflict check, domain signals, pronunciation, and fit with the product (AI pre-qualification for agencies plus a deposit held in escrow, first market Salta/NOA). "Free" means no registry record found.

Conflict check = first results of a web search (search engines, app stores as indexed by search, obvious trademarks), not a clearance.

### 2.1 Keyhold

- **Meaning:** "key" plus "hold": holding the key and holding the deposit in custody.
- **Pronunciation:** EN /ˈkiː.hoʊld/ ("KEE-hold"). ES: "KI-jold" (the "h" is aspirated or silent depending on speaker; many Argentines will say "ki-OLD").
- **Conflicts:** `getkeyhold.com` is an existing product, "Keyhold — Rent, leases, and repairs, handled": property management software for self-managing landlords (rent collection via Stripe, leases, maintenance), per search results. Also a search result for a similarly named "Keyhole" (Copenhagen, deposit financing) which is a different spelling. Our own GitHub repo Malejo01/keyhold appears in results.
- **Domains:** keyhold.com registered (since 2002, GoDaddy). keyhold.app registered 2026-03-26. keyhold.xyz registered 2025-07-14. .com.ar unverified. (Who owns .app and .xyz is not known.)
- **Score: 2.** Nice meaning, but the same space (rent and lease software) already holds the name and the main domains.

### 2.2 Llavia

- **Meaning:** "llave" (key) plus "IA".
- **Pronunciation:** ES "YA-via" (rioplatense "SHA-via"). EN "LAH-vee-ah" or "YAH-vee-ah"; English speakers will stumble on "ll".
- **Conflicts:** `llavia.com`: "Gestión de Alquileres Profesional", a rental-management platform (automatic billing, digital contracts), registered 2026-02-22 (IONOS). Same sector.
- **Domains:** .com registered. .app and .xyz: no registry record found (free signal). .com.ar unverified.
- **Score: 2.** Great fit, but a rental-management product already uses the exact name.

### 2.3 Wasikey

- **Meaning:** "wasi" is Quechua for "house" (the language is part of the NOA heritage), plus English "key": a key to the house. Local root, bilingual.
- **Pronunciation:** ES "WA-si-KEI" or "WA-si-ki". EN "WAH-see-kee".
- **Conflicts:** web search found no product named Wasikey (results were unrelated surnames and a precast-concrete company named Waskey, a different word and sector). Caveat from my background knowledge, **not verified in this session**: other real-estate brands use "Wasi" alone (for example a Colombian real-estate CRM), so the root is not unique, though the compound is.
- **Domains:** wasikey.com: no record (free signal). wasikey.app: no record. wasikey.xyz: no record. .com.ar unverified.
- **Score: 4.** Clean signals, local story, short.

### 2.4 Arrendia

- **Meaning:** "arrendar" (to lease) plus "IA".
- **Pronunciation:** ES "a-RREN-dia". EN "ah-REN-dee-ah".
- **Conflicts:** no product named Arrendia found in search (similar names exist: Arrendo, Aptuno, others). Weak local fit: in Argentina people say "alquilar" and "alquiler", not "arrendar", which sounds Mexican, Colombian or legalistic.
- **Domains:** arrendia.com registered 2026-01-20 (Namecheap). arrendia.app registered 2026-04-02. arrendia.xyz: no record. .com.ar unverified.
- **Score: 2.** Main domains taken, weak Argentine word choice.

### 2.5 Fianzia

- **Meaning:** "fianza" (deposit or surety) plus "IA".
- **Pronunciation:** ES "fian-SIA" (in Argentina "fian-SIA", with the "z" as "s"). EN "fee-AN-zee-ah".
- **Conflicts:** no product named Fianzia found in search. Many guarantee services with similar names (Fianly, Afianzar, Argifianza, Afianza). In Argentina the word "fianza" is mostly the guarantor figure, while the deposit is "depósito en garantía", so the meaning is partly off.
- **Domains:** fianzia.com registered 2026-08-03 (Cloudflare). fianzia.app: no record. fianzia.xyz: no record. .com.ar unverified.
- **Score: 3.** Free .app and .xyz, but .com is taken very recently and the name sounds like several incumbent guarantee brands.

### 2.6 Inquilia

- **Meaning:** "inquilino" (tenant) plus "IA".
- **Pronunciation:** ES "in-ki-LI-a". EN "in-KWIL-ee-ah".
- **Conflicts:** no product named Inquilia found. Near neighbors: Inquilino.app (property management), and it shares the "-quilia" ending with the existing Alquilia products, which would keep the confusion. Targets tenants while our buyer is agencies.
- **Domains:** inquilia.com registered 2025-06-07 (Namecheap). inquilia.app: no record. inquilia.xyz: no record. .com.ar unverified.
- **Score: 2.** Too close to Alquilia in sound, tenant-centred meaning.

### 2.7 Casapacta

- **Meaning:** "casa" (home) plus "pacta" (agrees, from "pacto"): a home agreement, which matches the 2-of-3 signature deposit idea.
- **Pronunciation:** ES "ka-sa-PAK-ta". EN "KAH-sah-PAHK-tah".
- **Conflicts:** no product named Casapacta found. "PACTA" is the name of an arbitration agreement add-on for rentals from a Spanish arbitration court (tribunal de arbitraje); separate word, minor overlap. "Pactia" (a Colombian real-estate fund, pactia.com) was considered and **discarded** because of that conflict.
- **Domains:** casapacta.com: no record. casapacta.app: no record. casapacta.xyz: no record. .com.ar unverified.
- **Score: 3.** Free domains and a meaningful story, but it is long (10 letters, 4 syllables) and a bit generic.

### 2.8 Llaveo

- **Meaning:** from "llave" (key) with a verb-like ending ("llavear"); playful, means locking up or "keying".
- **Pronunciation:** ES "ya-VE-o" (rioplatense "sha-VE-o"). EN "yah-VAY-oh".
- **Conflicts:** no product named Llaveo found; results show unrelated key and smart-lock businesses (Tu Llave, Lockio). Sounds like a key-locker service, not an AI back-office.
- **Domains:** llaveo.com registered 2025-04-28 (Gname). llaveo.app: no record. llaveo.xyz: no record. .com.ar unverified.
- **Score: 3.** Short and clean on the app stores but .com is taken and the meaning leans to physical keys.

---

## 3. Recommendation table (for the team to decide)

Domain columns: Y = registered, N = no registry record found (free signal), ? = unverified.

| Option | Score | .com | .app | .xyz | .com.ar | Main risk | Note |
|---|---|---|---|---|---|---|---|
| **Wasikey** | 4 | N | N | N | ? | "Wasi" root used by other brands (unverified) | Best signals. Needs a trademark search. Quechua link suits Salta and NOA. |
| Casapacta | 3 | N | N | N | ? | Long and generic | Free everywhere; meaning matches 2-of-3 release. |
| Fianzia | 3 | Y | N | N | ? | .com taken, "fianza" word mismatch in Argentina | Could use .app. |
| Llaveo | 3 | Y | N | N | ? | Reads like a physical keys service | Use only if branding leans to "keys". |
| Keyhold | 2 | Y | Y | Y | ? | Existing product `getkeyhold.com` in rent and leases | Repo name today. Rename only if the team prefers; the conflict is moderate. |
| Llavia | 2 | Y | N | N | ? | `llavia.com` rental management product | Close to Alquilia in the AI-suffix pattern. |
| Arrendia | 2 | Y | Y | N | ? | Word is foreign to Argentine usage | |
| Inquilia | 2 | Y | N | N | ? | Sounds like Alquilia | |
| AlquilIA (current) | 1 | Y (alquilia.com, 2003) | ? | ? | Y (alquilia.com.ar is a live app) | Live competitors alquilia.io and alquilia.eu with the same function; Salta rental app with the same name | See section 1. |

Suggested next steps if the team wants to move: (1) pick 1 or 2 names, (2) run the official INPI search and EUIPO search for them, (3) check Instagram, TikTok, LinkedIn and X handles in a browser, (4) check .com.ar at nic.ar, (5) only then register domains. Do not buy anything before the team decides.

---

## English summary (for judges and the team)

"AlquilIA" collides with live products: alquilia.io and alquilia.eu both sell an AI tenant-qualification CRM or copilot to rental agencies (the .eu one for the Spanish market, with 29 to 149 euro monthly plans), alquilia.com.ar is a rental-management login, and an app "Alquilia - Alquila en Salta" is on Google Play focused on Salta and Northern Argentina. Trademark status could not be checked (INPI search not reachable from my tools), so it is unverified. I propose eight alternatives, each web-searched and domain-checked via public RDAP (.com.ar unverified). Best signals: Wasikey (Quechua "wasi" = house plus "key"; no conflict found and .com, .app and .xyz show no registration), then Casapacta. The current repo name Keyhold has a moderate conflict with the product getkeyhold.com and its .com, .app and .xyz are registered. The team decides; nothing else in the repo was renamed.
