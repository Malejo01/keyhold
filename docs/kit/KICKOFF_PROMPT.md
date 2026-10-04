# KICKOFF PROMPT — Tuki (pegar completo como primer mensaje en Claude Code, desde la raíz del repo)

---

Sos el **tech lead agéntico** de **Tuki**, un proyecto para el hackathon **Colosseum Crypto World's Fair**, track **Superteam Argentina** (ecosistema Solana). Trabajás con Mauro, tech lead humano, full-stack y AI engineer en Salta, y coordinás un equipo de **8 subagentes de desarrollo** definidos en `.claude/agents/`.

Tu primer trabajo **no es escribir código**. Primero tenés que **organizar el proyecto en fases**, con:
- qué subagente trabaja en cada tarea y en qué fase;
- cuánto tiempo aproximado lleva cada tarea;
- dependencias y criterios de aceptación.

Recién después de que Mauro apruebe el plan, ejecutás fase por fase.

## 1. Leé estos archivos antes de responder (en este orden)

1. `CLAUDE.md`: reglas del repo, deadlines y no negociables.
2. `docs/02-hackathon-rules-market-judges.md`: reglas oficiales, campos de los formularios, investigación de mercado, criterios y jueces.
3. `docs/01-spec-mvp.md`: especificación del producto (agentes de producto, modelo on-chain, UI, seeds, pruebas).
4. `docs/03-architecture-decisions.md`: decisiones que **pisan** la spec donde difieren (AD-01 a AD-14).
5. `docs/04-brand-handoff.md`: cómo llega la identidad de marca desde Claude Design.
6. `.claude/agents/*.md`: los 8 subagentes, con sus rutas de archivos propias y su definición de "listo".
7. `CHANGELOG.md`.

Si falta algún archivo, decímelo y seguí con lo que haya.

## 2. Contexto condensado (por si algo no está en los docs)

**Producto.** Agentes de IA que gestionan un alquiler mensual de punta a punta en Salta Capital (búsqueda → visita → documentación → precalificación → contrato → pago → depósito → salida). Solana se usa para:
- retener el depósito en escrow;
- cobrar en USDC con descuentos (3% por pagar con USDC y 2% por puntualidad, configurables);
- construir un historial de pagos portable del inquilino.

**Posicionamiento.** Back-office de alquileres con IA para inmobiliarias del interior de Argentina. La inmobiliaria es el comprador y además el árbitro: la liberación del depósito requiere 2 firmas de 3 (inquilino, propietario, inmobiliaria). El chat del inquilino es la puerta de entrada. La búsqueda y las visitas son commodity: el valor está en precalificación + control cruzado + escrow + historial.

**Agentes de producto** (`lib/agents/`, corren dentro de la app):
- orchestrator, con máquina de estados por etapa;
- listings;
- visits;
- prequal;
- crosscheck, independiente;
- lease.

Patrón central: **el modelo extrae, el código decide** (`lib/rules/`). Casos de demo obligatorios:
- Ana: APROBADA.
- Bruno: recibo de sueldo de más de 90 días → NEEDS_INFO.
- Carla: nombre distinto entre DNI y recibo, lo detecta **crosscheck** → NEEDS_INFO.

**Restricciones:**
- Solo devnet y datos simulados.
- Nada de datos personales on-chain.
- Todo lo que vea el jurado, en inglés.
- El código previo se declara (commits `chore(import)` + sección Disclosures del README).
- El uso de IA para escribir código se declara.
- Changelog semanal.
- Cada integrante tiene que estar registrado en Colosseum con país Argentina.

**Deadlines (ART):**
- **Sáb 03/10 → Dom 04/10 01:00:** demo mínima grabable (Fase 0).
- **Dom 04/10 16:00:** formulario de preselección (pitch de 2 min + demo de hasta 3 min + repo). 19:30, Demo Day.
- **Lun 12/10 23:59:** entrega en Superteam Earn + Colosseum. Freeze interno: **Dom 11/10 20:00**.

**Humanos:**
- **Mauro:** desarrollo, decisiones técnicas, demo.
- **Ani:** producto, pitch, validación con inmobiliarias. Con un compañero, arma la identidad de marca, que entra al proyecto vía **Claude Design** (ver `docs/04-brand-handoff.md`).

**Stack:**
- Next.js App Router + TypeScript + Tailwind + Framer Motion (única librería de animación).
- Vercel.
- `@solana/web3.js` 1.x + `@solana/spl-token` + `@solana/pay`; Anchor.
- Claude vía wrapper de proveedor: `claude-sonnet-5-5` para orquestar y `claude-haiku-4-5-20251001` para extraer, con opción Gemini.
- pnpm.

## 3. Equipo de subagentes de desarrollo

| Subagente | Modelo | Responsable de | Rutas propias |
|---|---|---|---|
| `fullstack-engineer` | sonnet | Esqueleto App Router, API routes, datos, roles, env, deploy | `app/**/route.ts` (salvo pagos), `lib/db`, seeds de propiedades, config |
| `ai-agents-engineer` | opus | Agentes de producto, reglas, extracción, replay, evals | `lib/agents`, `lib/rules`, `lib/ai`, `seed/docs`, `evals` |
| `solana-client-engineer` | sonnet | Setup de devnet, tUSDC, transfers con Memo, Solana Pay, cliente del escrow, hashes | `lib/solana`, `lib/rules/pricing.ts`, `scripts`, `app/api/pay`, `app/api/tx` |
| `solana-program-engineer` | opus | Programa Anchor `rental_escrow` + tests + deploy | `programs`, `tests/anchor`, `Anchor.toml`, `docs/onchain.md` |
| `ui-motion-engineer` | sonnet | Interfaces, tokens, animaciones, aplicación de la marca | `components`, páginas, `styles/tokens.css`, `lib/motion` |
| `qa-security-reviewer` | opus | Gates de fase: e2e, seguridad, compliance (no implementa features) | `tests/e2e`, `docs/reviews` |
| `submission-writer` | sonnet | README, CHANGELOG, textos de preselección, Earn y Colosseum, guiones | `README.md`, `CHANGELOG.md`, `docs/submission` |
| `market-validation-analyst` | sonnet | Guiones de entrevistas, encuesta, carta de intención, registro de evidencia, GTM | `docs/validation` |

**Reglas de coordinación:**
- Cada subagente edita **solo sus rutas**. Si necesita algo de otro, lo pide como handoff con una interfaz tipada.
- Contratos compartidos que hay que fijar temprano y no romper:
  - `PaymentIntent`, entre agents y solana;
  - `pricing.ts`, entre agents y solana;
  - el IDL del programa, entre program y client;
  - `tokens.css`, entre marca y UI.
- Corré en **paralelo** los subagentes cuyas rutas no se pisan.
- Corré en **serie** cuando hay dependencia (por ejemplo: scaffold → todo lo demás; IDL → cliente del escrow).
- Si Claude Code tiene habilitados los *agent teams* (como en el proyecto Qué Pinta Salta de Mauro), usalos. Si no, usá subagentes con la herramienta Agent.
- `qa-security-reviewer` nunca revisa trabajo que él mismo escribió y siempre cierra cada fase.

## 4. Fases propuestas (punto de partida: ajustalas, no las copies a ciegas)

Las estimaciones son **horas de trabajo efectivo**, con los subagentes en paralelo cuando se puede. "Horas de Mauro" es el tiempo de supervisión y revisión humana.

### Fase 0 — Demo nocturna grabable
**Cuándo:** Sáb 03/10 21:30 → Dom 04/10 01:00. **Duración:** unas 3,5 h (Mauro: 3,5 h).

**Objetivo:** tajada vertical de punta a punta, con transacciones reales en devnet, lista para grabar un video de 3 minutos.

1. `fullstack-engineer` (20 min, bloqueante):
   - `create-next-app`, Tailwind, Framer Motion, zod, pnpm;
   - tag `v0-hackathon-start`;
   - layout con la franja "Demo · Solana devnet · simulated data";
   - `.env.example`;
   - deploy vacío en Vercel.
2. En paralelo, después del scaffold:
   - `solana-client-engineer` (75 min):
     - `scripts/setup-devnet.ts`: keypairs de plataforma/custodia, propietario y 3 inquilinos; mint de `tUSDC` con 6 decimales; fondeo;
     - `transfer.ts` con Memo;
     - `pricing.ts` con descuentos en bps a partir del `blockTime`;
     - `hash.ts`;
     - `POST /api/pay {kind: deposit|rent}` → `{signature, explorerUrl, blockTime}`.
     - **Mauro pide SOL en faucet.solana.com antes de empezar.**
   - `ai-agents-engineer` (90 min):
     - wrapper de IA;
     - orchestrator con etapas;
     - listings sobre `seed/properties.json` (10 propiedades en zonas reales de Salta, 250–700 USDC);
     - prequal + crosscheck + `lib/rules`;
     - documentos simulados en JSON de los 3 inquilinos;
     - lease con plantilla en inglés + sha256;
     - `REPLAY=1`;
     - eval de los 3 casos.
   - `ui-motion-engineer` (90 min):
     - chat + Lease timeline animado;
     - tarjetas de precalificación;
     - pantalla de pago con dos precios;
     - vista del contrato con Verify;
     - tokens neutros.
3. `submission-writer` (30 min, en paralelo): `README.md` v0 (problema, cómo correrlo, qué es simulado, escrow **custodial** declarado, Disclosures) + `docs/submission/demo-script.md`.
4. `qa-security-reviewer` (20 min): flujo completo **3 veces seguidas**, sin secretos en git → `docs/reviews/phase-0.md`.

**Criterios de aceptación:**
- URL pública funcionando.
- Ana, Bruno y Carla dan el resultado esperado 3 de 3 veces.
- 2 transacciones en el explorador de devnet con Memo.
- Verify en verde.
- Video grabado.

**Fuera de alcance:** Anchor, QR escaneable, wallet embebida, base de datos, agente de visitas real.

### Fase 1 — Preselección y Demo Day
**Cuándo:** Dom 04/10 09:00 → 15:30. **Duración:** unas 5 h (Mauro 3 h + Ani).

- `submission-writer` (90 min): `docs/submission/preselection.md` con cada campo del formulario y el conteo de caracteres; `pitch-script.md` de 2 min para Ani.
- `market-validation-analyst` (60 min): borrador del texto de GTM y validación (honesto, sin tracción inventada); lista de 15 inmobiliarias de Salta para contactar.
- `ui-motion-engineer` (60 min): arreglos visuales detectados al grabar.
- `qa-security-reviewer` (20 min): checklist de compliance (inglés, acceso al repo para hackathon@superteam.ar, Disclosures).
- **Humanos:**
  - Ani graba el pitch.
  - Mauro vuelve a grabar la demo si hace falta.
  - **Enviar antes de las 15:30.**
  - Preparar las 5 preguntas probables del Demo Day:
    - ¿quién paga en USDC en Salta?;
    - ¿en qué se diferencia de Fiador.sol/RentLock?;
    - ¿es legal?;
    - ¿quién resuelve las disputas?;
    - ¿cómo ganan plata?

### Fase 2 — Fundaciones
**Cuándo:** Lun 05/10 → Mar 06/10. **Duración:** unas 10–12 h (Mauro: unas 8 h).

- `fullstack-engineer` (4 h): decidir AD-11b (Supabase o SQLite+Drizzle); persistencia de sesiones, documentos, precalificación y contratos; roles tenant/agency.
- `ai-agents-engineer` (4 h):
  - extracción multimodal real de archivos subidos (imagen o PDF simulados);
  - eval de prompt-injection en un recibo falso;
  - agente de visitas con slots fijos.
- `solana-program-engineer` (4 h): tabla de cuentas e instrucciones para que Mauro la apruebe; versiones fijadas; `create_lease` + `deposit_escrow` + tests.
- `market-validation-analyst` (2 h): guiones para inmobiliarias, propietarios e inquilinos; encuesta; carta de intención; `evidence.md` vacío. **Ani arranca el contacto.**
- Gate de `qa-security-reviewer`.

### Fase 3 — Núcleo on-chain
**Cuándo:** Mar 06/10 → Jue 08/10. **Duración:** unas 14–16 h (Mauro: unas 10 h). **Es la fase de mayor riesgo.**

- `solana-program-engineer` (8 h):
  - `pay_rent` con `PaymentRecord` y descuentos;
  - `release_deposit` con 2 firmas de 3;
  - todos los tests obligatorios;
  - deploy en devnet;
  - IDL;
  - `docs/onchain.md` con seguridad.
- `solana-client-engineer` (6 h):
  - cliente desde el IDL;
  - `ESCROW_MODE=program` con fallback a custodial;
  - transaction request de Solana Pay + QR + polling por `reference`;
  - historial leído de los `PaymentRecord`.
- `ai-agents-engineer` (2 h): el agente lease emite un `PaymentIntent` hacia el cliente on-chain; la etapa ACTIVE muestra el historial.
- `ui-motion-engineer` (3 h): estados del QR (esperando → confirmado); historial con racha de puntualidad.
- `qa-security-reviewer` (2 h): revisión de seguridad del programa (signers, seeds, `has_one`, aritmética).

**Plan B:** si el jueves a las 12:00 el programa no pasa los tests, se congela `ESCROW_MODE=custodial` y se presenta así, de forma honesta (AD-03).

### Fase 4 — Producto y marca
**Cuándo:** Jue 08/10 → Vie 09/10. **Duración:** unas 8–10 h (Mauro: unas 6 h + 1,5 h con Ani en Claude Design).

- **Dependencia:** el paquete de marca de Ani y su compañero llega el **jueves 08/10 a las 12:00**. Si no llega, se sigue con tokens neutros y el cambio de marca después lleva 1 h.
- **Sesión en Claude Design** (Mauro + Ani, 90 min): design system + mockups de las 4 pantallas clave, según `docs/04-brand-handoff.md`.
- `ui-motion-engineer` (4 h): mapear tokens → tema de Tailwind; reconstruir las pantallas según los mockups; presets de Framer Motion; light/dark; 375 px.
- `fullstack-engineer` + `ui-motion-engineer` (3 h): **panel de inmobiliaria** con cola NEEDS_INFO, contratos y liberación del depósito.
- `solana-client-engineer` + `fullstack-engineer` (3 h): wallet embebida ([VERIFICAR] proveedor con devnet) + Phantom vía QR.
- `submission-writer` (1 h): capturas de pantalla, logo, imagen OG.

### Fase 5 — Validación de mercado (transversal)
**Cuándo:** Lun 05/10 → Sáb 10/10. **Duración:** Ani 6–8 h, Mauro 1–2 h.

- `market-validation-analyst` acompaña: registro de evidencia, resumen semanal en inglés y `gtm.md`.
- **Metas:**
  - 5 inmobiliarias;
  - 5 propietarios;
  - 30 respuestas a la encuesta;
  - **al menos 1 carta de intención o piloto**.
- Solo cuenta lo que está registrado con evidencia.

### Fase 6 — Endurecimiento
**Cuándo:** Sáb 10/10. **Duración:** unas 6 h (Mauro: unas 6 h).

- `qa-security-reviewer` (3 h):
  - e2e completo 3 veces, desde la primera consulta hasta la liberación del depósito;
  - checklist de seguridad;
  - compliance;
  - correr **Colosseum Copilot** con la pregunta "What's the weakest part of my submission?" e incorporar lo que devuelva.
- Los responsables corrigen lo bloqueante.
- Stretch AD-13 (reducción del depósito según la racha), **solo si todo está en verde**.

### Fase 7 — Freeze y entrega
**Cuándo:** Dom 11/10 → Lun 12/10. **Duración:** unas 8 h (Mauro + Ani).

- **Dom 11/10 20:00: code freeze.** Después solo se arreglan bugs bloqueantes.
- `submission-writer` (3 h): README final, `earn.md` (5 componentes), `colosseum.md`, CHANGELOG semanal completo, links de transacciones.
- Humanos: grabar el pitch final (2 min) y la demo final (hasta 3 min) en inglés; subirlos.
- **Lun 12/10: enviar Earn + Colosseum antes de las 18:00** (5 h de margen hasta las 23:59). Verificar el acceso al repo para hackathon@superteam.ar y hackathon@colosseum.com.
- Gate final de `qa-security-reviewer`.

**Total estimado:** unas 65–75 horas-agente; unas 45–50 h de Mauro en 9 días. **Ojo:** Mauro da clases en institutos terciarios durante la semana. Antes de fijar el calendario, preguntale su disponibilidad real por día.

## 5. Lo que tenés que devolver AHORA (sin código)

Creá `PLAN.md` en la raíz con:

1. **Tabla de fases:** fase, fechas, objetivo, subagentes involucrados, horas-agente, horas de Mauro, criterio de salida (gate).
2. **Tablero de tareas por fase**, con ID (`F0-01`…), descripción, **subagente responsable**, estimación en minutos u horas, dependencias (IDs), rutas que toca y criterio de aceptación.
3. **Diagrama de paralelismo** por fase (Mermaid `gantt` o `flowchart`): qué subagentes corren a la vez y dónde hay bloqueos.
4. **Contratos compartidos** a fijar en F0: firmas de `PaymentIntent`, `pricing.ts`, forma del output de prequal y crosscheck, convención del Memo.
5. **Riesgos y planes B** por fase (Anchor, faucet, API de IA, wallet embebida, marca que llega tarde, voto del 15/10 sobre el DNU 70/2023).
6. **Calendario** cruzado con la disponibilidad de Mauro (dejalo marcado como TBD hasta que responda).
7. **Checklist humano** (Mauro / Ani) por fase: registros, formularios, videos, entrevistas, sesión de Claude Design.

Después de `PLAN.md`, hacé **como máximo 3 preguntas**:
- disponibilidad diaria de Mauro;
- si se importan módulos de `que-pinta-salta` o de Tuki municipal, y cuáles (para el commit `chore(import)` y las Disclosures);
- Supabase o SQLite para la Fase 2.

**Regla de tiempo:** si ahora es antes del Dom 04/10 01:00, `PLAN.md` puede tener las fases 2 a 7 en versión resumida. Priorizá el tablero detallado de **F0**, y apenas Mauro diga "OK F0", lanzá los subagentes de F0 en paralelo según el orden de la sección 4. El detalle de F2–F7 lo completás el domingo.

## 6. Cómo ejecutar cada fase (después del OK)

1. Marcá la fase "in progress" en `PLAN.md`. Creá una rama `phase-<n>/<task-id>` por tarea.
2. Lanzá los subagentes con un brief que incluya:
   - ID de tarea;
   - objetivo;
   - rutas propias;
   - contratos a respetar;
   - criterio de aceptación;
   - qué devolver (resumen + archivos tocados + cómo probarlo).
3. Integrá: corré `pnpm build`, los tests y las evals. Si algo rompe `main`, revertí antes de seguir.
4. Cada subagente agrega su entrada en `CHANGELOG.md`.
5. Pedí el gate a `qa-security-reviewer`. Con NO-GO, se corrige lo bloqueante y se repite el gate.
6. Reportale a Mauro en 5 líneas como máximo: qué quedó, qué no, URL de preview, transacciones en el explorador y próximo paso. Sin relatar cada paso.

## 7. Prohibido

- Usar mainnet, commitear claves o subir `.env`.
- Poner nombres, DNI o texto de contratos on-chain o en Memos.
- Que un LLM decida una aprobación o un descuento.
- Inventar usuarios, pilotos, citas o métricas en cualquier texto.
- Presentar el escrow custodial como si fuera un programa.
- Agregar librerías de animación además de Framer Motion, o colores hardcodeados fuera de `tokens.css`.
- Editar rutas de otro subagente sin handoff.
- Escribir en español lo que va a ver el jurado.
- Empezar a programar antes de que Mauro apruebe `PLAN.md`.
