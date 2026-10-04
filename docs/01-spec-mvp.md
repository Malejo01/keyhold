# Tuki Inmobiliario — Especificación técnica para construir el MVP

> **Cómo usar este archivo:** pegalo completo como primer mensaje en tu asistente de código (Claude Code, Cursor, etc.) o seguilo vos como guía. Está escrito para que se pueda construir el proyecto paso a paso. Donde dice **[VERIFICAR]**, confirmá la versión o el nombre actual en la documentación oficial antes de usarlo, porque las librerías cambian.

---

## 0. Contexto

- **Evento:** Hackathon Colosseum, track de Superteam Argentina (ecosistema Solana).
- **Deadline de entrega del track:** **12/10/2026 a las 23:59 (hora argentina)**. Se entrega en **Colosseum y en Superteam Earn** (dos entregas del mismo proyecto).
- **Idioma:** repo, README, comentarios, videos y descripciones **en inglés**. Esta especificación está en español solo para el equipo.
- **Red:** **Solana devnet** únicamente. **Datos simulados** (propiedades, personas, documentos). Esto se aclara en el README y en el video.
- **Producto:** equipo de agentes de IA que gestiona un alquiler de punta a punta, y usa Solana para retener el depósito en garantía, cobrar con descuentos y construir un historial de pagos portable del inquilino.

### Una línea
*AI agents that run a rental from first message to move-out, with on-chain security deposit escrow, automatic discounts for paying with USDC and paying on time, and a portable tenant payment history.*

### Usuarios
- **Tenant (inquilino):** busca, visita, sube documentación, paga.
- **Landlord / agency (propietario o inmobiliaria):** publica propiedades, revisa postulantes, cobra, libera el depósito.

---

## 1. Alcance y prioridades

| Prioridad | Qué | Estado esperado |
|---|---|---|
| **P0 (imprescindible)** | Chat con agentes (consultas → visita → documentos → contrato), pago con USDC por QR (Solana Pay), depósito en escrow, liberación del depósito | Flujo completo en devnet |
| **P1 (muy deseable)** | Descuentos automáticos (por pagar con USDC y por puntualidad), historial de pagos del inquilino on-chain, agente de control cruzado | Visible en la demo |
| **P2 (si sobra tiempo)** | Agente de mantenimiento, agente analista, panel de inmobiliaria | Opcional |
| **Fuera de alcance** | WhatsApp real, KYC real, firma legal de contratos, mainnet, pagos en pesos | Mencionar como "siguientes pasos" en el pitch |

---

## 2. Stack sugerido (Mauro puede cambiarlo)

- **Frontend + backend:** Next.js (App Router) + TypeScript + Tailwind.
- **Agentes:** SDK de Anthropic (Claude) con *tool use*. Modelo y versión: **[VERIFICAR]** en la documentación de Anthropic. Variable de entorno `ANTHROPIC_MODEL` para poder cambiarlo.
- **Base de datos:** SQLite con Prisma o Drizzle (suficiente para el MVP). Alternativa: Supabase.
- **Solana:**
  - `@solana/web3.js` y `@solana/spl-token` **[VERIFICAR]** versión actual (puede haber migrado a `@solana/kit`).
  - **Solana Pay** (`@solana/pay`) para generar el QR/link de pago **[VERIFICAR]**.
  - **Programa de escrow en Anchor (Rust)** desplegado en devnet. Si el tiempo no alcanza, ver el plan B en la sección 5.5.
- **Wallet embebida (creada automáticamente al registrarse):** Privy, Crossmint o Dynamic. **[VERIFICAR]** cuál ofrece soporte de Solana en devnet y plan gratuito. Plan B: wallet generada en el servidor con `Keypair.generate()` solo para la demo, aclarado en el README.
- **Token de pago:** USDC de devnet. **[VERIFICAR]** la dirección (mint) oficial de USDC en devnet. Plan B: crear nuestro propio token SPL de prueba llamado "USDC (devnet test)" con 6 decimales y repartirlo a las wallets de demo.

---

## 3. Estructura de carpetas sugerida

```
tuki-inmobiliario/
├─ README.md                  # en inglés (ver sección 11)
├─ .env.example
├─ app/
│  ├─ page.tsx                # landing + chat
│  ├─ tenant/                 # vista del inquilino (chat, pagos, historial)
│  ├─ landlord/               # vista de inmobiliaria (contratos, pagos)
│  └─ api/
│     ├─ chat/route.ts        # entrada del chat → orquestador
│     ├─ properties/route.ts
│     ├─ visits/route.ts
│     ├─ documents/route.ts
│     ├─ lease/route.ts       # crear contrato + hash
│     ├─ pay/route.ts         # arma la transacción Solana Pay
│     └─ webhook/route.ts     # confirma pago (o polling)
├─ lib/
│  ├─ agents/
│  │  ├─ orchestrator.ts
│  │  ├─ listings.ts          # agente de consultas
│  │  ├─ visits.ts
│  │  ├─ prequal.ts           # agente de precalificación
│  │  ├─ crosscheck.ts        # agente de control cruzado
│  │  ├─ lease.ts             # contrato y cobros
│  │  └─ prompts.ts           # system prompts
│  ├─ solana/
│  │  ├─ connection.ts
│  │  ├─ pay.ts               # Solana Pay
│  │  ├─ escrow.ts            # cliente del programa
│  │  └─ hash.ts              # sha256 de contrato y actas
│  └─ db.ts
├─ programs/
│  └─ rental_escrow/          # programa Anchor
├─ seed/
│  ├─ properties.json         # ~10 propiedades de ejemplo
│  └─ docs/                   # documentos de ejemplo (uno con problema)
└─ scripts/
   ├─ setup-devnet.ts         # crea token de prueba, airdrop, wallets de demo
   └─ seed.ts
```

---

## 4. Agentes

Todos usan el SDK de Anthropic con herramientas (*tools*). El **orquestador** recibe cada mensaje, decide qué agente responde y mantiene el estado de la conversación (etapa del proceso).

### 4.1 Etapas del proceso (estado de la conversación)

`SEARCH → VISIT → DOCUMENTS → CONTRACT → PAYMENT → ACTIVE → MOVE_OUT`

El orquestador guarda la etapa actual en la base de datos y solo habilita las herramientas de esa etapa.

### 4.2 Orquestador
- **Entrada:** mensaje del usuario + estado.
- **Función:** clasificar la intención y delegar al agente correcto. Si la intención no está clara, hace una sola pregunta aclaratoria.
- **Salida:** respuesta al usuario + eventual cambio de etapa.

### 4.3 Agente de consultas (`listings`)
- **Herramientas:** `search_properties({zone, max_price, bedrooms, pets})`, `get_property({id})`.
- **Comportamiento:** propone 2 a 3 propiedades que cumplen, explica por qué, y responde dudas **solo con datos del catálogo**. Si un dato no está, dice que no lo sabe (no inventa).

### 4.4 Agente de visitas (`visits`)
- **Herramientas:** `get_available_slots({property_id})`, `book_visit({property_id, slot, tenant_id})`.
- **Comportamiento:** ofrece 3 horarios, confirma y guarda la visita. Agenda simulada (slots fijos en el seed).

### 4.5 Agente de precalificación (`prequal`)
- **Herramientas:** `read_document({doc_id})` (devuelve texto/campos extraídos), `list_required_documents()`, `save_prequal({tenant_id, status, issues[]})`.
- **Documentos requeridos (simulados):** DNI (imagen/PDF de ejemplo), recibo de sueldo, constancia de ingresos, garantía (o seguro de caución).
- **Comportamiento:** verifica que estén todos, detecta **faltantes y vencimientos**, y devuelve un resultado `APPROVED | NEEDS_INFO | REJECTED` con la lista de problemas.
- **Caso de demo obligatorio:** un recibo de sueldo con fecha de más de 90 días que el agente marca como vencido.

### 4.6 Agente de control cruzado (`crosscheck`)
- **Función:** revisa lo que produjo `prequal` **contra los documentos originales** y busca inconsistencias (por ejemplo, nombre distinto entre DNI y recibo, ingresos que no alcanzan la relación alquiler/ingreso definida).
- **Salida:** `{agrees: boolean, discrepancies: string[]}`.
- **Regla:** si no coincide con `prequal`, el caso pasa a `NEEDS_INFO` y se explica el motivo. Este agente es lo que justifica que el sistema sea realmente multiagente.

### 4.7 Agente de contrato y cobros (`lease`)
- **Herramientas:** `create_lease({tenant_id, property_id, start_date, months, rent_usdc, deposit_usdc})`, `compute_price({lease_id, method, paid_at})`, `create_payment_request({lease_id, kind})`.
- **Comportamiento:** arma el contrato (texto generado desde una plantilla), calcula el hash, y genera el pedido de pago con QR. Explica los dos precios (normal y con descuento).

### 4.8 (P2) Mantenimiento y analista
- **Mantenimiento:** recibe reclamos del inquilino, los clasifica (urgente / normal) y los registra.
- **Analista:** resumen para la inmobiliaria (ocupación, pagos puntuales, reclamos abiertos).

### 4.9 Reglas comunes para todos los agentes (poner en cada *system prompt*)
1. Responder en el idioma del usuario (español rioplatense por defecto).
2. No inventar datos: si falta información, pedirla o decir que no se sabe.
3. **Nunca** pedir ni mostrar datos personales sensibles fuera de lo necesario.
4. Aclarar que es una demo con datos simulados cuando corresponda.
5. No dar asesoramiento legal ni fiscal; sugerir consultar a un profesional.

---

## 5. Solana

### 5.1 Principio de privacidad
**En la cadena solo van hashes, montos, fechas y direcciones de wallet. Nunca nombres, DNI, documentos ni textos del contrato.** El contrato y los documentos viven fuera de la cadena; en la cadena queda su huella (`sha256`).

### 5.2 Modelo de datos on-chain (programa Anchor `rental_escrow`)

**Cuenta `Lease` (PDA con seeds `["lease", landlord, tenant, lease_id]`):**

| Campo | Tipo | Descripción |
|---|---|---|
| `landlord` | Pubkey | Propietario o inmobiliaria |
| `tenant` | Pubkey | Wallet del inquilino |
| `mint` | Pubkey | Token de pago (USDC devnet o token de prueba) |
| `rent_amount` | u64 | Alquiler mensual (unidades mínimas, 6 decimales) |
| `deposit_amount` | u64 | Depósito en garantía |
| `due_day_ts` | i64 | Vencimiento del primer pago (unix timestamp) |
| `period_seconds` | i64 | Duración de cada período (en la demo, configurable para acelerar) |
| `discount_usdc_bps` | u16 | Descuento por pagar en USDC, en puntos base (ej. 300 = 3%) |
| `discount_ontime_bps` | u16 | Descuento por puntualidad (ej. 200 = 2%) |
| `contract_hash` | [u8; 32] | sha256 del contrato |
| `entry_report_hash` | [u8; 32] | sha256 del acta de estado al ingresar |
| `exit_report_hash` | [u8; 32] | sha256 del acta de salida (se completa al final) |
| `deposit_held` | bool | Si el depósito está retenido |
| `months_paid` | u16 | Cantidad de períodos pagados |
| `on_time_streak` | u16 | Racha de pagos puntuales |
| `status` | enum | `Created`, `Active`, `Closed` |
| `bump` | u8 | Bump del PDA |

**Cuenta `PaymentRecord` (PDA con seeds `["payment", lease, month_index]`):**

| Campo | Tipo | Descripción |
|---|---|---|
| `lease` | Pubkey | Contrato asociado |
| `tenant` | Pubkey | Inquilino |
| `month_index` | u16 | Número de período |
| `amount_paid` | u64 | Monto efectivamente pagado |
| `discount_applied_bps` | u16 | Descuento aplicado |
| `paid_at` | i64 | Hora de la transacción (Clock de Solana) |
| `on_time` | bool | Si fue puntual |

> **El historial del inquilino es la lista de sus `PaymentRecord`.** No hace falta un NFT para el MVP. Si sobra tiempo, se puede sumar una insignia con NFT comprimido (Metaplex Bubblegum **[VERIFICAR]**).

### 5.3 Instrucciones del programa

1. **`create_lease(params)`**: crea la cuenta `Lease` con montos, fechas, descuentos y hashes. Firma el `landlord`.
2. **`deposit_escrow()`**: el `tenant` transfiere `deposit_amount` a una cuenta de tokens controlada por el PDA del contrato (la *vault*). Marca `deposit_held = true`.
3. **`pay_rent(month_index)`**: el `tenant` paga el período.
   - Calcula `discount_bps = discount_usdc_bps + (on_time ? discount_ontime_bps : 0)`.
   - `on_time = Clock::get()?.unix_timestamp <= due_ts_del_período`, donde `due_ts = due_day_ts + month_index * period_seconds`.
   - `amount = rent_amount * (10_000 - discount_bps) / 10_000` (usar aritmética entera y `checked_*`).
   - Transfiere `amount` del tenant al landlord, crea el `PaymentRecord`, suma `months_paid` y actualiza `on_time_streak` (se reinicia en 0 si no fue puntual).
4. **`release_deposit(to_tenant, to_landlord, reason_hash)`**: firma el `landlord` (para la demo, además el `tenant` aprueba). Reparte el depósito entre ambos (deducción justificada con `reason_hash`), actualiza `exit_report_hash` y cierra el contrato (`status = Closed`).

**Validaciones obligatorias:** que `to_tenant + to_landlord == depósito`, que el período no se haya pagado antes, que firme quien corresponde, y que ninguna operación aritmética desborde.

### 5.4 Descuentos (reglas de negocio)
- Descuento por **pagar con USDC por Solana Pay**: `discount_usdc_bps` (ejemplo **300 = 3%**).
- Descuento por **puntualidad**: `discount_ontime_bps` (ejemplo **200 = 2%**).
- Se **suman** (ejemplo: 5% total pagando en USDC y a tiempo).
- **Los porcentajes son ilustrativos** y se validan con una inmobiliaria. **No deben estar fijos en el código**: viven en la cuenta `Lease` y se configuran al crear el contrato.
- La puntualidad se calcula **con la hora de la transacción on-chain**, nunca con un botón de "ya pagué".
- Para comparar en la demo, en la interfaz se muestra el precio normal (fuera de Solana, sin descuento) y el precio con descuento.

### 5.5 Plan B si el programa Anchor no llega a tiempo
Si el escrow propio se complica, simplificarlo así sin romper la demo:
- El depósito se transfiere a una **wallet de custodia** de la plataforma (en devnet) y se registra el movimiento.
- Los hashes (contrato, actas) y cada pago se registran con el **programa Memo** de Solana **[VERIFICAR]**, con un texto breve tipo `tuki:lease:<id>:payment:<mes>:<hash>`.
- Los descuentos se calculan en el backend con la **hora de la transacción confirmada**.
- **En el README y en el video hay que decir claramente que el escrow es de custodia** y que el programa on-chain queda como siguiente paso. No presentarlo como programa si no lo es.

### 5.6 Solana Pay
- Generar un **transaction request** o una URL de transferencia con el monto calculado (con descuento), el mint del token y una *reference* única para poder identificar el pago.
- Mostrar el QR en el chat. Confirmar el pago consultando la red por la *reference* (polling cada pocos segundos).
- Al confirmarse, el backend actualiza el estado y el chat avisa al usuario con el link al explorador (`https://explorer.solana.com/tx/<firma>?cluster=devnet`).

### 5.7 Hashes
- `sha256` del texto final del contrato, del acta de ingreso y del acta de salida (en `lib/solana/hash.ts`).
- Guardar el hash on-chain y el documento fuera de la cadena. En la interfaz, un botón **"Verificar"** vuelve a calcular el hash del documento y lo compara con el on-chain.

---

## 6. Modelo de datos off-chain (DB)

- **User:** `id`, `role (tenant|landlord)`, `name` (simulado), `wallet_address`.
- **Property:** `id`, `landlord_id`, `title`, `zone`, `price_usdc`, `bedrooms`, `pets_allowed`, `description`, `photos[]`.
- **Visit:** `id`, `property_id`, `tenant_id`, `slot`, `status`.
- **Document:** `id`, `tenant_id`, `type`, `file_path`, `extracted_fields (JSON)`, `issue_date`.
- **Prequal:** `tenant_id`, `status`, `issues (JSON)`, `crosscheck (JSON)`.
- **Lease:** `id`, `property_id`, `tenant_id`, `onchain_address`, `contract_text`, `contract_hash`, `stage`.
- **Conversation / Message:** `id`, `user_id`, `stage`, `messages[]`.

---

## 7. Interfaz (mínima pero clara)

### Vista inquilino
- Chat con los agentes.
- Zona de carga de documentos.
- **Pantalla de pago:** monto normal tachado, **monto con descuento**, desglose (3% USDC + 2% puntual), QR de Solana Pay y la insignia **"Pago puntual"**.
- **Mi historial:** lista de pagos (con link al explorador), racha de puntualidad.

### Vista inmobiliaria (P2)
- Lista de contratos y estado de pagos.
- Botón **"Liberar depósito"** con campo de motivo.

### Barra de transparencia (útil para el jurado)
- Una franja visible que diga **"Demo · Solana devnet · simulated data"**.

---

## 8. Datos de ejemplo (seed)

- **10 propiedades** en distintas zonas de Salta, con precio mensual en USDC (ej. entre 250 y 700), ambientes y si admiten mascotas.
- **3 inquilinos de ejemplo:**
  1. **Ana:** documentación completa → aprobada.
  2. **Bruno:** recibo de sueldo vencido → `NEEDS_INFO` (caso de demo del agente de precalificación).
  3. **Carla:** nombre distinto entre DNI y recibo → lo detecta el agente de control cruzado.
- **2 propietarios** de ejemplo.
- Slots de visita fijos para los próximos días.
- Documentos de ejemplo (PDF o texto) generados para estos casos. Nada de documentos reales.

---

## 9. Variables de entorno (`.env.example`)

```
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=                # [VERIFICAR] modelo vigente
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
PAYMENT_MINT=                   # mint de USDC devnet o token de prueba propio
PLATFORM_KEYPAIR_PATH=          # keypair de la plataforma (solo devnet)
PROGRAM_ID=                     # ID del programa Anchor desplegado
EMBEDDED_WALLET_APP_ID=         # Privy / Crossmint / Dynamic
DATABASE_URL=
NEXT_PUBLIC_EXPLORER_URL=https://explorer.solana.com
```

**Nunca subir claves privadas ni `.env` al repo.** Agregarlos al `.gitignore`.

---

## 10. Orden de trabajo y criterios de aceptación

| # | Tarea | Fechas | Criterio de aceptación |
|---|---|---|---|
| 1 | Repo, stack, seed, `setup-devnet.ts` | 3 a 4/10 | El proyecto corre localmente y hay wallets con fondos de prueba |
| 2 | Orquestador + agentes de consultas y visitas | 5 a 6/10 | Desde el chat se encuentra una propiedad y se agenda una visita |
| 3 | Agentes de precalificación y control cruzado | 6 a 7/10 | Los 3 casos de demo (Ana, Bruno, Carla) dan el resultado esperado |
| 4 | Contrato + hashes + pantalla de pago | 7 a 8/10 | Se genera el contrato y se muestra el precio con y sin descuento |
| 5 | Programa Anchor (o plan B) + escrow | 8 a 9/10 | El depósito queda retenido y se ve en el explorador |
| 6 | Solana Pay + `pay_rent` + descuentos + historial | 8 a 9/10 | Pago por QR confirmado, descuento correcto, `PaymentRecord` visible |
| 7 | `release_deposit` + verificación de hash | 9 a 10/10 | El depósito se libera y el botón "Verificar" valida el contrato |
| 8 | Wallet embebida y pulido de la interfaz | 10/10 | Un usuario nuevo completa el flujo sin instalar nada |
| 9 | Pruebas de punta a punta y corrección de errores | 10/10 | El flujo completo corre 3 veces seguidas sin fallar |
| 10 | **Congelar el código**, README, video y demo | 11/10 | Todo grabado y subido a un lugar accesible |
| 11 | **Entrega en Colosseum y Earn** | 12/10 | Confirmación de ambas entregas **antes de las 23:59** |

### Pruebas mínimas
- **Programa:** descuento correcto en 4 casos (sin descuento, solo USDC, solo puntual, ambos); pago duplicado rechazado; liberación con montos que no suman rechazada; firma incorrecta rechazada.
- **Agentes:** que no inventen datos fuera del catálogo y que el caso de Bruno y el de Carla se detecten siempre.
- **Flujo completo:** de la primera consulta a la liberación del depósito.

---

## 11. Qué debe tener el repositorio para la entrega

- **Repositorio de GitHub**, público o compartido con `hackathon@superteam.ar` y `hackathon@colosseum.com`.
- **README en inglés** con: qué problema resuelve, cómo funcionan los agentes, **qué usa de Solana y por qué**, cómo correrlo, **qué es simulado** y **qué se construyó durante el hackathon**.
- **Aclaración sobre código previo:** si se reutiliza algo de Tuki, dejarlo explícito en el README (qué módulos, qué commits). **Confirmar en las reglas oficiales del hackathon si se permite** y trabajar en un repositorio y commits nuevos para que quede claro qué se hizo ahora.
- Enlaces a las transacciones de ejemplo en el explorador de devnet.

### Otros requisitos de la entrega (los prepara Ani)
Video de pitch de 2 minutos, demo de hasta 3 minutos, nombre, logo, descripción, lista de blockchains y herramientas, go-to-market con validación, y equipo. Todo en inglés.

---

## 12. Guion de la demo (3 minutos) — para saber qué tiene que verse

1. **0:00–0:30** El problema (lo cuenta Ani).
2. **0:30–1:30** Chat con los agentes: se busca una propiedad, se agenda la visita y se suben documentos. Se ve cómo el agente **detecta el recibo vencido** y cómo el agente de control cruzado coincide o marca una discrepancia.
3. **1:30–2:30** Contrato generado, **pantalla con dos precios** y pago por QR. Se ve el **depósito retenido** y la transacción en el explorador de devnet.
4. **2:30–3:00** Liberación del depósito, historial del inquilino con su pago puntual y botón **"Verificar"** del hash del contrato.

---

## 13. Riesgos y qué hacer

| Riesgo | Plan |
|---|---|
| El programa Anchor se complica | Plan B de la sección 5.5, dicho con honestidad |
| La wallet embebida no soporta devnet o requiere aprobación | Wallet generada en el servidor solo para la demo |
| Solana Pay falla en vivo | Grabar la demo con un flujo ya probado y tener un video de respaldo |
| Límite de uso o fallas de la API de IA | Respuestas guardadas para los 3 casos de demo (modo "replay") |
| Faltan datos reales | Todo simulado y **aclarado** en el README y el video |
| Falta de tiempo | Recortar P2 y mantener P0 y P1 |

---

## 14. Notas legales y de seguridad (no tocar sin consultar)

- **No es asesoramiento legal ni fiscal.** El esquema de depósito en USDC es una **opción voluntaria** y no reemplaza el contrato legal. Las normas de alquileres y de pagos en cripto en Argentina cambian, así que **no citar leyes en el pitch sin verificarlas con un profesional**.
- **Datos personales:** nunca en la cadena. Los documentos de demo son simulados.
- **Claves:** nunca en el repositorio. Usar solo devnet.
- Aclarar siempre en la interfaz que se trata de una demo.
