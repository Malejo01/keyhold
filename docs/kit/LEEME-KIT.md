# Kit de arranque — Tuki (para Mauro)

## Cómo usarlo (5 minutos)

1. Creá el repo **nuevo** y vacío `tuki-rentals`. Clonalo.
2. Copiá **todo** el contenido de este kit en la raíz del repo, incluida la carpeta oculta `.claude/`.
3. Commit inicial:

   ```
   git add -A
   git commit -m "chore: project kit (docs, dev agents)"
   git tag v0-hackathon-start
   git push --tags
   ```

4. Abrí Claude Code en la raíz y verificá que aparezcan los 8 agentes con `/agents`.
5. Pegá el contenido completo de `KICKOFF_PROMPT.md` como primer mensaje.
6. Revisá `PLAN.md`, contestá las 3 preguntas y decí **"OK F0"**.
7. **Antes de F0:** pedí SOL de devnet en faucet.solana.com para la wallet de plataforma.

## Qué hay en el kit

| Archivo | Para qué |
|---|---|
| `KICKOFF_PROMPT.md` | Prompt de arranque: fases, agentes, tiempos, qué devolver |
| `CLAUDE.md` | Reglas permanentes del repo (Claude Code lo lee siempre) |
| `.claude/agents/*.md` | 8 subagentes de desarrollo con rutas propias y definición de "listo" |
| `docs/01-spec-mvp.md` | Spec original del equipo, sin cambios |
| `docs/02-hackathon-rules-market-judges.md` | Reglas, formularios, mercado y jueces (investigación del 03/10) |
| `docs/03-architecture-decisions.md` | Decisiones que pisan la spec (AD-01 a AD-14) |
| `docs/04-brand-handoff.md` | Protocolo de marca con Claude Design para Ani y su compañero |
| `CHANGELOG.md` | Changelog semanal que exige Superteam Earn |

## Pendiente de tu lado

- Los módulos de Qué Pinta Salta que quieras reutilizar. Entran en un commit `chore(import)` aparte y se declaran en el README.
- Pasarle a Ani `docs/04-brand-handoff.md` para que sepa qué entregar y cuándo (jueves 08/10 a las 12:00).
