# B9 review: validation kit (WhatsApp templates, tenant survey, LOI, naming, agencies list)

**Verdict: GO.** No blocking issues. The kit is honest (no users claimed anywhere), collects no personal data from private individuals, the LOI is clearly non-binding with no money and devnet only, and the naming claims reproduce. `docs/validation/evidence.md` is still empty. Eight non-blocking items below; the first three are worth doing before Ani sends anything.

- Reviewer: qa-security-reviewer (dev agent). I did not write any of this.
- Date: 2026-10-04 (ART).
- Target: branch `docs/validation` at `31e6feb`: `docs/validation/{whatsapp-templates,tenant-survey,loi-template,naming,agencies-salta,evidence}.md`.
- Method: read all files; re-fetched the agency websites and checked address and phone strings; recounted the template lengths with node; re-ran the RDAP and website checks behind `naming.md`. Nothing was sent to anyone, no forms published, nothing bought.

## Blocking

None.

## Non-blocking

1. **Snippet-sourced mobile numbers (`agencies-salta.md:22`, `:27`, `:30`).** Rows 2 (MG Guidoni), 7 (Zumar) and 10 (Ingal, Instagram bio) carry mobile numbers taken from search snippets or an Instagram bio, flagged "snippet, confirm before use". Argentine mobiles (387 5..., 387 6...) can belong to an individual broker rather than the business. Today I could read the three MG numbers on the agency's own site (`mginmobiliariasalta.com.ar` contains 6850115, 5348393, 6116939), so row 2 is now confirmed and the note "not on the page I fetched" is stale. Zumar's `519-1684` is not on `zumarbienesraices.com.ar` (no match in the page), so it stays unconfirmed. Suggest: for rows 7 and 10, keep the website or Instagram DM as the first channel and drop the bare mobile until the business publishes it. Template 1 says "Te escribo a este número porque figura como contacto público": that sentence must be true for the channel used.
2. **Survey has no adult screen (`tenant-survey.md`, intro `:23-27`).** Audience includes students; add a line "Tenés que ser mayor de 18 años para responder" or a first yes/no question. Also state that Google Forms stores the answers (the "anónima" claim is about the team not collecting identities).
3. **`{{contacto_del_equipo}}` (`tenant-survey.md:27`).** The deletion-request contact must be a team email created for this project, not a personal phone or personal mail. The survey says it cannot identify responses, so the promise to "borrar tus respuestas" is hollow; the survey already warns people not to write personal data. Consider rewording to "podés pedirnos que cerremos la encuesta; no podemos identificar respuestas individuales".
4. **Leading questions (`tenant-survey.md:82`, `:114`).** Q7 and Q12 describe the product positively before asking. Results will be biased up; the file already lists bias at `:134`. Suggest a neutral wording or reporting those two as "reaction to a description", not demand.
5. **Template length figures are rough (`whatsapp-templates.md:14`, `:18`, `:22`, `:26`, `:30`).** Actual raw lengths (code points, placeholders unexpanded): 494, 402, 412, 458, 233; stated "aprox." 500, 430, 470, 450, 200. Worst case with a 40-character agency name and 12-character placeholders: 515, 425, 413, 460, 257. All are far below 600, so the rule holds; just replace the approximations with the real numbers or drop them.
6. **Stale reference (`agencies-salta.md:45`).** Points to `docs/validation/interview-agencies.md (if present)`; the file does not exist on the branch or on `main`. It is hedged, but either create it or remove the line.
7. **No changelog entry.** The overnight brief asks each block to append to `CHANGELOG.md`; `git diff main..HEAD -- CHANGELOG.md` is empty. The lead can add it at integration.
8. **`naming.md` details I could not verify.** `getkeyhold.com` returned HTTP 503 today (claim sourced "per search results"); the Google Play page returns 200 but its content is JS-rendered, so publisher, downloads and rating remain unverified, exactly as the file says. `alquilia.io` structured data mentions "gestión de alquileres en España", so it is probably Spain-focused; the file calls it "very high" conflict without saying so. Neither changes the recommendation.

## Checklist (as asked by the lead)

| Item | Result |
|---|---|
| No personal data of private individuals; only public business contacts | Pass. Business names that include a person's name (Carina Nunez Inmobiliaria, Eduardo Noman y Asociados, Eduardo Cabrera Bienes Raices) are trading names; the only emails are business-domain addresses (`noa@remax.com.ar`, `info@...`); `agencies-salta.md:15` says personal or free-mail addresses were not copied; row 1 omits the broker's personal Instagram. No DNI, home address, or personal mail found (`grep` for DNI, `@gmail`, `@hotmail`, `@yahoo`, `@outlook`: only the survey and LOI lines that forbid collecting them). The Play-store publisher "an individual developer" is explicitly not named (`naming.md:19`). Matricula numbers were left to the agency's own site and flagged as unconfirmed by CUCIS. Caveat: item 1 above. |
| Templates honest, no users claimed, each at most 600 characters | Pass. `whatsapp-templates.md:7` and every template say "no tenemos usuarios ni vendemos nada" or "idea en validación para un hackathon"; template 4 offers a demo "con datos de prueba y dinero de prueba". Max length 515 even in the worst case. One message plus one reminder, no data requested. |
| Survey has consent and collects no PII | Pass. `tenant-survey.md:9-10` disables email collection and forbids name, phone, mail, DNI and address questions; `:23-25` states "anónima y voluntaria", the purpose, aggregation, hackathon use and "Al enviar el formulario aceptás"; open answers carry a no-personal-data warning; `:131` forbids committing raw CSV. See items 2 to 4. |
| LOI non-binding, no money, devnet | Pass. `loi-template.md:3` unsigned template, not evidence; title "NO VINCULANTE"; `:24` "No es un contrato, no crea obligaciones de contratar, de pagar, de exclusividad ni de continuidad", withdrawal at any time; `:30` "Sin dinero real", Solana devnet with test tokens, no custody of real funds; `:49` no fees; `:41` no personal data on any blockchain, only public keys, test amounts, dates and hashes; `:28` the human decides, the tool never approves; `:45` the AI provider is disclosed before consented documents are used; `:3` and `:43` say a lawyer review is pending. |
| Naming claims sourced or marked unverified | Pass. INPI, EUIPO, .com.ar, social handles and Play-store details are all explicitly "unverified" (`naming.md:5`, `:22`, `:26-27`). Verified below. Scores are labelled "my judgement". |
| `evidence.md` still empty | Pass. Header and an empty table only; "No entries yet" (`evidence.md:3`). |

## Evidence

### Naming checks reproduced (2026-10-04)

```
alquilia.io    200  <title>Alquilia - CRM con IA para Agencias de Alquiler | Cualifica Inquilinos por WhatsApp
alquilia.eu    200  <title>AlquilIA - Copiloto IA para agencias inmobiliarias; "10 mejores candidatos por vivienda"; tiers 29 and 149 present
alquilia.com.ar 200 <title>Alquilia; "Gestion de alquileres e inmuebles"
RDAP .com (Verisign)   wasikey 404, casapacta 404, fianzia 200, llaveo 200, keyhold 200, arrendia 200, inquilia 200, llavia 200, alquilia 200
RDAP .xyz (CentralNic) wasikey 404, casapacta 404, fianzia 404, keyhold 200
RDAP .app (Google)     wasikey 404, casapacta 404, fianzia 404, keyhold 200, arrendia 200
registration dates (.com): keyhold 2002-08-05, fianzia 2026-08-03, arrendia 2026-01-20, inquilia 2025-06-07, llaveo 2025-04-28, llavia 2026-02-22, alquilia 2003-06-30
```

Every registered or free signal and every date I re-queried equals the table in `naming.md:113-123`. Dates of the other .app and .xyz entries were not re-queried.

### Agency list spot check (own websites, strings found in the page HTML)

Phone and address present: REMAX NOA (Zuviría 498, 431-2737, 685-2073), Logros (Pueyrredón 407, 777822, info@logrosprop), Noman (Santiago del Estero Nº 202, 431-0002, 506-8432), GAN (Falcón 52, 149143), Carina Nunez (412-5897, Güemes 404), Grupo Vesta (Bolívar 89, 243-9031), Acres (522-9619, Güemes 20), Platinum (Juramento 1421, 658-7878), Orquidea (635-7005, Pueyrredón 1294), MG (three phones and matricula 236), Cabrera (422-1635, Zuviria 642). Not found in page: Zumar phone (the row says so). 11 of 12 rows I checked match the sheet. Directory-only rows (9, 13, 15) and Facebook-only data were not re-checked.

### Templates (node, code points)

```
template  1: raw 494  expanded(agency 40 chars, other placeholders 12) 515
template  2: raw 402  expanded 425
template  3: raw 412  expanded 413
template  4: raw 458  expanded 460
template  5: raw 233  expanded 257
```

## Go / no-go

GO. Nothing here claims traction, and nothing needs to change for the docs gate. Do items 1 to 3 before the first message goes out or the form is published. When the first real conversation happens, the evidence row (role, date, note) must exist before any number is cited in Earn answer 3 or the pitch.
