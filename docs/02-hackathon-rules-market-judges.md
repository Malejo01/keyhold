# Keyhold — Plan de hackathon, demo de esta noche, mercado y jurado

> Colosseum Crypto World's Fair · Track Superteam Argentina · Armado el 03/10/2026 a las 20:30 ART
> Leyenda: **[V]** verificado en la fuente · **[S]** viene de un snippet o resumen · **[NV]** no verificado o inferencia propia

---

## 0. TL;DR

1. **El deadline que importa es mañana, domingo 04/10 a las 16:00**: preselección para el Demo Day, que es el **domingo a las 19:30**. Para postular hacen falta **pitch de 2 min + demo de hasta 3 min + repo de GitHub, todo en inglés**. La demo de esta noche tiene que alcanzar para grabar ese video.
2. **Se puede reutilizar código previo**, pero hay que **declararlo**. Solo se evalúa lo hecho desde el 14/09. Hay que marcar el punto de partida y llevar un changelog semanal. También hay que declarar el **uso material de IA**. Si se tergiversa: descalificación y ban.
3. **El track AR exige que cada integrante esté registrado en Colosseum con país Argentina** y que el proyecto tenga ubicación Argentina. Si no, quedan descalificados.
4. **Mercado:** hay un hueco real, porque nadie en Salta hace el flujo completo (búsqueda → precalificación → contrato → pago → depósito). Pero **en Salta se alquila en pesos**, y el agente para buscar y agendar visitas **ya es commodity**. El diferencial tiene que estar en **precalificación + control cruzado + escrow + reputación**, vendidos **B2B a inmobiliarias**.
5. **Riesgo a mencionar en el pitch:** los medios reportan que **el 15/10 Diputados votaría el rechazo del DNU 70/2023**. Si se aprueba, volvería la Ley de Alquileres anterior **[S, confirmar]**. El producto tiene que funcionar con cualquiera de los dos regímenes.

---

## 1. Calendario y checklist de inscripción

| Cuándo | Qué | Quién |
|---|---|---|
| **Hoy, antes de dormir** | Cada integrante: cuenta en **arena.colosseum.org** con país **Argentina**. Registrar el proyecto con ubicación Argentina | Todos |
| Hoy | Inscribirse en el Luma (luma.com/3qmbyb6h) | Todos |
| Hoy | Google Form (una sola persona por equipo). Pide: email, link de X, usuario de Telegram, y si ya te renombraste en Telegram como **"Nombre Apellido \| Keyhold"**. Tiene más páginas que no pude leer **[NV]** | Ani o Mauro |
| Hoy / mañana temprano | Crear la **cuenta de X del proyecto** (construir en público suma puntos) | Ani |
| **Dom 04/10, antes de las 16:00** | **Preselección** (superteam.ar/colosseum/preseleccion), ver los campos en §1.1 | Mauro + Ani |
| Dom 04/10, 19:30 | **Demo Day** (pitch en vivo si quedan preseleccionados) | Ani pitchea, Mauro hace la demo |
| 05 al 11/10 | Mentoría "Top Talent" (solo para seleccionados) | — |
| **12/10, 23:59 ART** | **Entrega en Superteam Earn** (track AR) | Mauro |
| 12/10, 23:59 PT = **13/10, 03:59 ART** | Cierre global de Colosseum. **Entregar igual el 12/10**: es una doble entrega obligatoria | Mauro |
| Antes del 28/10 | Ganadores del track AR | — |

Dudas de elegibilidad: **Nico Fernandez**, por Telegram (t.me/NicoFernandez17).

### 1.1 Campos de la preselección (dejar los textos listos esta noche)

- Nombre, mail, Telegram, ciudad y provincia (**Salta, Salta**)
- Nombre del proyecto
- **Una frase (máx. 140 caracteres).** Borrador:
  `AI agents for Argentine rental agencies: tenant pre-qualification, contracts and USDC deposit escrow on Solana.`
- Descripción (entre 50 y 2000 caracteres)
- Blockchains y herramientas: Solana (devnet), SPL Token, Memo program, Solana Pay; Claude/Gemini; Next.js; Vercel
- Logo (link, opcional)
- **Video de pitch de 2 min** y **demo de hasta 3 min** (YouTube, Loom o Drive). Pueden ser los mismos videos de la entrega final, siempre que estén **en inglés**
- **Repo de GitHub**, público, o privado compartido con `hackathon@superteam.ar` (y para Colosseum, `hackathon@colosseum.com`)
- Proyecto en Colosseum (opcional)
- Equipo (máx. 2000 caracteres: nombre, rol, experiencia y links)
- **Go-to-market y validación** (máx. 2000 caracteres). **No inventar tracción.** Contar el plan de validación y los contactos reales que tengan
- Checkbox de privacidad

---

## 2. Reglas que cambian decisiones de diseño

| Regla | Impacto |
|---|---|
| Solo se evalúa lo construido entre el 14/09 y el 12/10. El código previo se declara | **Repo nuevo** (`tuki-rentals`). Si se copia código de QPS o Tuki, va en un commit propio con mensaje explícito, por ejemplo `chore: import extractor module from que-pinta-salta (pre-existing, MIT)`. Sección **"Disclosures"** en el README |
| Earn pide un **starting-point record** y un **changelog semanal** | `CHANGELOG.md` desde hoy. Tag `v0-hackathon-start` en el primer commit |
| Hay que declarar el **uso material de IA** | Una línea en el README: "Code co-written with Claude Code; architecture, prompts and rules by the team" |
| Todo en inglés | UI, README, commits y videos en inglés. Los agentes responden en el idioma del usuario (la demo puede ser en inglés para el jurado) |
| Earn: 5 componentes (link deployado, repo con overview y seguridad, validación verificable, disclosures, equipo y roadmap) | Deploy en Vercel desde esta noche. La sección "Security considerations" va en el README |
| No mostrar personas ni material sin permiso en los videos | Datos 100% simulados. Nada de documentos reales |
| Premios: pago al Team Leader, KYC y prize docs, USDC | Definir **quién es Team Leader** antes de entregar |

**Premios donde encaja:** track AR (1.° 3.000 / 2.° 2.000 / 3.° 1.500 / 4.° 1.000 / 5.° 500 USDC) y los especiales **Best Product Experience**, **Most Traction** y Best Demo Day Pitch (500 USDC cada uno). A nivel global: **track Solana** (10 premios de USD 10k) y 20 Standout Teams (USD 15k cada uno). **No hay tracks temáticos** de IA, RWA o pagos: los tracks son por blockchain.

---

## 3. Demo de esta noche (00:00, máximo 01:00)

### 3.1 Principio de recorte

Para esta noche: **una tajada vertical que funciona de punta a punta, con transacciones reales en devnet**. El escrow en Anchor, la wallet embebida y el QR escaneable con Phantom quedan para la semana. En el video se dice con honestidad: *"custodial escrow on devnet today; Anchor program in progress"* (es el plan B de la sección 5.5 de la spec).

### 3.2 Qué entra y qué no

| Entra hoy | Queda para la semana |
|---|---|
| Chat con orquestador y máquina de estados (SEARCH → DOCUMENTS → CONTRACT → PAYMENT → ACTIVE) | Agente de visitas real. Hoy: una tool `book_visit` con slots fijos, solo si sobra tiempo |
| Agente `listings` sobre `seed/properties.json` (10 propiedades en Salta) | Programa Anchor `rental_escrow` + PDAs `Lease` / `PaymentRecord` |
| `prequal` + `crosscheck` con los 3 casos: Ana ✅, Bruno ⚠️ recibo de más de 90 días, Carla ⚠️ nombre distinto entre DNI y recibo | Solana Pay con QR escaneable y polling por `reference` |
| Contrato desde plantilla + `sha256` + botón **Verify** | Wallet embebida (Privy, Crossmint o Dynamic) |
| Pantalla de pago: precio normal tachado + precio con descuento (3% + 2%) | Historial on-chain desde PDAs, `release_deposit` 2 de 3 |
| **2 transacciones reales en devnet:** depósito → wallet de custodia y alquiler → landlord, ambas con **Memo** `lease:v1:<id>:<kind>:<hash>` y link al explorer | DB persistente (hoy alcanza con estado en memoria o JSON) |
| Franja visible **"Demo · Solana devnet · simulated data"** | Agentes de mantenimiento y analista (P2) |

### 3.3 Arquitectura de esta noche

```
app/
  page.tsx                      Client: chat (izq.) + "Lease timeline" animado con Framer Motion (der.)
  api/chat/route.ts             POST → orchestrator.run(sessionId, message)
  api/lease/route.ts            crea el contrato, devuelve texto + sha256
  api/pay/route.ts              POST {kind: deposit|rent} → firma en el server y devuelve signature + explorer URL
lib/
  agents/
    orchestrator.ts             stage → agente; cada etapa expone solo sus tools
    listings.ts                 tool search_properties / get_property (solo con datos del catálogo)
    prequal.ts                  el LLM EXTRAE campos → rules.ts DECIDE (APPROVED | NEEDS_INFO | REJECTED)
    crosscheck.ts               segunda pasada independiente: compara contra los documentos originales
    rules.ts                    reglas deterministas: antigüedad del recibo ≤ 90 días, nombre DNI == recibo, alquiler ≤ 35% del ingreso
    prompts.ts
  solana/
    connection.ts               devnet RPC
    transfer.ts                 transferChecked de tUSDC + instrucción Memo en la misma tx
    hash.ts                     sha256 (node:crypto)
    pricing.ts                  descuento con blockTime de la tx confirmada (nunca con un botón)
seed/properties.json, seed/tenants.json, seed/docs/*.json
scripts/setup-devnet.ts         keypairs (platform/custody, landlord, 3 tenants), mint "tUSDC" de 6 decimales, mint a tenants
```

**Decisiones clave:**
- **"El modelo extrae, el código decide"**, igual que en QPS. El LLM nunca aprueba a un inquilino: devuelve JSON estricto y `rules.ts` decide. Esto hace que los casos de Bruno y Carla salgan **siempre**, y además es un argumento fuerte ante jueces técnicos.
- **Firmas en el servidor con keypairs de devnet** guardadas en una env var (JSON del secret key). Sirve solo para la demo y se aclara en el README.
- **Token propio `tUSDC`** en vez del USDC de Circle en devnet: evita depender del faucet. Se presenta como "USDC (devnet test token)".
- **Descuento:** `rent * (10000 - bps) / 10000` en enteros. `on_time` se calcula comparando el `blockTime` de la transacción confirmada con `due_ts`. Para la demo, `due_ts` se pone en "mañana".
- **Fallback de IA:** modo `REPLAY=1` con las respuestas grabadas de los 3 casos, por si falla la API durante la grabación.
- **SDK:** `@solana/web3.js` 1.x + `@solana/spl-token`, porque es lo más documentado y tiene menos fricción esta noche. Migrar a `@solana/kit` no vale la pena hoy.
- **Modelo:** el que ya tengas funcionando. Si es Claude: `ANTHROPIC_MODEL=claude-sonnet-5-5` para el orquestador y `claude-haiku-4-5-20251001` para extracción barata. Si el extractor de QPS ya anda con Gemini, **no migrarlo esta noche**.

### 3.4 Cronograma

| Hora | Bloque | Criterio de "listo" |
|---|---|---|
| 20:45–21:00 | **Pedir SOL primero** en faucet.solana.com (los airdrops de devnet tienen rate limit). Repo nuevo + `create-next-app` + tag `v0-hackathon-start` | Repo en GitHub, deploy vacío en Vercel |
| 21:00–21:30 | `setup-devnet.ts` + seeds (10 propiedades, 3 inquilinos, documentos simulados) | Wallets con SOL y tUSDC, visibles en el explorer |
| 21:30–22:30 | Orquestador + `listings` + `prequal` + `crosscheck` + `rules.ts` | Ana aprobada, Bruno NEEDS_INFO, Carla con discrepancia, **3 de 3 veces** |
| 22:30–23:15 | Contrato + sha256 + Verify + pantalla de pago + 2 tx devnet con Memo | Links al explorer funcionando |
| 23:15–23:45 | Pulido de la UI (timeline, badge "On-time payment"), franja de demo, README en inglés con Disclosures + Security, deploy | URL pública funcionando |
| 23:45–00:30 | **Grabar la demo** (Loom, máximo 3 min), con el guion de §3.5 | Video subido |
| 00:30–01:00 | Buffer: repetir la toma o arreglar bugs | — |

**En paralelo, Ani:** guion del pitch (2 min), logo, cuenta de X, renombre en Telegram, Google Form y borradores en inglés de "Team" y "GTM & validation". El pitch se graba mañana a la mañana.

### 3.5 Guion de la demo (3 min, en inglés)

1. **0:00–0:20** Problema en una frase + franja "devnet · simulated data".
2. **0:20–0:50** El inquilino escribe: *"2-bedroom near Tres Cerritos, under 500 USDC, pets ok"*. Aparecen 2 o 3 propiedades, solo del catálogo.
3. **0:50–1:40** Suben documentos:
   - **Bruno:** el agente marca el recibo vencido.
   - **Carla:** `prequal` la aprueba, pero **`crosscheck` detecta el nombre distinto** y la pasa a NEEDS_INFO. Este es el momento "aha" del sistema multiagente.
   - **Ana:** aprobada.
4. **1:40–2:10** Contrato generado → hash → botón Verify ✅.
5. **2:10–2:45** Pantalla con dos precios → pago del depósito y del alquiler → **las transacciones se ven en el explorer de devnet con el Memo**.
6. **2:45–3:00** Qué viene esta semana: escrow en Anchor con liberación 2 de 3, Solana Pay QR, historial on-chain que reduce el depósito.

---

## 4. Reutilizar el equipo de agentes de Qué Pinta Salta

Lo que tengo registrado de QPS es la **arquitectura del pipeline**:
- Gemini 2.5 Flash como extractor multimodal (imagen + caption → JSON estricto).
- Un filtro determinista en TypeScript que decide entre auto-publicar y mandar a revisión.
- Un fallback que crea un DRAFT y lo manda a una cola de revisión humana con panel split-screen.

También tengo que habías decidido orquestar QPS con **agent teams de Claude Code**. **No tengo las definiciones de ese equipo**: los `.claude/agents/*.md`, los prompts, los roles ni el CLAUDE.md. **Adjuntámelos** o conectame la carpeta del repo.

Cómo se traslada el pipeline de QPS a Keyhold, aunque todavía no tenga esos archivos:

| QPS | Keyhold |
|---|---|
| Extractor multimodal flyer → JSON | Extractor de DNI / recibo / constancia → JSON (`prequal.ts`) |
| Filtro determinista título/fecha/hora/lugar | `rules.ts`: antigüedad ≤ 90 días, coincidencia de nombre, relación alquiler/ingreso |
| DRAFT + cola de revisión humana | `NEEDS_INFO` + revisión de la inmobiliaria (panel P2) |
| Dedup Jaccard | No aplica |

**Disclosure:** si copiás el módulo extractor, va en un commit separado y se declara en el README.

---

## 5. Investigación de mercado

### 5.1 Competidores pedidos (fetch del 03/10/2026)

| Portal | Avisos en Salta | Precios | IA | Flujo completo | Depósito o garantía | Modelo |
|---|---|---|---|---|---|---|
| Buscainmueble | 189 departamentos [V] | ARS 400k a 1,1M | No | No | Solo texto | Clasificados (grupo Clarín) |
| Zonaprop | 268 departamentos [V] | ARS 450k a 1,2M + expensas | No (WhatsApp/form) | No | Caución con SURA | Avisos pagos. Es de **QuintoAndar** |
| Argenprop | 195 departamentos en Capital (427 en total) [V] | Monoambiente 400k a 640k · 2 dormitorios 780k a 1,1M. **Solo 1 en USD** | No | No | **Garantías Argenprop**: unas 1,5 veces el alquiler, alquiler ≤ 35% del ingreso, 24 h | Avisos + garantías |
| REMAX | No se pudo contar (JS). REMAX NOA: 730 propiedades entre venta y alquiler | 2 dormitorios 650k a 950k | No | No | No | Franquicia con comisión |
| Rentola | 124 [V] | ARS 450k a 700k | **Sí** (búsqueda NL + alertas) | No | No | Suscripción al inquilino. Trustpilot **1,7 de 5** |

**Lectura:** hay entre 190 y 270 departamentos por portal, con mucha duplicación entre portales. **Ningún portal hace precalificación, contrato, pago y depósito.** El hueco está ahí, no en la búsqueda.

### 5.2 Competencia indirecta que conviene conocer

- **Fiador.sol** (hackathon de Superteam Brasil): escrow de depósito en stablecoins con rendimiento + sellos de reputación que **bajan el depósito futuro**. 21 instrucciones Anchor y 66 tests [V]. **Es el competidor más parecido: hay que poder explicar en qué se diferencia Keyhold.**
- **RentLock** (EE.UU.): escrow de alquiler y depósito en PDAs de Solana, con waitlist [V].
- **TuNota:** "Veraz de inquilinos" que alimentan las inmobiliarias. Está en Córdoba, Santa Fe, Mendoza, CABA y la Patagonia. **No está en Salta** [V]. Compite con el historial portable.
- **Hoggax / Finaer / SURA:** garantías y caución, con costo de 3% a 6% del contrato [S]. Hoggax no aparece en Salta. Antecedente: en 2019 la SSN sancionó a Finaer por vender un seguro sin autorización.
- **QuintoAndar (Brasil):** es el modelo de referencia del flujo completo con "Pagamento Garantido". Cobra al propietario 1 mes + 9,3% mensual de administración [V]. No lo replicó en Argentina [NV].
- **Agentes IA para inmobiliarias:** AgonProp (WhatsApp, agenda visitas, gratis), RealXpert, Roomix → **el agente de búsqueda y visitas no diferencia**.
- **Cripto y alquileres en Argentina:** primer contrato en bitcoin en Rosario (2024); CriptoAlquileres en beta con unos 10 avisos → **el nicho existe y es chico**.
- **Colosseum:** no hay ningún ganador previo en alquiler residencial (se revisaron Frontier, Cypherpunk y Radar) [V].

### 5.3 Contexto argentino y de Salta

- **Régimen actual (DNU 70/2023):** moneda, duración y ajuste libres. El art. 765 CCyC permite pactar en moneda extranjera. **Que USDC sea "moneda" a esos efectos es discutible** → lo más seguro es pactar en USD y aceptar USDC como forma de pago [NV].
- **Depósito (art. 1196 CCyC):** sin tope legal. Lo habitual son 1 o 2 meses. **No hay estadística de depósitos no devueltos**: es un dolor anecdótico.
- **El 15/10, sesión por el rechazo del DNU** [S]. Si prospera, se reporta que volverían: contratos de 3 años, índice oficial, depósito de 1 mes devuelto actualizado y prohibición de publicar en moneda extranjera. No sería retroactivo.
- **Salta alquila en pesos.** La oferta creció 60% y el poder de negociación lo tiene el inquilino (REMAX, marzo de 2026) [V].
- **Inquilinos:** 70,9% endeudados y un tercio destina alrededor del 50% del ingreso al alquiler (Inquilinos Agrupados, marzo de 2026) [V]. El 72,8% tiene problemas para conseguir garantía (Zonaprop, dato de **2020**) [V].
- **Stablecoins:** Argentina recibió USD 88.500M en cripto, 2.° en LATAM (Chainalysis, 09/2026) [V]. Pero **USDT 57% contra USDC 14%** de las compras (Bitso 2025) [V]. **Belo soporta USDC en Solana** [V].
- **Segmentos con dólares en Salta:** profesionales de la minería en la Puna, freelancers que cobran del exterior, y estudiantes del interior con padres que giran plata. UNSa tiene unos 38k alumnos y UCASAL unos 38k [V].
- **Regulación local:** la Ley 7629 (CUCIS) exige matrícula para intermediar [S]. **Por eso Keyhold tiene que ser software *para* inmobiliarias matriculadas, no un intermediario.**

### 5.4 Viabilidad (honesta)

| Pieza | Viabilidad | Por qué |
|---|---|---|
| Agente de búsqueda y visitas | Baja como diferencial | Es commodity |
| **Precalificación + control cruzado** | **Alta** | Es trabajo manual hoy en toda inmobiliaria. B2B claro |
| Escrow del depósito | Media | Le sirve al inquilino; al propietario hay que darle un incentivo. Necesita un árbitro para las disputas |
| Pago en USDC con descuento | **Baja en Salta** hoy | Mercado en pesos; USDC es la stablecoin minoritaria |
| Historial portable | Media | Tiene el problema del huevo y la gallina, y compite con TuNota. Gana valor si **reduce el depósito o la caución** |

**Quién paga:**
1. **Inmobiliarias (SaaS)**: el comprador más realista.
2. Propietarios: solo si hay cobro garantizado, que es negocio regulado (habría que asociarse con una aseguradora).
3. Inquilinos: baja disposición a pagar.

**Riesgos regulatorios:**
- DNU 70/2023 el 15/10.
- CNV RG 994/2024 (PSAV), si el escrow se considera custodia [NV].
- SSN, si se arma un pool de garantía.
- CUCIS.
- UIF/KYC.

### 5.5 Reposicionamiento recomendado (sin cambiar el producto)

> **"AI leasing back-office for real-estate agencies in Argentina's interior. Agents pre-qualify tenants and draft contracts; Solana makes the deposit and the payment record trustless and portable."**

1. **B2B primero.** La inmobiliaria es la que opera Keyhold y además **actúa como árbitro** en la liberación del depósito.
2. **Liberación 2 de 3** (inquilino, propietario, inmobiliaria) en el programa Anchor. Resuelve las disputas sin un oráculo mágico y es un diferencial técnico concreto frente a Fiador.sol y RentLock.
3. **Pesos como opción por defecto en el roadmap** (on/off-ramp vía Belo u otro proveedor) y **USDC como capa de liquidación y registro**. En la hackathon USDC es el protagonista, pero hay que mostrar cómo encaja el inquilino que paga en pesos.
4. **El historial reduce el depósito:** con 6 pagos puntuales, el siguiente contrato pide medio depósito. Esto le da un incentivo concreto al inquilino y un dato de riesgo a la inmobiliaria.
5. **Privacidad por diseño:** on-chain solo van hashes y montos. Es un argumento que conecta con jueces de privacidad (Arcium).
6. **Nicho de lanzamiento:** profesionales de la minería y estudiantes de otras provincias, que son quienes ya manejan dólares o stablecoins.

### 5.6 Validación para esta semana (cuenta para el componente 3 de Earn y para "Most Traction")

1. **5 inmobiliarias de Salta** (incluida REMAX NOA). Preguntas:
   - ¿Pagarían por la precalificación automática?
   - ¿Cuántos depósitos terminan en disputa?
   - ¿Aceptarían cobrar vía USDC?
   - **Pedir una carta de intención o un piloto.**
2. **5 propietarios directos** (de Marketplace o Buscainmueble).
3. **Encuesta a 30 inquilinos o estudiantes** (UNSa y UCASAL): ¿les devolvieron el depósito?, ¿usan Belo, Lemon o Binance?
4. **Consulta legal corta** sobre art. 765 + USDC, PSAV y CUCIS.
5. Benchmark de 30 minutos de Fiador.sol y RentLock → resumir el diferencial en una línea.

**Guardar evidencia verificable** de todo: capturas, formularios y cartas.

---

## 6. Criterios de evaluación y jurado

### 6.1 Criterios oficiales (reglas de Colosseum, sin ponderación publicada)

| Criterio | Estado actual del proyecto | Cómo subirlo |
|---|---|---|
| **Functionality** (funciona y calidad de código) | Con el plan de hoy: flujo en devnet con escrow de custodia | Programa Anchor con tests (los 4 casos de descuento, pago duplicado, montos que no suman, firmante incorrecto) |
| **Potential impact** (TAM y ecosistema) | Salta solo es un mercado chico | Contar como el interior de Argentina → LATAM; usar Chainalysis; mostrar el volumen de USDC que movería un piloto |
| **Novelty** | Fiador.sol y RentLock ya existen | Agente de control cruzado + liberación 2 de 3 con la inmobiliaria como árbitro + historial que reduce el depósito |
| **UX con blockchain** | La wallet de server es un parche | Wallet embebida + Solana Pay QR. **La palabra "blockchain" no aparece en la UI del inquilino** |
| **Open-source / composability** | — | Repo público con licencia MIT; compone con SPL Token, Solana Pay y Memo (y Bubblegum, opcional) |
| **Business plan** | Hoy sería B2C con USDC, lo más débil | B2B SaaS para inmobiliarias + plan de validación + precio de referencia |

**Lo que suma en el FAQ y en superteam.ar:** founder–market fit, insight, ejecución, comunicación, viabilidad y **tracción**.

**Founder–market fit de ustedes:**
- Son de Salta.
- Mauro ya llevó un asistente IA (Tuki) a una propuesta formal con la Municipalidad.
- Mauro hizo un pipeline de IA en producción (QPS) con el mismo patrón de extracción + reglas.

**Eso va en el pitch.**

### 6.2 Jurado del track Superteam Argentina

**No hay jueces nombrados en ninguna página** [V]. Lo más probable es que sea gente de Superteam AR, con foco en los criterios de superteam.ar.

Qué van a mirar:
- Que el equipo cumpla los requisitos (país Argentina, inglés, disclosures).
- Que el pitch sea claro.
- Que haya progreso real durante la semana (changelog).
- **Tracción local verificable.**

Opinión probable: les va a gustar el foco local y el problema concreto. Van a preguntar **"¿quién en Salta paga en USDC?"**.

Mejora: llegar al Demo Day con al menos **una inmobiliaria salteña** dispuesta a probar, y una respuesta clara sobre los pesos.

### 6.3 Jurado global (colosseum.com/worldsfair, 21 jueces)

No se publica qué juez evalúa qué track. La asignación es inferencia.

**Equipo Colosseum**

- **Clay Robbins** (cofundador; ex Slow Ventures, 0x, Square)
  - Mira: negocio, crecimiento y founder–market fit.
  - Opinión probable: "¿por qué el propietario aceptaría el escrow?".
  - Mejora: incentivo para el propietario + B2B + el modelo de QuintoAndar como referencia.
- **Matty Taylor** (cofundador; armó los hackathons de Solana Foundation)
  - Mira: el pitch video, la priorización justificada, la iteración con usuarios. Desconfía del "AI slop".
  - Opinión probable: si la demo parece un chat genérico, pierde.
  - Mejora: mostrar el agente que **frena** un caso (Bruno, Carla) con reglas deterministas, y explicar por qué se dejó la búsqueda en segundo plano.
- **Nate Levine** (cofundador; ex equipo cripto de Stripe, LendUp)
  - Mira: infraestructura de pagos, correctitud y seguridad.
  - Opinión probable: va a revisar si el escrow es real.
  - Mejora: programa Anchor con `checked_*`, tests y sección de seguridad en el README. Decir con honestidad qué es custodia.
- **Max Monciardini** (ingeniero; autor de Colosseum Copilot)
  - Mira: código y originalidad frente a las 8.286 entregas anteriores.
  - Mejora: **correr Colosseum Copilot** antes de entregar, con el prompt "What's the weakest part of my submission?".
- **Michael Rinko** (Associate) [NV]
  - Lente de inversor: tamaño de mercado y tracción.

**Track judges**

- **Sitaram** (cofundador de Avici, stablecoin banking; su roadmap incluye hipotecas on-chain y credit scoring) — **el más alineado**
  - Mira: casos reales de stablecoins y seguridad. Avici sufrió un hack en agosto de 2026.
  - Opinión probable: interés en el historial como **credit score de alquiler**.
  - Mejora: presentar el historial como una primitiva de crédito y mostrar la superficie de seguridad del escrow.
- **Jed Halfon** (CSO de Anza; ex Head of Tokenization en Republic)
  - Mira: RWA y tokenización bien encuadrada legalmente.
  - Opinión probable: preguntará por el marco legal del contrato y del USDC.
  - Mejora: slide "regime-agnostic" + hashes del contrato on-chain y el contrato legal off-chain.
- **Jill Gunter** (Espresso Systems; ex trader de deuda emergente en Goldman Sachs)
  - Mira: casos de uso de mercados emergentes.
  - Opinión probable: va a entender la dolarización argentina.
  - Mejora: contar el contexto macro en 15 segundos, con datos.
- **Arihant Bansal** (ingeniero; "agents, distributed systems, cryptography", repos de stablecoins confidenciales)
  - Mira: arquitectura multiagente seria.
  - Mejora: diagrama del orquestador, tools por etapa, crosscheck independiente.
- **w.sol** (DevRel en Drift; workshops de pagos con IA)
  - Mira: agentes que mueven dinero.
  - Mejora: mostrar que el agente **prepara** el pago y la firma es del usuario. Nunca autonomía total sobre los fondos.
- **Adam Gutierrez** (DevRel en Phantom)
  - Mira: UX de wallet y Solana Pay.
  - Mejora: QR de Solana Pay que se paga con Phantom en devnet, en vivo.
- **Julian Deschler** (Arcium, confidential computing) y **Milian** (marketing en Arcium) [NV]
  - Miran: privacidad de los datos del inquilino.
  - Mejora: "no PII on-chain" explícito. Roadmap: validación confidencial de ingresos.
- **Dean (Realms, gobernanza)**
  - Mira: mecanismos de decisión.
  - Mejora: la liberación 2 de 3 como mini-gobernanza de la disputa.
- **Ray Zhang** (Ellipsis Labs, DEX Phoenix)
  - Mira: calidad on-chain.
  - Mejora: tests del programa y cuentas bien diseñadas.
- **Daniel Sapkota** (Lightcone) [parcialmente verificado]
  - Mira: mecanismos on-chain novedosos.
- **Mitchell** (fundraising en MetaDAO) [NV]
  - Mira: viabilidad para levantar capital.
  - Mejora: un roadmap creíble más allá de la hackathon.
- **LBO** (angel) [NV]
  - Lente de inversor: tracción y tamaño de mercado.
- **Binji, Julian Ma** (Ethlabs) y **David Tso** (Base)
  - Probablemente juzguen los tracks de Ethereum y Base. Bajo impacto para ustedes.

---

## 7. Mejoras concretas al proyecto (prioridad para la semana)

1. **Programa Anchor** con `release_deposit` **2 de 3** (inquilino, propietario, inmobiliaria) + tests → sube Functionality y Novelty.
2. **Solana Pay QR real** + wallet embebida → sube UX y apunta a Best Product Experience.
3. **El historial reduce el depósito** (regla on-chain sobre `on_time_streak`) → sube Novelty y Business.
4. **Panel de inmobiliaria** (P2 → P1) con la cola de NEEDS_INFO, porque **el comprador es la inmobiliaria**.
5. **Validación verificable** (§5.6) → sube Traction y apunta a Most Traction.
6. **Narrativa con los pesos:** el slide de roadmap con on-ramp.
7. **Colosseum Copilot** + `CHANGELOG.md` semanal + video de update de 1 minuto por semana (opcional, pero suma).

---

## 8. Pendientes y cosas a verificar

- [ ] Que todo el equipo esté registrado con país Argentina (confirmar con Nico Fernandez si alcanza con "al menos un cofundador" o si tienen que ser todos).
- [ ] Páginas 2 en adelante del Google Form (no se pudieron leer).
- [ ] Deadline exacto del listing de Earn (la página es JS).
- [ ] Composición del jurado del track AR y del Demo Day.
- [ ] Resultado de la sesión del 15/10 sobre el DNU 70/2023.
- [ ] Las definiciones del equipo de agentes de QPS (`.claude/agents`, prompts).

---

## Fuentes

**Hackathon**
- [superteam.ar/colosseum](https://superteam.ar/colosseum)
- [Preselección](https://superteam.ar/colosseum/preseleccion)
- [Superteam Earn – track AR](https://superteam.fun/earn/listing/colosseum-crypto-worlds-fair-hackathon-superteam-argentina-track)
- [Luma](https://luma.com/3qmbyb6h)
- [Reglas oficiales (PDF)](https://colosseum.com/legal/Crypto%20World%27s%20Fair%20Hackathon%20Rules.pdf)
- [FAQ Colosseum](https://colosseum.com/hackathon)
- [Jueces](https://colosseum.com/worldsfair)
- [How to win a Colosseum hackathon](https://blog.colosseum.com/how-to-win-a-colosseum-hackathon/)
- [Perfecting your submission](https://blog.colosseum.com/perfecting-your-hackathon-submission/)
- [Colosseum Copilot v2](https://solanacompass.com/news/colosseum-copilot-v2-can-now-review-your-solana-project-against-8286-hackathon-submissions)

**Mercado**
- [Argenprop Salta Capital](https://www.argenprop.com/departamentos/alquiler/salta-capital)
- [Buscainmueble](https://www.buscainmueble.com/departamentos/alquiler/salta)
- [Zonaprop](https://www.zonaprop.com.ar/departamentos-alquiler-salta-sa.html)
- [Rentola](https://rentola.ar/alquiler/salta)
- [Rentola en Trustpilot](https://www.trustpilot.com/review/rentola.es)
- [Garantías Argenprop](https://www.argenprop.com/garantias-alquiler)
- [Fiador.sol](https://github.com/SauloEdu/fiador-sol)
- [RentLock](https://rentlock.io/)
- [TuNota](https://infonegocios.info/nota-principal/como-funciona-el-veraz-de-los-inquilinos-la-herramienta-web-que-quiere-cambiar-como-se-deciden-los-alquileres)
- [QuintoAndar – tasas](https://www.quintoandar.com.br/ajuda/artigo/o-que-sao-as-taxas-de-corretagem-e-de-administracao-quintoandar-2nZK439me9hAOqWPyQoepn)
- [REMAX – oferta en Salta (Informate Salta)](https://informatesalta.com.ar/lup-94-7-salta/alquileres---crecio-un-60--la-oferta-de-alquileres-en-salta-_a69aaf467333df52be0a0f62f)
- [Inquilinos Agrupados (Ámbito)](https://www.ambito.com/real-estate/inquilinos-problemas-el-70-esta-endeudado-y-cada-vez-cuesta-mas-pagar-el-alquiler-mensual-n6261302)
- [Chainalysis LATAM 2026](https://www.chainalysis.com/blog/latin-america-crypto-adoption-2026/)
- [Bitso 2025](https://mercado.com.ar/finanzas/bitso-stablecoins-concentraron-71-de-compras-cripto-en-argentina-durante-2025)
- [Belo – redes](https://help.belo.app/en/articles/5964418-which-networks-are-supported-by-belo)
- [Sesión DNU 70/2023 (Parlamentario)](https://www.parlamentario.com/2026/10/03/que-volveria-a-cambiar-en-la-argentina-si-el-congreso-voltea-el-dnu-70-23/)
- [Depósito y art. 1196 (La Nación)](https://www.lanacion.com.ar/propiedades/casas-y-departamentos/que-pasa-si-el-dueno-no-te-devuelve-el-deposito-del-alquiler-lo-que-dice-la-ley-y-como-reclamarlo-nid27062026/)
- [CNV PSAV](https://www.argentina.gob.ar/noticias/la-cnv-crea-el-registro-de-proveedores-de-servicios-de-activos-virtuales-psav)
- [Universidades de Salta](https://cuartopodersalta.com.ar/universidades-en-salta-la-puja-entre-lo-publico-y-privado/)
- [Ganadores Frontier](https://blog.colosseum.com/announcing-the-winners-of-the-solana-frontier-hackathon/)
- [Ganadores Cypherpunk](https://blog.colosseum.com/announcing-the-winners-of-the-solana-cypherpunk-hackathon/)
